import type { CSSProperties } from 'react';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}

export function Skeleton({ width = '100%', height = 14, radius = 'var(--cap-radius-sm)', style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className="cap-skeleton"
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}
