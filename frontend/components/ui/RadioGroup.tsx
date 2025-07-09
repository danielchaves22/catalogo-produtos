import React from 'react';

interface Option {
  value: string;
  label: string;
}

interface RadioGroupProps {
  label?: string;
  options: Option[];
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  name?: string;
  className?: string;
  error?: string;
}

export function RadioGroup({
  label,
  options,
  value = '',
  onChange,
  required = false,
  name,
  className = '',
  error
}: RadioGroupProps) {
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label className="block text-sm font-medium mb-1 text-gray-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <div className="flex items-center gap-4 text-sm">
        {options.map(opt => (
          <label key={opt.value} className="inline-flex items-center gap-2">
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange?.(opt.value)}
              className="form-radio text-accent bg-[#1e2126] border-gray-700 focus:ring focus:border-blue-500"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}
