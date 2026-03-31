import React from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  className, 
  children, 
  ...props 
}: ButtonProps) {
  return (
    <button
      className={cn(
        variant === 'primary' ? 'fermata-button-primary' : 'fermata-button-secondary',
        size === 'sm' ? 'py-2 px-4 text-[10px]' : size === 'lg' ? 'py-5 px-8 text-sm' : 'py-3 px-6 text-xs',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
