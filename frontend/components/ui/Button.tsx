// frontend/components/ui/Button.tsx (CORRIGIDO com size)
import React from 'react';

export type ButtonVariant = 'primary' | 'accent' | 'outline' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'sm',
  children,
  className = '',
  ...props
}: ButtonProps) {
  const base = 'rounded-md font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variants: Record<ButtonVariant, string> = {
    primary: `${base} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500`,
    accent:  `${base} bg-[#f59e0b] text-white hover:bg-[#e08c07] focus:ring-[#f59e0b]`,
    outline: `${base} border border-gray-600 text-gray-300 hover:bg-[#1e2126] focus:ring-gray-500`,
    danger:  `${base} bg-red-600 text-white hover:bg-red-700 focus:ring-red-500`,
  };

  const sizes: Record<ButtonSize, string> = {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button 
      className={`${variants[variant]} ${sizes[size]} ${className}`} 
      {...props}
    >
      {children}
    </button>
  );
}