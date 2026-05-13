import NextAuth from 'next-auth';
import { authConfig } from '@/server/auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isAuthed = !!req.auth;
  const { pathname } = req.nextUrl;
  const isProtected =
    pathname.startsWith('/teams') ||
    pathname.startsWith('/t/');

  if (isProtected && !isAuthed) {
    const url = new URL('/signin', req.nextUrl.origin);
    url.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/teams/:path*', '/t/:path*'],
};
