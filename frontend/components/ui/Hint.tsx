import React, { useState } from 'react';
import { CircleHelp } from 'lucide-react';

interface HintProps {
  text: string;
}

export function Hint({ text }: HintProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block ml-1">
      <CircleHelp
        size={14}
        className="text-gray-400 cursor-pointer"
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
