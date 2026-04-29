'use client';

import { useEffect, useRef, useState } from 'react';
import { AntibotClient } from '@cap/antibot/client';
import type { StageKey } from '@cap/shared';
import { TapSeqPuzzle } from './TapSeqPuzzle';
import { WordMatchPuzzle } from './WordMatchPuzzle';
import { MathPuzzle } from './MathPuzzle';

type PuzzleKind = 'tap_seq' | 'word_match' | 'math_simple';
interface PuzzleState { kind: PuzzleKind; seed: string }

const HANDLED_KINDS = new Set<string>(['tap_seq', 'word_match', 'math_simple']);

export function AntibotBoot({ stageKey }: { stageKey: StageKey }) {
  const [puzzle, setPuzzle] = useState<PuzzleState | null>(null);
  const puzzleLiveRef = useRef<boolean>(false);
  const clientRef = useRef<AntibotClient | null>(null);

  useEffect(() => {
    const c = new AntibotClient(stageKey, {
      onFlushResponse: (r) => {
        if (!r.puzzle || puzzleLiveRef.current) return;
        if (!HANDLED_KINDS.has(r.puzzle.kind)) return;
        puzzleLiveRef.current = true;
        setPuzzle({ kind: r.puzzle.kind as PuzzleKind, seed: r.puzzle.seed });
        c.emit('puzzle.shown', { kind: r.puzzle.kind });
      },
    });
    clientRef.current = c;
    c.start();
    return () => {
      c.stop();
      clientRef.current = null;
    };
  }, [stageKey]);

  if (!puzzle) return null;

  const onSolved = () => {
    clientRef.current?.emit('puzzle.solved', { kind: puzzle.kind });
    puzzleLiveRef.current = false;
    setPuzzle(null);
  };
  const onFailed = () => {
    clientRef.current?.emit('puzzle.failed', { kind: puzzle.kind });
    puzzleLiveRef.current = false;
    setPuzzle(null);
  };

  if (puzzle.kind === 'tap_seq') {
    return <TapSeqPuzzle seed={puzzle.seed} onSolved={onSolved} onFailed={onFailed} />;
  }
  if (puzzle.kind === 'word_match') {
    return <WordMatchPuzzle seed={puzzle.seed} onSolved={onSolved} onFailed={onFailed} />;
  }
  if (puzzle.kind === 'math_simple') {
    return <MathPuzzle seed={puzzle.seed} onSolved={onSolved} onFailed={onFailed} />;
  }
  return null;
}
