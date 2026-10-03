/** Original MateDesk blue inbox mark shared by both product deployments. */
export function MateDeskMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      aria-label="MateDesk"
      role="img"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect width="32" height="32" fill="#1F4ED8" />
      <path d="M4 7h24v12l-6 0-2.4 3.3h-7.2L10 19H4z" fill="#ffffff" />
      <path d="M4 19v6h24v-6" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="square" />
    </svg>
  );
}
