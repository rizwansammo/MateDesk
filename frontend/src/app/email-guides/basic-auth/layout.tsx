import type { Metadata } from 'next';

const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME || 'MateDesk';

// The page itself is a client component, so metadata has to live in a layout.
export const metadata: Metadata = {
  title: 'Connect a mailbox with an app password (IMAP)',
  description:
    'How to generate an app password for Gmail, Outlook, Yahoo or Zoho and connect the '
    + `mailbox to ${PRODUCT_NAME} over IMAP, turning inbound email into support tickets.`,
  alternates: { canonical: '/email-guides/basic-auth' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
