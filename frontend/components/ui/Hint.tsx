import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';

interface HintProps {
  text: string;
}

export function Hint({ text }: HintProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
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

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
      });
    }
  }, [open]);

  return (
    <>
      <div className="inline-block ml-1" ref={triggerRef}>
        <CircleHelp
          size={14}
          className="text-[#f59e0b] cursor-pointer"
          onClick={() => setOpen((v) => !v)}
        />
      </div>
      {open &&
        createPortal(
          <div
            ref={tooltipRef}
            className="z-50 w-64 p-2 text-xs text-gray-300 bg-[#1e2126] border border-gray-700 rounded-md"
            style={{ position: 'absolute', top: coords.top, left: coords.left }}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
