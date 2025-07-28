import React, { useEffect, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';

interface HintProps {
  text: string;
}

export function Hint({ text }: HintProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  return (
    <div className="relative inline-block ml-1" ref={ref}>
      <CircleHelp
        size={14}
        className="text-[#f59e0b] cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div className="absolute z-50 w-64 p-2 text-xs text-gray-300 bg-[#1e2126] border border-gray-700 rounded-md mt-1">
          {text}
        </div>
      )}
    </div>
  );
}
