// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { StatusPill } from '@/components/status-pill';

describe('StatusPill', () => {
  it('renders OPEN for open status', () => {
    const { getByText } = render(<StatusPill status="open" />);
    expect(getByText('OPEN')).toBeDefined();
  });

  it('renders LOCKED for locked status', () => {
    const { getByText } = render(<StatusPill status="locked" />);
    expect(getByText('LOCKED')).toBeDefined();
  });

  it('renders RESOLVED YES when resolved with outcome yes', () => {
    const { getByText } = render(<StatusPill status="resolved" outcome="yes" />);
    expect(getByText('RESOLVED YES')).toBeDefined();
  });

  it('renders RESOLVED NO when resolved with outcome no', () => {
    const { getByText } = render(<StatusPill status="resolved" outcome="no" />);
    expect(getByText('RESOLVED NO')).toBeDefined();
  });

  it('renders just RESOLVED when resolved without outcome', () => {
    const { getByText } = render(<StatusPill status="resolved" />);
    expect(getByText('RESOLVED')).toBeDefined();
  });

  it('renders VOIDED for voided status', () => {
    const { getByText } = render(<StatusPill status="voided" />);
    expect(getByText('VOIDED')).toBeDefined();
  });
});
