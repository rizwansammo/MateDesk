export function BrandLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const markSz = size === 'lg' ? 36 : size === 'sm' ? 22 : 28;
  const textSz = size === 'lg' ? 24 : size === 'sm' ? 14 : 18;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size === 'sm' ? 8 : 10 }}>
      <div
        style={{
          width: markSz, height: markSz,
          background: '#1F4ED8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" width={markSz * 0.625} height={markSz * 0.625}>
          <path d="M3 4h18v9.5l-4.5 0-1.8 2.5h-5.4l-1.8 -2.5h-4.5z" fill="#fff" />
          <path d="M3 13.5v6.5h18v-6.5" stroke="#fff" strokeWidth="1.5" fill="none" />
        </svg>
      </div>
      <span
        style={{
          fontFamily: 'var(--font-hemi), sans-serif',
          fontWeight: 700,
          fontSize: textSz,
          lineHeight: 1,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'inherit',
          position: 'relative',
          top: 2,
          whiteSpace: 'nowrap',
        }}
      >
        Mate<span style={{ color: '#1F4ED8' }}>Desk</span>
      </span>
    </div>
  );
}
