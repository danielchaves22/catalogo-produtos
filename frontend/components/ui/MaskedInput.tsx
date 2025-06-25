// frontend/components/ui/MaskedInput.tsx (CORRIGIDO)
import React, { useState, useEffect } from 'react';

interface MaskedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  error?: string;
  mask: 'cpf' | 'cnpj' | 'cpf-cnpj' | 'cep';
  value: string | undefined;
  onChange: (value: string, formattedValue: string) => void;
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
function applyMask(value: string, mask: MaskedInputProps['mask']): string {
  // Se value for falsy, retorna string vazia
  if (!value) return '';
  
  switch (mask) {
    case 'cpf':
      return applyCPFMask(value);
    case 'cnpj':
      return applyCNPJMask(value);
    case 'cpf-cnpj':
      return applyCPFOrCNPJMask(value);
    case 'cep':
      return applyCEPMask(value);
    default:
      return value;
  }
}

/**
 * Obtém placeholder baseado na máscara
 */
function getPlaceholder(mask: MaskedInputProps['mask']): string {
  switch (mask) {
    case 'cpf':
      return '000.000.000-00';
    case 'cnpj':
      return '00.000.000/0000-00';
    case 'cpf-cnpj':
      return 'CPF: 000.000.000-00 ou CNPJ: 00.000.000/0000-00';
    case 'cep':
      return '00000-000';
    default:
      return '';
  }
}

/**
 * Obtém tamanho máximo baseado na máscara
 */
function getMaxLength(mask: MaskedInputProps['mask']): number | undefined {
  switch (mask) {
    case 'cpf':
      return 14; // 000.000.000-00
    case 'cnpj':
      return 18; // 00.000.000/0000-00
    case 'cpf-cnpj':
      return 18; // Maior entre CPF e CNPJ
    case 'cep':
      return 9;  // 00000-000
    default:
      return undefined;
  }
}

export function MaskedInput({
  label,
  error,
  mask,
  value,
  onChange,
  className = '',
  placeholder,
  ...props
}: MaskedInputProps) {
  const [displayValue, setDisplayValue] = useState('');

  // CORRIGIDO: Sincroniza valor inicial e mudanças externas
  useEffect(() => {
    // Garantir que value seja uma string antes de aplicar a máscara
    const safeValue = value || '';
    const masked = applyMask(safeValue, mask);
    setDisplayValue(masked);
  }, [value, mask]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const maskedValue = applyMask(inputValue, mask);
    const cleanValue = onlyNumbers(inputValue);
    
    setDisplayValue(maskedValue);
    onChange(cleanValue, maskedValue);
  };

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label className="block text-sm font-medium mb-1 text-gray-300" htmlFor={props.id}>
          {label}
          {props.required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <input
        {...props}
        type="text"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder || getPlaceholder(mask)}
        maxLength={getMaxLength(mask)}
        className={`w-full px-2 py-1.5 bg-[#1e2126] border rounded-md focus:outline-none focus:ring focus:border-blue-500 text-white ${
          error ? 'border-red-500' : 'border-gray-700'
        }`}
      />
      {error && (
        <p className="mt-1 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}