import type { MetadataRoute } from 'next';

const IS_SINGLE_TENANT = (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? 'multi_tenant') === 'single_tenant';
const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME || (IS_SINGLE_TENANT ? 'HelpDesk' : 'MateDesk');
const PRODUCT_WORDMARK = process.env.NEXT_PUBLIC_PRODUCT_WORDMARK || (IS_SINGLE_TENANT ? 'NetaMate' : 'MateDesk');

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: IS_SINGLE_TENANT ? PRODUCT_WORDMARK : 'MateDesk',
    description: IS_SINGLE_TENANT
      ? 'Secure support workspace for service requests and ticket tracking.'
      : 'Multi-tenant helpdesk for managed service providers.',
    start_url: IS_SINGLE_TENANT ? '/login' : '/',
    display: 'standalone',
    background_color: '#0f1117',
    theme_color: '#2563eb',
    icons: [
      {
        src: IS_SINGLE_TENANT ? '/netamate-logo.png?v=20260921' : '/favicon.png',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  };
}
