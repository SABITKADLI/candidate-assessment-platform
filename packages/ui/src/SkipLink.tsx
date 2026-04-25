'use client';

export function SkipLink() {
  return (
    <a
      href="#main-content"
      style={{
        position: 'absolute',
        left: '-9999px',
        top: 'auto',
        width: 1,
        height: 1,
        overflow: 'hidden',
      }}
      onFocus={(e) => {
        e.currentTarget.style.cssText =
          'position:fixed;top:8px;left:8px;width:auto;height:auto;padding:8px 14px;background:var(--cap-accent);color:#fff;font-size:13px;font-weight:600;border-radius:var(--cap-radius-md);z-index:9999;outline:none;';
      }}
      onBlur={(e) => {
        e.currentTarget.style.cssText =
          'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;';
      }}
    >
      Skip to content
    </a>
  );
}
