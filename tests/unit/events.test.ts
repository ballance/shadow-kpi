import { describe, expect, it, vi } from 'vitest';
import { createEventBus, type DomainEvent } from '@/server/events';

describe('event bus', () => {
  it('calls every subscriber in order with the event', async () => {
    const bus = createEventBus();
    const calls: string[] = [];
    bus.subscribe(async (e) => {
      calls.push(`a:${e.type}`);
    });
    bus.subscribe(async (e) => {
      calls.push(`b:${e.type}`);
    });

    const event: DomainEvent = {
      type: 'MarketCreated',
      marketId: 'm1',
      teamId: 't1',
      creatorId: 'u1',
    };
    await bus.emit(event);
    expect(calls).toEqual(['a:MarketCreated', 'b:MarketCreated']);
  });

  it('swallows subscriber errors and keeps calling remaining subscribers', async () => {
    const bus = createEventBus();
    const calls: string[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.subscribe(async () => {
      throw new Error('boom');
    });
    bus.subscribe(async (e) => {
      calls.push(`b:${e.type}`);
    });

    await bus.emit({ type: 'MarketLocked', marketId: 'm1', teamId: 't1' });
    expect(calls).toEqual(['b:MarketLocked']);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('emit resolves even when a subscriber rejects', async () => {
    const bus = createEventBus();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.subscribe(async () => {
      throw new Error('boom');
    });
    await expect(
      bus.emit({ type: 'MarketLocked', marketId: 'm1', teamId: 't1' }),
    ).resolves.toBeUndefined();
    consoleError.mockRestore();
  });
});
