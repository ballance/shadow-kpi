import NextAuth, { type DefaultSession } from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/server/db/client';
import { users, accounts, sessions, verificationTokens } from '@/server/db/schema';

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}

const FROM = process.env.AUTH_EMAIL_FROM ?? 'shadow-kpi <onboarding@resend.dev>';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'database' },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: FROM,
      async sendVerificationRequest({ identifier, url, provider }) {
        if (process.env.E2E_MODE === '1') {
          const dir = path.resolve('.testcontainers');
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(path.join(dir, `magic-link-${identifier}.txt`), url, 'utf8');
          return;
        }
        const apiKey = provider.apiKey;
        if (!apiKey) throw new Error('RESEND_API_KEY is not set');
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject: 'Your shadow-kpi sign-in link',
            html: signInEmailHtml(url),
            text: `Sign in to shadow-kpi: ${url}\n\nThis link expires in 24 hours.`,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Resend failed (${res.status}): ${body}`);
        }
      },
    }),
  ],
  pages: {
    signIn: '/signin',
    verifyRequest: '/check-email',
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});

function signInEmailHtml(url: string): string {
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Sign in to shadow-kpi</h2>
      <p>Click the link below to sign in. It expires in 24 hours.</p>
      <p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">Sign in</a></p>
      <p style="color:#666;font-size:14px;">If you didn't request this, you can ignore this email.</p>
    </div>
  `;
}
