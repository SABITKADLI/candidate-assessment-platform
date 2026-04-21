'use client';

import { useEffect } from 'react';
import { AntibotClient } from '@cap/antibot/client';
import type { StageKey } from '@cap/shared';

export function AntibotBoot({ stageKey }: { stageKey: StageKey }) {
  useEffect(() => {
    const c = new AntibotClient(stageKey, {
      onFlushResponse: (r) => {
        if (r.flush_now) {
          // Server asked us to flush more aggressively; trigger one immediate flush.
          // (No public flush() method — interval will take care of it shortly.)
        }
      },
    });
    c.start();
    return () => c.stop();
  }, [stageKey]);
  return null;
}
