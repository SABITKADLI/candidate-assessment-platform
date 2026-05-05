import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

let _s3: S3Client | null = null;
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

export async function sampleVideoFrames(args: {
  attemptId: string;
  sourceS3Key: string;
}): Promise<string[]> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket || !args.sourceS3Key) return [];

  const workdir = await mkdtemp(join(tmpdir(), 'cap-frames-'));
  const inputPath = join(workdir, 'input.media');
  try {
    const obj = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: args.sourceS3Key }));
    const body = obj.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
    const bytes = body?.transformToByteArray ? await body.transformToByteArray() : new Uint8Array();
    await writeFile(inputPath, bytes);

    const outPattern = join(workdir, 'frame-%03d.jpg');
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', inputPath,
      '-vf', 'fps=1/5,scale=-2:720',
      '-frames:v', '12',
      outPattern,
    ], { timeout: 120_000 });

    const keys: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const file = join(workdir, `frame-${String(i).padStart(3, '0')}.jpg`);
      let data: Buffer;
      try {
        data = await readFile(file);
      } catch {
        break;
      }
      const key = `transcripts/${args.attemptId}/frames/frame-${String(i).padStart(3, '0')}.jpg`;
      await s3().send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: 'image/jpeg',
      }));
      keys.push(key);
    }
    return keys;
  } catch {
    return [];
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
  }
}
