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
