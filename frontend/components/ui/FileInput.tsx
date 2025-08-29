import React from 'react';
import { Hint } from './Hint';

interface FileInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function FileInput({ label, error, hint, className = '', ...props }: FileInputProps) {
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label className="block text-sm font-medium mb-1 text-gray-300" htmlFor={props.id}>
          {label}
          {props.required && <span className="text-red-400 ml-1">*</span>}
          {hint && <Hint text={hint} />}
        </label>
      )}
      <input
        id={props.id}
        type="file"
        className="w-full text-sm text-gray-300 bg-[#1e2126] border border-gray-700 rounded-md file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600"
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}
