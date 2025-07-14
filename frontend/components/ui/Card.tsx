// frontend/components/ui/Card.tsx
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  headerClassName?: string;
}

export function Card({ children, className = '', headerTitle, headerSubtitle, headerClassName = '' }: CardProps) {
  return (
    <div className={`bg-[#151921] shadow-md rounded-lg overflow-hidden border border-gray-700 ${className}`}>
      {(headerTitle || headerSubtitle) && (
        <div className={`bg-[#151921] px-4 py-2 border-b border-gray-700 ${headerClassName}`}>
          {headerTitle && <h2 className="text-base font-medium text-white">{headerTitle}</h2>}
          {headerSubtitle && <p className="text-xs text-gray-400">{headerSubtitle}</p>}
        </div>
      )}
      <div className={!className?.includes('p-0') ? 'p-6' : ''}>
        {children}
      </div>
    </div>
  );
}