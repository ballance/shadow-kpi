import { NextRequest, NextResponse } from 'next/server';

/**
 * Lightweight edge middleware — checks for the presence of the NextAuth
 * session-token cookie (both secure and insecure variants).  The full
 * session validation happens server-side in (app)/layout.tsx via auth().
 * We avoid running the full NextAuth edge wrapper here because our session
 * strategy is "database", which requires a Node.js Postgres connection that
 * is unavailable in the edge runtime.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected =
    pathname.startsWith('/teams') ||
    pathname.startsWith('/t/');

  if (!isProtected) return NextResponse.next();

  const hasSession =
    req.cookies.has('next-auth.session-token') ||
    req.cookies.has('__Secure-next-auth.session-token') ||
    req.cookies.has('authjs.session-token') ||
    req.cookies.has('__Secure-authjs.session-token');

  if (!hasSession) {
    const url = new URL('/signin', req.nextUrl.origin);
    url.searchParams.set('callbackUrl', pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/teams/:path*', '/t/:path*'],
};
