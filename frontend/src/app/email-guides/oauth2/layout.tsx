import type { Metadata } from 'next';

const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME || 'MateDesk';

// The page itself is a client component, so metadata has to live in a layout.
// This page is in the sitemap and targets a real long-tail search MSPs make when
// wiring a tenant mailbox to a ticketing system.
export const metadata: Metadata = {
  title: 'Connect Microsoft 365 or Google Workspace with OAuth2',
  description:
    'Step-by-step guide to connecting a Microsoft 365 or Google Workspace mailbox to '
    + `${PRODUCT_NAME} using OAuth2, so inbound email becomes tickets without storing a password.`,
  alternates: { canonical: '/email-guides/oauth2' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
