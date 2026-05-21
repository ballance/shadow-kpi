export type DomainEvent =
  | { type: 'MarketCreated'; marketId: string; teamId: string; creatorId: string }
  | { type: 'MarketLocked'; marketId: string; teamId: string }
  | { type: 'MarketResolved'; marketId: string; teamId: string; outcome: 'yes' | 'no' }
  | { type: 'MarketVoided'; marketId: string; teamId: string }
  | { type: 'CommentPosted'; marketId: string; teamId: string; commenterId: string };

export type EventSubscriber = (event: DomainEvent) => Promise<void>;

export interface EventBus {
  subscribe: (sub: EventSubscriber) => void;
  emit: (event: DomainEvent) => Promise<void>;
}

export function createEventBus(): EventBus {
  const subscribers: EventSubscriber[] = [];
  return {
    subscribe(sub) {
      subscribers.push(sub);
    },
    async emit(event) {
      for (const sub of subscribers) {
        try {
          await sub(event);
        } catch (err) {
          console.error('event subscriber failed', { type: event.type, err });
        }
      }
    },
  };
}

export const eventBus = createEventBus();

// Register production in-app notification subscriber.
// Deferred so module-level imports do not crash when DATABASE_URL is absent
// (e.g. in test environments that spin up their own containers).
setImmediate(() => {
  if (!process.env.DATABASE_URL) return;
  Promise.all([
    import('@/server/notifications'),
    import('@/server/db/client'),
  ]).then(([{ inAppNotificationSubscriber }, { db: productionDb }]) => {
    eventBus.subscribe((event) => inAppNotificationSubscriber(productionDb, event));
  }).catch((err) => {
    console.error('Failed to register notification subscriber', err);
  });
});

// Register Slack outbox subscriber.
// Same deferral pattern: avoids requiring SLACK env vars at module load in tests.
setImmediate(() => {
  if (!process.env.DATABASE_URL) return;
  const baseUrl = process.env.SLACK_APP_PUBLIC_URL ?? process.env.NEXTAUTH_URL;
  if (!baseUrl) return;
  const tokenEncKey = process.env.SLACK_TOKEN_ENC_KEY;
  Promise.all([
    import('@/server/slack/events-subscriber'),
    import('@/server/slack/api'),
    import('@/server/db/client'),
  ]).then(([{ slackOutboxSubscriber }, { slackHttpClient }, { db: productionDb }]) => {
    eventBus.subscribe(
      slackOutboxSubscriber(productionDb, {
        baseUrl,
        inlineDrain: tokenEncKey
          ? { api: slackHttpClient, tokenEncKey }
          : undefined,
      }),
    );
  }).catch((err) => {
    console.error('Failed to register slack outbox subscriber', err);
  });
});
