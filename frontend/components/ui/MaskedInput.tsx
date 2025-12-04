// frontend/components/ui/MaskedInput.tsx (CORRIGIDO)
import React, { useState, useEffect } from 'react';
import { Hint } from './Hint';
import {
  formatValueWithPattern,
  getPatternMaxLength,
  getPatternPlaceholder,
} from '@/lib/masks';

interface MaskedInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  error?: string;
  hint?: string;
  mask?: 'cpf' | 'cnpj' | 'cpf-cnpj' | 'cep' | 'ncm';
  pattern?: string;
  value: string | undefined;
  onChange: (value: string, formattedValue: string) => void;
  inputClassName?: string;
}

/**
 * Remove caracteres não numéricos
 */
function onlyNumbers(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Aplica máscara de CPF
 */
function applyCPFMask(value: string): string {
  const numbers = onlyNumbers(value);
  if (numbers.length <= 11) {
    return numbers
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2');
  }
  return value;
}

/**
 * Aplica máscara de CNPJ
 */
function applyCNPJMask(value: string): string {
  const numbers = onlyNumbers(value);
  if (numbers.length <= 14) {
    return numbers
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})/, '$1-$2');
  }
  return value;
}

/**
 * Aplica máscara de CEP
 */
function applyCEPMask(value: string): string {
  const numbers = onlyNumbers(value);
  if (numbers.length <= 8) {
    return numbers.replace(/(\d{5})(\d{1,3})/, '$1-$2');
  }
  return value;
}

function applyNCMMask(value: string): string {
  const numbers = onlyNumbers(value).slice(0, 8);
  if (numbers.length <= 4) return numbers;
  if (numbers.length <= 6) {
    return numbers.replace(/(\d{4})(\d{1,2})/, '$1.$2');
  }
  return numbers.replace(/(\d{4})(\d{2})(\d{1,2})/, '$1.$2.$3');
}

/**
 * Aplica máscara dinâmica para CPF ou CNPJ
 */
function applyCPFOrCNPJMask(value: string): string {
  const numbers = onlyNumbers(value);
  
  if (numbers.length <= 11) {
    return applyCPFMask(value);
  } else {
    return applyCNPJMask(value);
  }
}

/**
 * Aplica a máscara apropriada
 */
function applyMask(value: string, mask?: MaskedInputProps['mask']): string {
  if (!value) return '';
  if (!mask) return value;

  switch (mask) {
    case 'cpf':
      return applyCPFMask(value);
    case 'cnpj':
      return applyCNPJMask(value);
    case 'cpf-cnpj':
      return applyCPFOrCNPJMask(value);
    case 'cep':
      return applyCEPMask(value);
    case 'ncm':
      return applyNCMMask(value);
    default:
      return value;
  }
}

/**
 * Obtém placeholder baseado na máscara
 */
function getPlaceholder(mask?: MaskedInputProps['mask']): string {
  switch (mask) {
    case 'cpf':
      return '000.000.000-00';
    case 'cnpj':
      return '00.000.000/0000-00';
    case 'cpf-cnpj':
      return 'CPF: 000.000.000-00 ou CNPJ: 00.000.000/0000-00';
    case 'cep':
      return '00000-000';
    case 'ncm':
      return '9999.99.99';
    default:
      return '';
  }
}

/**
 * Obtém tamanho máximo baseado na máscara
 */
function getMaxLength(mask?: MaskedInputProps['mask']): number | undefined {
  switch (mask) {
    case 'cpf':
      return 14; // 000.000.000-00
    case 'cnpj':
      return 18; // 00.000.000/0000-00
    case 'cpf-cnpj':
      return 18; // Maior entre CPF e CNPJ
    case 'cep':
      return 9;  // 00000-000
    case 'ncm':
      return 10; // 9999.99.99
    default:
      return undefined;
  }
}

export function MaskedInput({
  label,
  error,
  hint,
  mask,
  pattern,
  value,
  onChange,
  className = '',
  inputClassName = '',
  placeholder,
  ...props
}: MaskedInputProps) {
  const [displayValue, setDisplayValue] = useState('');

  // CORRIGIDO: Sincroniza valor inicial e mudanças externas
  useEffect(() => {
    // Garantir que value seja uma string antes de aplicar a máscara
    const safeValue = value || '';
    if (pattern) {
      const { formatted } = formatValueWithPattern(safeValue, pattern);
      setDisplayValue(formatted);
    } else {
      const masked = applyMask(safeValue, mask);
      setDisplayValue(masked);
    }
  }, [value, mask, pattern]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (pattern) {
      const { formatted, clean } = formatValueWithPattern(inputValue, pattern);
      setDisplayValue(formatted);
      onChange(clean, formatted);
    } else {
      const maskedValue = applyMask(inputValue, mask);
      const cleanValue = onlyNumbers(inputValue);

      setDisplayValue(maskedValue);
      onChange(cleanValue, maskedValue);
    }
  };

  const resolvedPlaceholder =
    placeholder || (pattern ? getPatternPlaceholder(pattern) : getPlaceholder(mask));
  const resolvedMaxLength = pattern ? getPatternMaxLength(pattern) : getMaxLength(mask);

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
        {...props}
        type="text"
        value={displayValue}
        onChange={handleChange}
        placeholder={resolvedPlaceholder}
        maxLength={resolvedMaxLength}
        className={`w-full px-2 py-1 text-sm bg-[#1e2126] border rounded-md focus:outline-none focus:ring focus:border-blue-500 text-white ${
          error ? 'border-red-500' : 'border-gray-700'
        } ${inputClassName}`}
      />
      {error && (
        <p className="mt-1 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}