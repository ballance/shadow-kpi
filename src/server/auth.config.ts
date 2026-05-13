import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-compatible auth config — no Node.js-only imports.
 * Used by middleware for session checking without loading the
 * full provider configuration (which pulls in fs/path/pg).
 */
export const authConfig = {
  pages: {
    signIn: '/signin',
    verifyRequest: '/check-email',
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth;
    },
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
