// JSON-LD for the public marketing site.
//
// This is what lets Google associate a logo and a brand identity with the domain,
// rather than guessing. Three graph nodes:
//
//   Organization      — who publishes this, and the logo to show alongside results
//   WebSite           — the site itself, plus the search action for a sitelinks box
//   SoftwareApplication — what the product actually is
//
// Rendered only on the apex marketing pages. Tenant subdomains are noindex, so
// emitting structured data there would be pointless at best and conflicting at worst.
//
// Google requires the logo to be crawlable and at least 112x112. /favicon.png is
// 528x528 and square, which satisfies both. If you later produce a dedicated
// 512x512 brand mark with padding, swap it here.

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'matedesk.pro';
const SITE = `https://${APP_DOMAIN}`;

const graph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'NetaMate Solutions',
      url: SITE,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE}/favicon.png`,
        width: 528,
        height: 528,
      },
      brand: {
        '@type': 'Brand',
        name: 'MateDesk',
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: SITE,
      name: 'MateDesk',
      description:
        'Multi-tenant helpdesk for managed service providers, with isolated client '
        + 'workspaces, email-to-ticket automation and SLA tracking.',
      publisher: { '@id': `${SITE}/#organization` },
      inLanguage: 'en-US',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE}/#software`,
      name: 'MateDesk',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Help Desk Software',
      operatingSystem: 'Web',
      url: SITE,
      description:
        'Multi-tenant helpdesk platform for MSPs. Each client organization is isolated '
        + 'in its own workspace, with email-to-ticket automation, SLA policies, a '
        + 'knowledge base, time logging and billing.',
      publisher: { '@id': `${SITE}/#organization` },
      featureList: [
        'Multi-tenant client workspaces',
        'Email-to-ticket with IMAP and OAuth2',
        'SLA policies and breach tracking',
        'Automation rule engine',
        'Knowledge base with versioning',
        'Time logging and invoicing',
        'Role-based access control',
      ],
      // Priced offering, but no aggregateRating — inventing review data is a
      // structured-data violation and can earn a manual penalty.
      offers: {
        '@type': 'Offer',
        category: 'SaaS subscription',
        url: `${SITE}/pricing`,
      },
    },
  ],
};

export default function StructuredData() {
  return (
    <script
      type="application/ld+json"
      // Content is a compile-time constant, not user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
