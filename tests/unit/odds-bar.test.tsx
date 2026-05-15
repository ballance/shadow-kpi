// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { OddsBar } from '@/components/odds-bar';

describe('OddsBar', () => {
  it('shows "No bets yet" when total is 0', () => {
    const { getByText } = render(
      <OddsBar yesShare={0} noShare={0} yesPool={0} noPool={0} total={0} />,
    );
    expect(getByText(/no bets yet/i)).toBeDefined();
  });

  it('renders YES percentage and NO percentage when there are bets', () => {
    const { getByText } = render(
      <OddsBar yesShare={0.62} noShare={0.38} yesPool={29} noPool={18} total={47} />,
    );
    expect(getByText(/YES · 62%/)).toBeDefined();
    expect(getByText(/NO · 38%/)).toBeDefined();
  });

  it('shows the pool total', () => {
    const { getByText } = render(
      <OddsBar yesShare={0.5} noShare={0.5} yesPool={10} noPool={10} total={20} />,
    );
    expect(getByText(/🍩 20/)).toBeDefined();
  });
});
