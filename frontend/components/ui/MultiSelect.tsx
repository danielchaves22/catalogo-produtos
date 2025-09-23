// frontend/components/ui/MultiSelect.tsx - Dropdown de múltipla escolha com checkboxes
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { Hint } from './Hint';

export interface MultiOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  label?: string;
  options: MultiOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
  hint?: string;
  required?: boolean;
}

export function MultiSelect({
  label,
  options,
  values,
  onChange,
  placeholder = 'Selecione...',
  disabled = false,
  error,
  className = '',
  hint,
  required,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      const clickedInsideTrigger = !!containerRef.current?.contains(target);
      const clickedInsidePortal = !!portalRef.current?.contains(target);
      if (clickedInsideTrigger || clickedInsidePortal) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useLayoutEffect(() => {
    function updatePosition() {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    if (open) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [open]);

  const toggle = () => !disabled && setOpen(o => !o);

  const isChecked = (v: string) => values.includes(v);
  const setChecked = (v: string, checked: boolean) => {
    const set = new Set(values);
    if (checked) set.add(v); else set.delete(v);
    onChange(Array.from(set));
  };

  const selectedLabels = options
    .filter(o => values.includes(o.value))
    .map(o => o.label);

  function renderButtonText() {
    if (selectedLabels.length === 0) return placeholder;
    if (selectedLabels.length <= 2) return selectedLabels.join(', ');
    return `${selectedLabels.slice(0, 2).join(', ')} +${selectedLabels.length - 2}`;
  }

  return (
    <div className={`mb-4 ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium mb-2 text-gray-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
          {hint && <Hint text={hint} />}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={toggle}
          ref={buttonRef}
          className={`w-full px-3 py-2 bg-[#1e2126] border rounded-md text-left text-sm flex items-center justify-between ${
            error ? 'border-red-500' : 'border-gray-700'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'}`}
        >
          <span className={selectedLabels.length === 0 ? 'text-gray-400' : 'text-white'}>
            {renderButtonText()}
          </span>
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && !disabled && mounted && ReactDOM.createPortal(
          <div
            className="z-[9999] bg-[#1e2126] border border-gray-700 rounded-md shadow-lg max-h-64 overflow-auto"
            style={{ position: 'fixed', top: position.top, left: position.left, width: position.width }}
            ref={portalRef}
          >
            {options.map(opt => (
              <label
                key={opt.value}
                className={`flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-[#262b36] ${
                  isChecked(opt.value) ? 'text-[#f59e0b]' : 'text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-700 bg-[#1e2126]"
                    checked={isChecked(opt.value)}
                    onChange={e => setChecked(opt.value, e.target.checked)}
                  />
                  <span className="truncate">{opt.label}</span>
                </div>
                {isChecked(opt.value) && <Check size={16} className="text-[#f59e0b]" />}
              </label>
            ))}
          </div>,
          document.body
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}
