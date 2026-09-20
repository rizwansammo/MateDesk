import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const APP_DOMAIN      = process.env.NEXT_PUBLIC_APP_DOMAIN ?? '';
const DEPLOYMENT_MODE = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? 'multi_tenant';
const IS_SINGLE_TENANT = DEPLOYMENT_MODE === 'single_tenant';
const IS_DEV            = !APP_DOMAIN || APP_DOMAIN === 'localhost';

// Only allow well-formed tenant slugs in cookies and URL params.
// Prevents open-redirect via malformed workspace/tenantSlug values.
const SLUG_RE = /^[a-z0-9-]{1,63}$/;

function publicHost(request: NextRequest): string {
  // Strip port from whichever header is used — e.g. netamate.matedesk.pro:443
  // must become netamate.matedesk.pro so subdomain extraction works correctly.
  const raw =
    request.headers.get('x-forwarded-host') ??
    (request.headers.get('host') ?? '');
  return raw.split(':')[0];
}

function publicProto(request: NextRequest): string {
  return request.headers.get('x-forwarded-proto') ?? 'https';
}

function go(request: NextRequest, hostname: string, pathname: string, search = ''): NextResponse {
  const proto = IS_DEV ? 'http' : publicProto(request);
  const port  = IS_DEV ? ((request.headers.get('host') ?? '').split(':')[1] ?? '') : '';
  const h     = port ? `${hostname}:${port}` : hostname;
  return NextResponse.redirect(`${proto}://${h}${pathname}${search}`);
}

function extractSubdomain(request: NextRequest): string | null {
  if (IS_DEV) return null;
  const host   = publicHost(request);
  const suffix = `.${APP_DOMAIN}`;
  if (host === APP_DOMAIN) return null;
  if (host.endsWith(suffix)) {
    const sub = host.slice(0, -suffix.length);
    // Reject empty or malformed subdomains
    return (sub && SLUG_RE.test(sub)) ? sub : null;
  }
  return null;
}

const PUBLIC_ROUTES  = new Set(['/', '/pricing', '/logout-complete']);
const AUTH_PAGES     = new Set(['/login', '/register']);
// Always pass through without any auth redirect — needed for the cross-domain
// token handoff that lands on a subdomain before cookies are set.
const CALLBACK_ROUTES = new Set(['/auth-callback']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets and API passthrough. The extension check is deliberately
  // anchored to the final path segment — a bare `pathname.includes('.')` also
  // waved through any route containing a dot (e.g. /requests/foo.bar), skipping
  // the auth redirect entirely.
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Check cookie VALUE, not just existence — matedesk_auth must be '1'.
  // An empty or deleted cookie is treated as unauthenticated.
  const hasAuth = request.cookies.get('matedesk_auth')?.value === '1';

  // Validate tenant slug from cookie — reject empty/malformed values so they
  // can never be interpolated into a hostname and produce a broken URL.
  const rawSlug    = request.cookies.get('matedesk_tenant')?.value ?? '';
  const tenantSlug = SLUG_RE.test(rawSlug) ? rawSlug : '';

  const host = publicHost(request);

  // ── SINGLE-TENANT MODE ────────────────────────────────────────────────────
  // Dedicated installs live directly on their configured hostname. There is no
  // workspace subdomain handoff and no public tenant registration surface.
  if (IS_SINGLE_TENANT) {
    if (pathname === '/register' || pathname === '/pricing') {
      return go(request, host, hasAuth ? '/home' : '/login');
    }
    if (CALLBACK_ROUTES.has(pathname)) {
      return go(request, host, hasAuth ? '/home' : '/login');
    }
    if (hasAuth) {
      if (AUTH_PAGES.has(pathname) || pathname === '/') return go(request, host, '/home');
      return NextResponse.next();
    }
    if (pathname === '/login') return NextResponse.next();
    const qs = pathname !== '/' ? `?next=${encodeURIComponent(pathname + request.nextUrl.search)}` : '';
    return go(request, host, '/login', qs);
  }

  // ── DEV MODE ────────────────────────────────────────────────────────────────
  if (IS_DEV) {
    if (hasAuth && tenantSlug) {
      if (AUTH_PAGES.has(pathname)) return go(request, host, '/home');
      return NextResponse.next();
    }
    if (PUBLIC_ROUTES.has(pathname) || AUTH_PAGES.has(pathname)) return NextResponse.next();
    const qs = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
    return go(request, host, '/login', qs);
  }

  // ── PRODUCTION ──────────────────────────────────────────────────────────────
  const subdomain = extractSubdomain(request);

  // ── Tenant subdomain (netamate.matedesk.pro) ────────────────────────────────
  if (subdomain) {
    // /register belongs on the root domain — a subdomain is a workspace, not a
    // sign-up page. Prevent users from accidentally creating a second tenant.
    if (pathname === '/register') {
      return go(request, APP_DOMAIN, '/register');
    }

    // Cross-domain token handoff — must be accessible before cookies are set.
    if (CALLBACK_ROUTES.has(pathname)) return NextResponse.next();

    if (pathname === '/login') {
      // Authenticated to THIS tenant → go to dashboard
      if (hasAuth && tenantSlug === subdomain) return go(request, host, '/home');
      // Authenticated but landed on the WRONG tenant's login page → go to correct home.
      // This prevents a user from seeing another tenant's login UI while logged in.
      if (hasAuth && tenantSlug && tenantSlug !== subdomain) {
        return go(request, `${tenantSlug}.${APP_DOMAIN}`, '/home');
      }
      // Not authenticated → show login form
      return NextResponse.next();
    }

    // Unauthenticated on subdomain
    if (!hasAuth || !tenantSlug) {
      // Bare / while logged out → root domain landing page
      if (pathname === '/') return go(request, APP_DOMAIN, '/');
      const qs = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return go(request, `${subdomain}.${APP_DOMAIN}`, '/login', qs);
    }

    // Authenticated but on the wrong tenant's subdomain → correct subdomain
    if (tenantSlug !== subdomain) {
      return go(request, `${tenantSlug}.${APP_DOMAIN}`, pathname, request.nextUrl.search);
    }

    // Correct tenant — bare / → /home
    if (pathname === '/') return go(request, host, '/home');
    return NextResponse.next();
  }

  // ── Root domain (matedesk.pro) ──────────────────────────────────────────────

  // Auth check runs BEFORE the workspace redirect so an authenticated user
  // hitting /login?workspace=X goes straight to their own dashboard instead of
  // being bounced to the wrong tenant's login page first.
  if (hasAuth && tenantSlug) {
    if (AUTH_PAGES.has(pathname)) return go(request, `${tenantSlug}.${APP_DOMAIN}`, '/home');
    // Marketing pages: allow through — CTAs update client-side via usePublicAuthStatus
    if (PUBLIC_ROUTES.has(pathname)) return NextResponse.next();
    // Private route on root domain → tenant subdomain
    return go(request, `${tenantSlug}.${APP_DOMAIN}`, pathname, request.nextUrl.search);
  }

  // Has auth cookie but tenant slug is missing or invalid — broken/partial session.
  // Allow public and auth pages; bounce everything else to login.
  if (hasAuth && !tenantSlug) {
    if (PUBLIC_ROUTES.has(pathname) || AUTH_PAGES.has(pathname)) return NextResponse.next();
    return go(request, APP_DOMAIN, '/login');
  }

  // /login?workspace=slug → route unauthenticated user to their workspace login.
  // Validate the workspace param before using it in a hostname.
  if (pathname === '/login') {
    const ws = request.nextUrl.searchParams.get('workspace') ?? '';
    if (ws && SLUG_RE.test(ws)) {
      const next   = request.nextUrl.searchParams.get('next') ?? '';
      const search = next ? `?next=${encodeURIComponent(next)}` : '';
      return go(request, `${ws}.${APP_DOMAIN}`, '/login', search);
    }
  }

  // Unauthenticated on root domain
  if (PUBLIC_ROUTES.has(pathname) || AUTH_PAGES.has(pathname)) return NextResponse.next();
  const qs = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
  return go(request, APP_DOMAIN, '/login', qs);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
