// frontend/components/ui/Select.tsx (CORRIGIDO)
import React from 'react';
import { Hint } from './Hint';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string; label: string }>;
  error?: string;
  placeholder?: string;
  hint?: string;
}

export function Select({ label, options, className = '', error, placeholder = 'Selecione...', hint, ...props }: SelectProps) {
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label className="block text-sm font-medium mb-1 text-gray-300" htmlFor={props.id}>
          {label}
          {props.required && <span className="text-red-400 ml-1">*</span>}
          {hint && <Hint text={hint} />}
        </label>
      )}
      <select
        {...props}
        className={`w-full px-2 py-1 text-sm bg-[#1e2126] border rounded-md focus:outline-none focus:ring focus:border-blue-500 text-white appearance-none ${
          error ? 'border-red-500' : 'border-gray-700'
        }`}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
          backgroundPosition: 'right 0.5rem center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '1.5em 1.5em'
        }}
      >
        <option value="" hidden>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>  );}