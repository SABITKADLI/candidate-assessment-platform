'use client';

import { useEffect, useRef, useState } from 'react';
import { AntibotClient } from '@cap/antibot/client';
import type { StageKey } from '@cap/shared';
import { TapSeqPuzzle } from './TapSeqPuzzle';

interface PuzzleState { kind: 'tap_seq'; seed: string }

export function AntibotBoot({ stageKey }: { stageKey: StageKey }) {
  const [puzzle, setPuzzle] = useState<PuzzleState | null>(null);
  // Ref mirrors state for the antibot callback (which closes over stale state).
  const puzzleLiveRef = useRef<boolean>(false);
  const clientRef = useRef<AntibotClient | null>(null);

  useEffect(() => {
    const c = new AntibotClient(stageKey, {
      onFlushResponse: (r) => {
        if (!r.puzzle || puzzleLiveRef.current) return;
        // Only handle puzzle kinds we've implemented. Unknown -> ignore.
        if (r.puzzle.kind !== 'tap_seq') return;
        puzzleLiveRef.current = true;
        setPuzzle({ kind: 'tap_seq', seed: r.puzzle.seed });
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
  return (
    <TapSeqPuzzle
      seed={puzzle.seed}
      onSolved={() => {
        clientRef.current?.emit('puzzle.solved', { kind: puzzle.kind });
        puzzleLiveRef.current = false;
        setPuzzle(null);
      }}
      onFailed={() => {
        clientRef.current?.emit('puzzle.failed', { kind: puzzle.kind });
        puzzleLiveRef.current = false;
        setPuzzle(null);
      }}
    />
  );
}
