import { Badge } from '@/components/badge';

export interface StatusPillProps {
  status: 'open' | 'locked' | 'resolved' | 'voided';
  outcome?: 'yes' | 'no' | null;
}

export function StatusPill({ status, outcome }: StatusPillProps) {
  if (status === 'open') return <Badge variant="success">OPEN</Badge>;
  if (status === 'locked') return <Badge variant="warning">LOCKED</Badge>;
  if (status === 'voided') return <Badge variant="danger">VOIDED</Badge>;
  const suffix = outcome ? ` ${outcome.toUpperCase()}` : '';
  return <Badge>{`RESOLVED${suffix}`}</Badge>;
}
