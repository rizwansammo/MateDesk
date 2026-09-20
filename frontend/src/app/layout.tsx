import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import { ThemeProvider } from 'next-themes';
import { SplashDismiss } from '@/components/SplashDismiss';
import { PageTransitionOverlay } from '@/components/PageTransitionOverlay';
import { NetaMateMark } from '@/components/NetaMateMark';
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

const hemiHead = localFont({
  src: '../../public/fonts/HemiHead-Bold.otf',
  variable: '--font-hemi',
  display: 'block',  // block instead of swap — prevents font flash on the splash itself
  weight: '700',
});

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'matedesk.pro';
const DEPLOYMENT_MODE = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE || 'multi_tenant';
const IS_SINGLE_TENANT = DEPLOYMENT_MODE === 'single_tenant';
const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME || (IS_SINGLE_TENANT ? 'HelpDesk' : 'MateDesk');
const PRODUCT_WORDMARK = process.env.NEXT_PUBLIC_PRODUCT_WORDMARK || (IS_SINGLE_TENANT ? 'NetaMate' : 'MateDesk');
const SITE_URL = `https://${APP_DOMAIN}`;

export const metadata: Metadata = IS_SINGLE_TENANT ? {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${PRODUCT_NAME} — Support Portal`,
    template: `%s | ${PRODUCT_NAME}`,
  },
  description: 'Secure support workspace for service requests, conversations, and ticket tracking.',
  applicationName: PRODUCT_NAME,
  authors: [{ name: 'NetaMate Solutions' }],
  creator: 'NetaMate Solutions',
  publisher: 'NetaMate Solutions',
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
} : {
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

// ── Theme boot script ─────────────────────────────────────────────────────────
// Runs synchronously in <head>, before any body content is parsed or painted.
//
// next-themes injects its own FOUC-prevention script, but that renders inside
// <body> — after the #app-splash div below it in document order. The browser can
// therefore paint the splash before next-themes has stamped the attribute, which
// is why light-mode users saw a full-screen dark splash on every hard load.
// Setting the attribute here removes the race entirely.
//
// Only mutates an attribute on <html>, which React does not own (and <html>
// already carries suppressHydrationWarning), so this cannot cause a mismatch.
// Storage key "theme" is next-themes' default; enableSystem is false, so the
// stored value is only ever "light" or "dark". Anything else falls through to
// the :root dark defaults, which is the correct fallback.
//
// Zoom is restored here too. It was previously applied only by the Appearance
// page's mount effect, so a user who set 125% got it back on client-side
// navigation but lost it on every hard reload — the setting appeared not to
// stick. Applying it pre-paint also avoids a visible reflow.
const THEME_BOOT = `(function(){try{
if(localStorage.getItem('theme')==='light'){document.documentElement.setAttribute('data-theme','light');}
var z=parseInt(localStorage.getItem('matedesk_zoom')||'100',10);
if(z>=75&&z<=125&&z!==100){document.documentElement.style.zoom=(z/100).toString();}
}catch(e){}})();`;

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
        {/* Must be first: sets data-theme before anything below is painted. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${hemiHead.variable} font-sans antialiased`}>

        {/* ── Pre-hydration splash ────────────────────────────────────────────
            Renders before React JS executes. SplashDismiss fades it out
            once the app is hydrated and fonts are ready.                   */}
        <div
          id="app-splash"
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'var(--bg-base)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'all',
          }}
        >
          {/* Spinner ring */}
          <div style={{ position: 'relative', width: 88, height: 88 }}>
            <div data-splash-track style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '2px solid rgba(31,78,216,0.15)',
            }} />
            <div className="_md-arc" />

            <div
              data-splash-icon="md"
              style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%,-50%)',
                width: 48, height: 48,
                background: IS_SINGLE_TENANT ? 'transparent' : '#1F4ED8',
                color: 'var(--text-0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {IS_SINGLE_TENANT ? (
                <NetaMateMark size={40} />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" width={30} height={30}>
                  <path d="M3 4h18v9.5l-4.5 0-1.8 2.5h-5.4l-1.8 -2.5h-4.5z" fill="#fff" />
                  <path d="M3 13.5v6.5h18v-6.5" stroke="#fff" strokeWidth="1.5" fill="none" />
                </svg>
              )}
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
              color: 'var(--text-0)', lineHeight: 1,
              position: 'relative', top: 2,
            }}
          >
            {IS_SINGLE_TENANT ? (
              PRODUCT_WORDMARK
            ) : (
              <>{'Mate'}<span style={{ color: '#1F4ED8' }}>Desk</span></>
            )}
          </div>

          {/* Subtitle */}
          <div data-splash-sub="md" style={{
            marginTop: 8, fontSize: 10,
            color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            {IS_SINGLE_TENANT ? 'Loading support workspace…' : 'Loading workspace…'}
          </div>
        </div>

        {/* disableTransitionOnChange suppresses CSS transitions for the instant the
            attribute flips, so switching theme is a clean cut rather than every
            tokenised colour animating independently. */}
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
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
