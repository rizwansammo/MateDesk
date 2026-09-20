import { headers } from 'next/headers';

// robots.txt has to differ per hostname, so this is a route handler rather than
// the static `robots.ts` convention (which is evaluated once at build time).
//
// The apex is the only public marketing site. Every tenant workspace lives on
// {slug}.matedesk.pro and serves the same login screen, so crawling them would
// index one near-identical thin page per customer — which dilutes the apex's
// authority and puts customer workspace URLs into public search results.
//
// nginx also sends `X-Robots-Tag: noindex, nofollow` on non-apex hosts. That is
// the authoritative signal (it covers every content type, and applies even to
// pages a crawler reaches without fetching robots.txt first); this file is the
// polite, human-readable layer on top.

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'matedesk.pro';
const IS_SINGLE_TENANT = (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? 'multi_tenant') === 'single_tenant';

const APEX = `User-agent: *
Allow: /

# Not content — authentication, operator tooling and the API.
Disallow: /login
Disallow: /register
Disallow: /auth-callback
Disallow: /logout-complete
Disallow: /platform-admin/
Disallow: /django-admin/
Disallow: /api/

Sitemap: https://${APP_DOMAIN}/sitemap.xml
`;

const TENANT = `# Tenant workspace — not a public site.
User-agent: *
Disallow: /
`;

export const dynamic = 'force-dynamic';

export async function GET() {
  const host = (await headers()).get('host')?.split(':')[0] ?? '';
  const isApex = host === APP_DOMAIN || host === `www.${APP_DOMAIN}`;

  return new Response(IS_SINGLE_TENANT ? TENANT : (isApex ? APEX : TENANT), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Short cache: a wrong robots.txt cached for a day is expensive to undo.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
