import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Saira } from 'next/font/google';
import localFont from 'next/font/local';
import { ThemeProvider } from 'next-themes';
import { SplashDismiss } from '@/components/SplashDismiss';
import { PageTransitionOverlay } from '@/components/PageTransitionOverlay';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const saira = Saira({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-saira',
  display: 'swap',
});

const hemiHead = localFont({
  src: '../../public/fonts/HemiHead-Bold.otf',
  variable: '--font-hemi',
  display: 'block',  // block instead of swap — prevents font flash on the splash itself
  weight: '700',
});

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'matedesk.pro';
const SITE_URL = `https://${APP_DOMAIN}`;

export const metadata: Metadata = {
  // Required for Open Graph and canonical URLs to resolve to absolute addresses.
  // Without it Next.js emits relative og:image paths, which crawlers and social
  // scrapers cannot fetch.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'MateDesk — Multi-Tenant Helpdesk for MSPs',
    template: '%s | MateDesk',
  },
  description:
    'Multi-tenant helpdesk built for managed service providers. Isolated client '
    + 'workspaces, email-to-ticket automation, SLA tracking and a knowledge base. '
    + 'By NetaMate Solutions.',
  applicationName: 'MateDesk',
  keywords: [
    'helpdesk software',
    'MSP helpdesk',
    'multi-tenant helpdesk',
    'managed service provider ticketing',
    'service desk software',
    'email to ticket',
    'SLA tracking',
  ],
  authors: [{ name: 'NetaMate Solutions' }],
  creator: 'NetaMate Solutions',
  publisher: 'NetaMate Solutions',
  alternates: { canonical: '/' },
  // Deliberately no explicit `robots: { index: true }`. This layout also renders on
  // tenant subdomains, where nginx sends X-Robots-Tag: noindex — emitting a positive
  // meta robots tag there would be a contradictory signal. Absence means "indexable",
  // which is correct for the apex, and the header still excludes the subdomains.
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', type: 'image/png', sizes: '528x528' },
    ],
    apple: [{ url: '/favicon.png', sizes: '528x528' }],
  },
  openGraph: {
    type: 'website',
    siteName: 'MateDesk',
    url: SITE_URL,
    title: 'MateDesk — Multi-Tenant Helpdesk for MSPs',
    description:
      'Isolated client workspaces, email-to-ticket automation, SLA tracking and a '
      + 'knowledge base — built for managed service providers.',
    images: [
      { url: '/MetaDeskWide.png', width: 1919, height: 820, alt: 'MateDesk' },
    ],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MateDesk — Multi-Tenant Helpdesk for MSPs',
    description:
      'Isolated client workspaces, email-to-ticket automation, SLA tracking and a '
      + 'knowledge base — built for managed service providers.',
    images: ['/MetaDeskWide.png'],
  },
};

// ── Pre-hydration splash CSS ──────────────────────────────────────────────────
// Injected directly into <head> so it's available before any JS runs.
const SPLASH_CSS = `
  @keyframes _md-spin { to { transform: rotate(360deg); } }
  @keyframes _md-fadein { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  #app-splash { transition: opacity 0.38s ease; }
  #app-splash ._md-arc {
    position: absolute; inset: 0; border-radius: 50%;
    border: 2px solid transparent;
    border-top-color: #1F4ED8;
    border-right-color: #1F4ED8;
    animation: _md-spin 0.9s linear infinite;
  }
  #app-splash ._md-wordmark { animation: _md-fadein 0.5s ease 0.15s both; }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${saira.variable} ${hemiHead.variable} font-sans antialiased`}>

        {/* ── Pre-hydration splash ────────────────────────────────────────────
            Renders before React JS executes. SplashDismiss fades it out
            once the app is hydrated and fonts are ready.                   */}
        <div
          id="app-splash"
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: '#0E1117',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'all',
          }}
        >
          {/* Spinner ring */}
          <div style={{ position: 'relative', width: 88, height: 88 }}>
            {/* Track ring */}
            <div data-splash-track style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '2px solid rgba(31,78,216,0.15)',
            }} />
            {/* Spinning arc */}
            <div className="_md-arc" />

            {/* Brand icon */}
            <div
              data-splash-icon="md"
              style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%,-50%)',
                width: 48, height: 48,
                background: '#1F4ED8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" width={30} height={30}>
                <path d="M3 4h18v9.5l-4.5 0-1.8 2.5h-5.4l-1.8 -2.5h-4.5z" fill="#fff" />
                <path d="M3 13.5v6.5h18v-6.5" stroke="#fff" strokeWidth="1.5" fill="none" />
              </svg>
            </div>
          </div>

          {/* Wordmark */}
          <div
            data-splash-wm="md"
            className="_md-wordmark"
            style={{
              marginTop: 22,
              fontFamily: 'var(--font-hemi), sans-serif',
              fontWeight: 700, fontSize: 18,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              color: '#ECEEF2', lineHeight: 1,
              position: 'relative', top: 2,
            }}
          >
            {'Mate'}
            <span style={{ color: '#1F4ED8' }}>Desk</span>
          </div>

          {/* Subtitle */}
          <div data-splash-sub="md" style={{
            marginTop: 8, fontSize: 10,
            color: '#374151', letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            Loading workspace…
          </div>
        </div>

        <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
          {children}
        </ThemeProvider>

        {/* Dismisses the splash once React is hydrated + fonts ready */}
        <SplashDismiss />
        {/* Page-to-page transition overlay for public navigation */}
        <PageTransitionOverlay />
      </body>
    </html>
  );
}
