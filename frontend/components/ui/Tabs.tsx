import React, { useState } from 'react';

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  initialId?: string;
  className?: string;
}

export function Tabs({ tabs, initialId, className = '' }: TabsProps) {
  const [active, setActive] = useState(initialId || tabs[0]?.id);
  const current = tabs.find(t => t.id === active);

  return (
    <div className={className}>
      <div className="border-b border-gray-700 mb-4 flex">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`py-2 px-4 text-sm transition-colors ${
              active === tab.id
                ? 'border-b-2 border-accent text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{current?.content}</div>
    </div>
  );
}
