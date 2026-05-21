export interface PostMessageInput {
  token: string;
  channel: string;
  text: string;
  blocks: unknown[];
}

export interface PostMessageResult {
  ok: boolean;
  error?: string;
  retryAfterSeconds?: number;
  ts?: string;
  channel?: string;
}

export interface OauthV2AccessInput {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}

export interface OauthV2AccessResult {
  ok: boolean;
  error?: string;
  accessToken: string;
  botUserId: string;
  teamId: string;
  teamName: string;
}

export interface OpenidConnectTokenInput {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}

export interface OpenidConnectTokenResult {
  ok: boolean;
  error?: string;
  sub: string;
  email: string;
  emailVerified: boolean;
  slackTeamId: string;
  slackUserId: string;
}

export interface ConversationsOpenInput {
  token: string;
  userId: string;
}

export interface ConversationsOpenResult {
  ok: boolean;
  error?: string;
  channelId: string;
}

export interface ConversationsListInput {
  token: string;
  cursor?: string;
}

export interface ConversationsListResult {
  ok: boolean;
  error?: string;
  channels: Array<{ id: string; name: string; isPrivate: boolean }>;
  nextCursor?: string;
}

export interface SlackApiClient {
  postMessage(input: PostMessageInput): Promise<PostMessageResult>;
  oauthV2Access(input: OauthV2AccessInput): Promise<OauthV2AccessResult>;
  openidConnectToken(
    input: OpenidConnectTokenInput,
  ): Promise<OpenidConnectTokenResult>;
  conversationsOpen(input: ConversationsOpenInput): Promise<ConversationsOpenResult>;
  conversationsList(input: ConversationsListInput): Promise<ConversationsListResult>;
}

const SLACK_API_BASE = 'https://slack.com/api';

interface SlackErrorBody {
  ok?: boolean;
  error?: string;
  [k: string]: unknown;
}

async function callSlack<T extends SlackErrorBody>(
  method: string,
  body: URLSearchParams | string,
  authHeader?: string,
): Promise<{ body: T; retryAfter?: number }> {
  const headers: Record<string, string> = {
    'content-type':
      typeof body === 'string'
        ? 'application/json; charset=utf-8'
        : 'application/x-www-form-urlencoded',
  };
  if (authHeader) headers.authorization = authHeader;

  const res = await fetch(`${SLACK_API_BASE}/${method}`, {
    method: 'POST',
    headers,
    body,
  });

  const retryAfterHeader = res.headers.get('retry-after');
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;

  const text = await res.text();
  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch {
    parsed = { ok: false, error: `non_json_response_${res.status}` } as T;
  }
  if (res.status === 429) {
    return { body: { ...(parsed as object), ok: false, error: 'ratelimited' } as T, retryAfter };
  }
  return { body: parsed };
}

export const slackHttpClient: SlackApiClient = {
  async postMessage({ token, channel, text, blocks }) {
    const body = JSON.stringify({ channel, text, blocks });
    const { body: res, retryAfter } = await callSlack<{
      ok: boolean;
      error?: string;
      ts?: string;
      channel?: string;
    }>('chat.postMessage', body, `Bearer ${token}`);
    return {
      ok: res.ok,
      error: res.error,
      retryAfterSeconds: retryAfter,
      ts: res.ts,
      channel: res.channel,
    };
  },

  async oauthV2Access({ clientId, clientSecret, code, redirectUri }) {
    const params = new URLSearchParams({
      code,
      redirect_uri: redirectUri,
    });
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const { body } = await callSlack<{
      ok: boolean;
      error?: string;
      access_token?: string;
      bot_user_id?: string;
      team?: { id: string; name: string };
    }>('oauth.v2.access', params, `Basic ${basic}`);
    return {
      ok: body.ok,
      error: body.error,
      accessToken: body.access_token ?? '',
      botUserId: body.bot_user_id ?? '',
      teamId: body.team?.id ?? '',
      teamName: body.team?.name ?? '',
    };
  },

  async openidConnectToken({ clientId, clientSecret, code, redirectUri }) {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const { body } = await callSlack<{
      ok: boolean;
      error?: string;
      id_token?: string;
    }>('openid.connect.token', params);
    if (!body.ok || !body.id_token) {
      return {
        ok: false,
        error: body.error ?? 'no_id_token',
        sub: '',
        email: '',
        emailVerified: false,
        slackTeamId: '',
        slackUserId: '',
      };
    }
    const payload = decodeJwtPayload(body.id_token);
    return {
      ok: true,
      sub: String(payload.sub ?? ''),
      email: String(payload.email ?? ''),
      emailVerified: Boolean(payload.email_verified),
      slackTeamId: String(payload['https://slack.com/team_id'] ?? ''),
      slackUserId: String(payload['https://slack.com/user_id'] ?? ''),
    };
  },

  async conversationsOpen({ token, userId }) {
    const body = JSON.stringify({ users: userId });
    const { body: res } = await callSlack<{
      ok: boolean;
      error?: string;
      channel?: { id: string };
    }>('conversations.open', body, `Bearer ${token}`);
    return {
      ok: res.ok,
      error: res.error,
      channelId: res.channel?.id ?? '',
    };
  },

  async conversationsList({ token, cursor }) {
    const params = new URLSearchParams({
      types: 'public_channel',
      exclude_archived: 'true',
      limit: '200',
    });
    if (cursor) params.set('cursor', cursor);
    const { body } = await callSlack<{
      ok: boolean;
      error?: string;
      channels?: Array<{ id: string; name: string; is_private: boolean }>;
      response_metadata?: { next_cursor?: string };
    }>('conversations.list', params, `Bearer ${token}`);
    return {
      ok: body.ok,
      error: body.error,
      channels:
        body.channels?.map((c) => ({
          id: c.id,
          name: c.name,
          isPrivate: c.is_private,
        })) ?? [],
      nextCursor: body.response_metadata?.next_cursor || undefined,
    };
  },
};

function decodeJwtPayload(idToken: string): Record<string, unknown> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('malformed id_token');
  const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(payload) as Record<string, unknown>;
}
