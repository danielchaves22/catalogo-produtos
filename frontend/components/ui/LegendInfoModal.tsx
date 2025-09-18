import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { LegendItem } from '@/constants/statusLegends';

interface LegendInfoModalProps {
  title: string;
  legend: LegendItem[];
  triggerAriaLabel?: string;
}

export function LegendInfoModal({ title, legend, triggerAriaLabel = 'Ver detalhes' }: LegendInfoModalProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={triggerAriaLabel}
        className="ml-1 flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold text-gray-200 transition-colors hover:bg-gray-200/25"
      >
        ?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div
            ref={containerRef}
            className="w-full max-w-2xl rounded-2xl border border-[#4a5161] bg-[#2f3542] text-gray-200 shadow-[0_22px_60px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#4a5161] bg-[#3a4253] rounded-t-2xl">
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 transition-colors hover:text-white"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-3">
              {legend.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-4 rounded-xl border border-[#3f4555] bg-[#202530] px-5 py-3"
                >
                  <span className={item.badgeClass}>{item.label}</span>
                  <span className="flex-1 text-sm font-semibold text-gray-200 uppercase tracking-wide">
                    {item.description}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-end px-6 pb-5">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default LegendInfoModal;
