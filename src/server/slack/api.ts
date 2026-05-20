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
