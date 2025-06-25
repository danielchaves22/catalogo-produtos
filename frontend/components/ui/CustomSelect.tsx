// frontend/components/ui/CustomSelect.tsx (NOVO - Select customizado)
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  label?: string;
  options: Option[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  name?: string;
  id?: string;
}

export function CustomSelect({
  label,
  options,
  value = '',
  onChange,
  placeholder = 'Selecione uma opção',
  error,
  disabled = false,
  required = false,
  className = '',
  name,
  id
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown quando clica fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Encontra a opção selecionada
  const selectedOption = options.find(option => option.value === value);

  const handleSelect = (optionValue: string) => {
    onChange?.(optionValue);
    setIsOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(!isOpen);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label className="block text-sm font-medium mb-1 text-gray-300" htmlFor={id}>
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative" ref={selectRef}>
        {/* Input oculto para formulários */}
        <input
          type="hidden"
          name={name}
          value={value}
        />
        
        {/* Botão do select */}
        <button
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
        className={`w-full px-2 py-1.5 bg-[#1e2126] border rounded-md focus:outline-none focus:ring focus:border-blue-500 text-white text-left flex items-center justify-between transition-colors ${
            error ? 'border-red-500' : 'border-gray-700'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'}`}
        >
          <span className={selectedOption ? 'text-white' : 'text-gray-400'}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown 
            size={16} 
            className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Dropdown */}
        {isOpen && !disabled && (
          <div className="absolute z-50 w-full mt-1 bg-[#1e2126] border border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`w-full px-3 py-2 text-left hover:bg-[#262b36] flex items-center justify-between transition-colors ${
                  option.value === value ? 'bg-[#262b36] text-[#f59e0b]' : 'text-white'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {option.value === value && (
                  <Check size={16} className="text-[#f59e0b] flex-shrink-0 ml-2" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}