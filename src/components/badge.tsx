import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-border text-fg-muted',
        success: 'bg-accent-bg text-accent border border-accent-border',
        danger: 'bg-danger-bg text-danger border border-danger-border',
        warning: 'border border-warning/40 text-warning bg-warning/10',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
