import type {
  ConversationsListInput,
  ConversationsListResult,
  ConversationsOpenInput,
  ConversationsOpenResult,
  OauthV2AccessInput,
  OauthV2AccessResult,
  OpenidConnectTokenInput,
  OpenidConnectTokenResult,
  PostMessageInput,
  PostMessageResult,
  SlackApiClient,
} from './api';

export interface ScriptedResponse {
  match?: (input: PostMessageInput) => boolean;
  result: PostMessageResult;
}

/**
 * Captures every Slack call into typed arrays for assertion.
 * Allows scripting postMessage responses (e.g. simulate 429 + Retry-After).
 */
export class InMemorySlackApi implements SlackApiClient {
  postMessageCalls: PostMessageInput[] = [];
  scriptedPostMessage: ScriptedResponse[] = [];
  oauthV2AccessResult: OauthV2AccessResult = {
    ok: true,
    accessToken: 'xoxb-test',
    botUserId: 'Ubot',
    teamId: 'T1',
    teamName: 'Test Workspace',
  };
  openidConnectTokenResult: OpenidConnectTokenResult = {
    ok: true,
    sub: 'sub-1',
    email: 'user@example.com',
    emailVerified: true,
    slackTeamId: 'T1',
    slackUserId: 'U1',
  };
  conversationsOpenResult: ConversationsOpenResult = {
    ok: true,
    channelId: 'D1',
  };
  conversationsListResult: ConversationsListResult = {
    ok: true,
    channels: [{ id: 'C1', name: 'general', isPrivate: false }],
  };

  async postMessage(input: PostMessageInput): Promise<PostMessageResult> {
    this.postMessageCalls.push(input);
    const idx = this.scriptedPostMessage.findIndex(
      (s) => !s.match || s.match(input),
    );
    if (idx === -1) return { ok: true, ts: `${Date.now()}.000`, channel: input.channel };
    const [response] = this.scriptedPostMessage.splice(idx, 1);
    return response.result;
  }

  async oauthV2Access(_input: OauthV2AccessInput): Promise<OauthV2AccessResult> {
    return this.oauthV2AccessResult;
  }

  async openidConnectToken(
    _input: OpenidConnectTokenInput,
  ): Promise<OpenidConnectTokenResult> {
    return this.openidConnectTokenResult;
  }

  async conversationsOpen(
    _input: ConversationsOpenInput,
  ): Promise<ConversationsOpenResult> {
    return this.conversationsOpenResult;
  }

  async conversationsList(
    _input: ConversationsListInput,
  ): Promise<ConversationsListResult> {
    return this.conversationsListResult;
  }
}
