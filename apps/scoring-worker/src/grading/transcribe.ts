import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  GetTranscriptionJobCommand,
  StartTranscriptionJobCommand,
  TranscribeClient,
} from '@aws-sdk/client-transcribe';
import { sql, auditLog } from '@cap/db';
import type { StageAttemptRow } from './types.js';
import { computeProsody, type ProsodySummary, type WordConfidence } from './prosody.js';

export interface TranscriptResult {
  ready: boolean;
  failed?: boolean;
  delay_ms?: number;
  transcript?: {
    text: string;
    word_confidence: WordConfidence[];
    prosody: ProsodySummary;
    source_s3_key: string;
    transcript_s3_key: string | null;
    flags: Array<'multiple_speakers' | 'transcript_low_confidence' | 'media_corrupt'>;
  };
}

let _s3: S3Client | null = null;
let _transcribe: TranscribeClient | null = null;

function s3(): S3Client {
  _s3 ??= new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
        }
      : undefined,
  });
  return _s3;
}

function transcribe(): TranscribeClient {
  _transcribe ??= new TranscribeClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
        }
      : undefined,
  });
  return _transcribe;
}

export async function ensureTranscript(attempt: StageAttemptRow): Promise<TranscriptResult> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return failedTranscript(attempt, 'S3_BUCKET not configured');

  const source = await findSourceS3Key(attempt);
  if (!source) return failedTranscript(attempt, 'media artifact missing');

  const [existing] = await sql<Array<{
    transcribe_job: string;
    status: string;
    transcript_s3_key: string | null;
    text: string | null;
    word_confidence: WordConfidence[] | null;
    prosody: ProsodySummary | null;
    created_at: Date;
  }>>`
    SELECT transcribe_job, status, transcript_s3_key, text, word_confidence, prosody, created_at
    FROM app.transcripts
    WHERE stage_attempt_id = ${attempt.id}::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!existing) {
    const jobName = `cap-${attempt.id.replace(/-/g, '')}`;
    const outputKey = `transcripts/${attempt.id}.json`;
    await transcribe().send(new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      LanguageCode: normalizeLanguage(attempt.session_locale),
      Media: { MediaFileUri: `s3://${bucket}/${source}` },
      OutputBucketName: bucket,
      OutputKey: outputKey,
      Settings: {
        ShowSpeakerLabels: true,
        MaxSpeakerLabels: 2,
        ShowAlternatives: false,
      },
    }));
    await sql`
      INSERT INTO app.transcripts (stage_attempt_id, source_s3_key, transcribe_job, status, transcript_s3_key)
      VALUES (${attempt.id}::uuid, ${source}, ${jobName}, 'queued', ${outputKey})
    `;
    await auditLog('scoring-worker', 'transcribe.start', `stage_attempt:${attempt.id}`, {
      stage_key: attempt.stage_key,
      source_s3_key: source,
      transcribe_job: jobName,
    });
    return { ready: false, delay_ms: pollIntervalMs() };
  }

  if (existing.status === 'completed' && existing.text != null) {
    const words = existing.word_confidence ?? [];
    const prosody = existing.prosody ?? computeProsody(words);
    return {
      ready: true,
      transcript: {
        text: existing.text,
        word_confidence: words,
        prosody,
        source_s3_key: source,
        transcript_s3_key: existing.transcript_s3_key,
        flags: transcriptFlags(prosody),
      },
    };
  }

  if (existing.status === 'failed') {
    return failedTranscript(attempt, 'transcription failed', source, existing.transcript_s3_key);
  }

  const elapsed = Date.now() - existing.created_at.getTime();
  if (elapsed > timeoutMs()) {
    await sql`
      UPDATE app.transcripts
         SET status = 'failed', completed_at = now()
       WHERE stage_attempt_id = ${attempt.id}::uuid
         AND transcribe_job = ${existing.transcribe_job}
    `;
    await auditLog('scoring-worker', 'transcribe.failed', `stage_attempt:${attempt.id}`, {
      reason: 'timeout',
      transcribe_job: existing.transcribe_job,
    });
    return failedTranscript(attempt, 'transcription timeout', source, existing.transcript_s3_key);
  }

  const job = await transcribe().send(new GetTranscriptionJobCommand({
    TranscriptionJobName: existing.transcribe_job,
  }));
  const status = job.TranscriptionJob?.TranscriptionJobStatus;
  if (status === 'FAILED') {
    await sql`
      UPDATE app.transcripts
         SET status = 'failed', completed_at = now()
       WHERE stage_attempt_id = ${attempt.id}::uuid
         AND transcribe_job = ${existing.transcribe_job}
    `;
    await auditLog('scoring-worker', 'transcribe.failed', `stage_attempt:${attempt.id}`, {
      transcribe_job: existing.transcribe_job,
      reason: job.TranscriptionJob?.FailureReason ?? null,
    });
    return failedTranscript(attempt, 'transcription failed', source, existing.transcript_s3_key);
  }

  if (status !== 'COMPLETED') {
    await sql`
      UPDATE app.transcripts
         SET status = 'in_progress'
       WHERE stage_attempt_id = ${attempt.id}::uuid
         AND transcribe_job = ${existing.transcribe_job}
    `;
    return { ready: false, delay_ms: pollIntervalMs() };
  }

  const transcriptKey = existing.transcript_s3_key ?? `transcripts/${attempt.id}.json`;
  const parsed = await fetchTranscriptJson(bucket, transcriptKey);
  const words = extractWords(parsed);
  const prosody = computeProsody(words);
  const text = extractTranscriptText(parsed);

  await sql`
    UPDATE app.transcripts
       SET status = 'completed',
           transcript_s3_key = ${transcriptKey},
           text = ${text},
           word_confidence = ${sql.json(words as never)},
           prosody = ${sql.json(prosody as never)},
           completed_at = now()
     WHERE stage_attempt_id = ${attempt.id}::uuid
       AND transcribe_job = ${existing.transcribe_job}
  `;
  await auditLog('scoring-worker', 'transcribe.done', `stage_attempt:${attempt.id}`, {
    transcribe_job: existing.transcribe_job,
    mean_word_confidence: prosody.mean_word_confidence,
    speaker_count: prosody.speaker_count,
  });

  return {
    ready: true,
    transcript: {
      text,
      word_confidence: words,
      prosody,
      source_s3_key: source,
      transcript_s3_key: transcriptKey,
      flags: transcriptFlags(prosody),
    },
  };
}

async function findSourceS3Key(attempt: StageAttemptRow): Promise<string | null> {
  const artifactId = typeof attempt.raw_payload.artifact_id === 'string'
    ? attempt.raw_payload.artifact_id
    : null;
  const rows = artifactId
    ? await sql<Array<{ s3_key: string }>>`
        SELECT s3_key FROM app.artifacts
        WHERE id = ${artifactId}::uuid AND session_id = ${attempt.session_id}::uuid
        LIMIT 1
      `
    : await sql<Array<{ s3_key: string }>>`
        SELECT s3_key FROM app.artifacts
        WHERE session_id = ${attempt.session_id}::uuid
          AND stage_key = ${attempt.stage_key}::app.stage_key
        ORDER BY created_at DESC
        LIMIT 1
      `;
  return rows[0]?.s3_key ?? null;
}

async function failedTranscript(
  attempt: StageAttemptRow,
  reason: string,
  source_s3_key = '',
  transcript_s3_key: string | null = null,
): Promise<TranscriptResult> {
  await auditLog('scoring-worker', 'transcribe.failed', `stage_attempt:${attempt.id}`, {
    stage_key: attempt.stage_key,
    reason,
  }).catch(() => undefined);
  return {
    ready: true,
    failed: true,
    transcript: {
      text: '',
      word_confidence: [],
      prosody: computeProsody([]),
      source_s3_key,
      transcript_s3_key,
      flags: ['media_corrupt', 'transcript_low_confidence'],
    },
  };
}

async function fetchTranscriptJson(bucket: string, key: string): Promise<unknown> {
  const obj = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = obj.Body as { transformToString?: () => Promise<string> } | undefined;
  const text = body?.transformToString
    ? await body.transformToString()
    : '';
  return JSON.parse(text);
}

function extractTranscriptText(raw: unknown): string {
  const root = raw as { results?: { transcripts?: Array<{ transcript?: string }> } };
  return root.results?.transcripts?.[0]?.transcript ?? '';
}

function extractWords(raw: unknown): WordConfidence[] {
  const root = raw as {
    results?: {
      items?: Array<{
        type?: string;
        start_time?: string;
        end_time?: string;
        alternatives?: Array<{ content?: string; confidence?: string }>;
        speaker_label?: string;
      }>;
    };
  };

  return (root.results?.items ?? [])
    .filter((item) => item.type === 'pronunciation')
    .map((item) => ({
      w: item.alternatives?.[0]?.content ?? '',
      start: Number(item.start_time ?? 0),
      end: Number(item.end_time ?? item.start_time ?? 0),
      conf: Number(item.alternatives?.[0]?.confidence ?? 0),
      speaker: item.speaker_label,
    }))
    .filter((word) => word.w.length > 0);
}

function transcriptFlags(prosody: ProsodySummary): Array<'multiple_speakers' | 'transcript_low_confidence'> {
  const flags: Array<'multiple_speakers' | 'transcript_low_confidence'> = [];
  if (prosody.speaker_count > 1) flags.push('multiple_speakers');
  if (prosody.mean_word_confidence < 0.7) flags.push('transcript_low_confidence');
  return flags;
}

function normalizeLanguage(locale: string | null): 'en-US' {
  return locale?.toLowerCase().startsWith('en') ? 'en-US' : 'en-US';
}

function pollIntervalMs(): number {
  return Number(process.env.TRANSCRIBE_POLL_INTERVAL_MS ?? 15_000);
}

function timeoutMs(): number {
  return Number(process.env.TRANSCRIBE_TIMEOUT_MS ?? 600_000);
}
