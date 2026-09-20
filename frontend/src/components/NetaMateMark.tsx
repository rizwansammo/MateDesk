export function NetaMateMark({
  size = 28,
  color = 'currentColor',
}: {
  size?: number;
  color?: string;
}) {
  const height = Math.round(size * 494 / 521);

  return (
    <span
      role="img"
      aria-label="NetaMate"
      style={{
        display: 'block',
        width: size,
        height,
        flexShrink: 0,
        backgroundColor: color,
        WebkitMaskImage: 'url("/netamate-logo.png")',
        maskImage: 'url("/netamate-logo.png")',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}
