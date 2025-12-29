'use client';

/**
 * LoadingSpinner - Reusable loading indicator
 */

import React from 'react';

interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  color?: 'primary' | 'secondary' | 'white';
}

const sizeClasses = {
  xs: 'w-3 h-3 border',
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-2',
};

const colorClasses = {
  primary: 'border-accent-primary border-t-transparent',
  secondary: 'border-fg-secondary border-t-transparent',
  white: 'border-white border-t-transparent',
};

export function LoadingSpinner({
  size = 'md',
  className = '',
  color = 'primary',
}: LoadingSpinnerProps) {
  return (
    <div
      className={`
        ${sizeClasses[size]}
        ${colorClasses[color]}
        rounded-full animate-spin
        ${className}
      `}
    />
  );
}

export default LoadingSpinner;
