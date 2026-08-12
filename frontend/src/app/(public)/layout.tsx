export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', color: '#0B1220', fontFamily: 'var(--font-inter), system-ui, sans-serif', height: '100%', overflowY: 'auto' }}>
      {children}
    </div>
  );
}
