import { PublicSignupModeProvider } from '@/hooks/usePublicSignupMode';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const isSingleTenant = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'single_tenant';

  return (
    <div
      style={{
        background: isSingleTenant ? 'var(--bg-base)' : '#fff',
        color: isSingleTenant ? 'var(--text-1)' : '#0B1220',
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
        minHeight: '100%',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <PublicSignupModeProvider>{children}</PublicSignupModeProvider>
    </div>
  );
}
