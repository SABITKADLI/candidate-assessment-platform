export interface WordConfidence {
  w: string;
  start: number;
  end: number;
  conf: number;
  speaker?: string;
}

export interface ProsodySummary {
  pace_words_per_sec: number;
  filler_ratio: number;
  pause_distribution_ms: number[];
  mean_word_confidence: number;
  speaker_count: number;
}

const FILLERS = new Set(['um', 'uh', 'erm', 'ah', 'like', 'you know']);

export function computeProsody(words: WordConfidence[]): ProsodySummary {
  if (!words.length) {
    return {
      pace_words_per_sec: 0,
      filler_ratio: 0,
      pause_distribution_ms: [],
      mean_word_confidence: 0,
      speaker_count: 0,
    };
  }

  const first = words[0]!;
  const last = words[words.length - 1]!;
  const duration = Math.max(0.001, last.end - first.start);
  const fillers = words.filter((word) => FILLERS.has(word.w.toLowerCase())).length;
  const pauses: number[] = [];
  for (let i = 1; i < words.length; i++) {
    const previous = words[i - 1]!;
    const current = words[i]!;
    const gapMs = Math.round((current.start - previous.end) * 1000);
    if (gapMs > 800) pauses.push(gapMs);
  }
  const speakers = new Set(words.map((word) => word.speaker).filter(Boolean));

  return {
    pace_words_per_sec: round3(words.length / duration),
    filler_ratio: round3(fillers / words.length),
    pause_distribution_ms: pauses,
    mean_word_confidence: round3(words.reduce((sum, word) => sum + word.conf, 0) / words.length),
    speaker_count: speakers.size || 1,
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
