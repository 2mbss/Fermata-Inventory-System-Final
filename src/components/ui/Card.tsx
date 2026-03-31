import React from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
}

export function Card({ title, subtitle, headerAction, children, className, ...props }: CardProps) {
  return (
    <div className={cn("fermata-card flex flex-col", className)} {...props}>
      {(title || subtitle || headerAction) && (
        <div className="flex items-center justify-between mb-6">
          <div>
            {subtitle && <p className="text-[10px] text-text-secondary uppercase tracking-[0.2em] mb-1">{subtitle}</p>}
            {title && <h3 className="text-lg font-bold text-white tracking-wider uppercase">{title}</h3>}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}

export function StatCard({ label, value, trend, trendType = 'up', className }: { 
  label: string; 
  value: string | number; 
  trend?: string; 
  trendType?: 'up' | 'down';
  className?: string;
}) {
  return (
    <Card className={cn("min-w-[200px]", className)}>
      <p className="text-[11px] text-text-secondary uppercase tracking-[0.15em] mb-2">{label}</p>
      <div className="flex items-baseline gap-3">
        <h2 className="text-3xl font-bold text-white tracking-tight">{value}</h2>
        {trend && (
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5",
            trendType === 'up' ? "text-status-green bg-status-green/10" : "text-status-red bg-status-red/10"
          )}>
            {trendType === 'up' ? '↑' : '↓'} {trend}
          </span>
        )}
      </div>
      <div className="mt-4 h-1 w-full bg-surface-elevated overflow-hidden">
        <div className="h-full bg-accent w-2/3"></div>
      </div>
    </Card>
  );
}
