import { MainSidebar }        from '@/components/layout/MainSidebar';
import { Topbar }              from '@/components/layout/Topbar';
import { QueryProvider }       from '@/components/providers/QueryProvider';
import { BrandingSync }        from '@/components/BrandingSync';
import { AuthSync }            from '@/components/AuthSync';
import { EventWarningSystem }  from '@/components/EventWarningSystem';
import { ChatProvider }        from '@/context/ChatContext';
import { ChatBarContainer }    from '@/components/chat/ChatBarContainer';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <BrandingSync />
      <AuthSync />
      <EventWarningSystem />
      <ChatProvider>
        <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}>
          <Topbar />

          <div className="flex flex-1 min-h-0 overflow-hidden">
            <MainSidebar />
            <main className="flex-1 min-w-0 overflow-auto" style={{ backgroundColor: 'var(--bg-base)' }}>
              {children}
            </main>
          </div>
        </div>
        <ChatBarContainer />
      </ChatProvider>
    </QueryProvider>
  );
}
