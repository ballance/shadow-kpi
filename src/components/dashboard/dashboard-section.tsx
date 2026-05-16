import * as React from 'react';

interface DashboardSectionProps {
  title: string;
  hint?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function DashboardSection({ title, hint, children, actions }: DashboardSectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">
            {title}
          </div>
          {hint ? <div className="text-xs text-fg-muted">{hint}</div> : null}
        </div>
        {actions ?? null}
      </div>
      <div className="rounded-lg border border-border bg-surface">{children}</div>
    </section>
  );
}
