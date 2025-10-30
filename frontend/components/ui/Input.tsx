// frontend/components/ui/Input.tsx
import React from 'react';
import { Hint } from './Hint';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  labelRightContent?: React.ReactNode;
}

export function Input({ label, error, hint, labelRightContent, className = '', ...props }: InputProps) {
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label
          className={`block text-sm font-medium mb-1 text-gray-300 ${
            labelRightContent ? 'flex items-center justify-between gap-2' : ''
          }`}
          htmlFor={props.id}
        >
          <span className="flex items-center">
            {label}
            {props.required && <span className="text-red-400 ml-1">*</span>}
            {hint && <Hint text={hint} />}
          </span>
          {labelRightContent && <span className="text-xs text-gray-400">{labelRightContent}</span>}
        </label>
      )}
      <input
        id={props.id}
        className="w-full px-2 py-1 text-sm bg-[#1e2126] border border-gray-700 text-white rounded-md focus:outline-none focus:ring focus:border-blue-500"
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>  );}