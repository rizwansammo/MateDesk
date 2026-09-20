import type { MetadataRoute } from 'next';

// Only genuinely public, indexable pages belong here. Login, register and the
// operator console are excluded — they are disallowed in robots.txt, and listing
// a page in a sitemap while blocking it is a contradictory signal to crawlers.
//
// Tenant subdomains have no sitemap at all: they are noindex by hostname.

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'matedesk.pro';
const BASE = `https://${APP_DOMAIN}`;
const IS_SINGLE_TENANT = (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? 'multi_tenant') === 'single_tenant';

export default function sitemap(): MetadataRoute.Sitemap {
  if (IS_SINGLE_TENANT) return [];

  return [
    {
      url: BASE,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE}/pricing`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    // Setup guides — real content, and the kind of long-tail page MSPs search for
    // ("connect Microsoft 365 mailbox to helpdesk").
    {
      url: `${BASE}/email-guides/oauth2`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE}/email-guides/basic-auth`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
}
