import React from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">
          {label}
        </label>
      )}
      <input
        className={cn(
          "fermata-input w-full",
          error && "border-accent",
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-[9px] text-accent uppercase font-bold tracking-widest">
          {error}
        </p>
      )}
    </div>
  );
}
