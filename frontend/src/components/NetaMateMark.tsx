export function NetaMateMark({
  size = 28,
  color = 'currentColor',
}: {
  size?: number;
  color?: string;
}) {
  const height = Math.round(size * 494 / 521);

  return (
    <svg
      viewBox="0 0 521 494"
      width={size}
      height={height}
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', color }}
    >
      <path
        d="M91 3L90 120L304 324L432 202L433 413L517 413L518 4L303 207L91 3Z"
        fill="currentColor"
      />
      <path
        d="M2 81L2 490L87 490L88 279L310 490L308 373L2 81Z"
        fill="currentColor"
      />
    </svg>
  );
}
