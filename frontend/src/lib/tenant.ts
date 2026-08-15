/**
 * Tenant detection via subdomain.
 * Production: acme.matedesk.pro → slug = "acme"
 * Dev:        localhost → slug = null (treated as public / dev mode)
 */

export function getTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;

  const hostname = window.location.hostname;

  // Local development — no tenant context
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.')
  ) {
    return process.env.NEXT_PUBLIC_DEV_TENANT ?? null;
  }

  const parts = hostname.split('.');

  // Expected pattern: [slug].[domain].[tld]  e.g. acme.matedesk.pro
  if (parts.length >= 3) {
    return parts[0];
  }

  // Root domain — public marketing pages
  return null;
}

export function isPublicDomain(): boolean {
  return getTenantSlug() === null;
}

export function getTenantApiBase(slug: string): string {
  return `/api/tenants/${slug}`;
}

/**
 * Returns the full tenant subdomain URL for a given slug.
 * Used for cross-tenant link generation (admin dashboard only).
 */
export function getTenantUrl(slug: string): string {
  if (typeof window === 'undefined') return '';
  const { protocol, hostname, port } = window.location;
  const parts = hostname.split('.');

  if (parts.length < 2) {
    // localhost — return with query param for dev convenience
    return `${protocol}//${hostname}${port ? ':' + port : ''}?tenant=${slug}`;
  }

  const rootDomain = parts.slice(-2).join('.');
  return `${protocol}//${slug}.${rootDomain}${port ? ':' + port : ''}`;
}
