// frontend/lib/validation.ts (CORRIGIDO)
/**
 * Utilitários de validação para frontend (espelha o backend)
 */

/**
 * Remove caracteres não numéricos
 */
export function onlyNumbers(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

/**
 * Valida CPF
 */
export function isValidCPF(cpf: string | null | undefined): boolean {
  if (!cpf) return false;
  
  const cleanCPF = onlyNumbers(cpf);
  
  if (cleanCPF.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
  }
  let remainder = 11 - (sum % 11);
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.charAt(9))) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
  }
  remainder = 11 - (sum % 11);
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.charAt(10))) return false;
  
  return true;
}

/**
 * Valida CNPJ
 */
export function isValidCNPJ(cnpj: string | null | undefined): boolean {
  if (!cnpj) return false;
  
  const cleanCNPJ = onlyNumbers(cnpj);
  
  if (cleanCNPJ.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cleanCNPJ)) return false;
  
  let sum = 0;
  let weight = 2;
  for (let i = 11; i >= 0; i--) {
    sum += parseInt(cleanCNPJ.charAt(i)) * weight;
    weight++;
    if (weight === 10) weight = 2;
  }
  let remainder = sum % 11;
  if (remainder < 2) remainder = 0;
  else remainder = 11 - remainder;
  if (remainder !== parseInt(cleanCNPJ.charAt(12))) return false;
  
  sum = 0;
  weight = 2;
  for (let i = 12; i >= 0; i--) {
    sum += parseInt(cleanCNPJ.charAt(i)) * weight;
    weight++;
    if (weight === 10) weight = 2;
  }
  remainder = sum % 11;
  if (remainder < 2) remainder = 0;
  else remainder = 11 - remainder;
  if (remainder !== parseInt(cleanCNPJ.charAt(13))) return false;
  
  return true;
}

/**
 * Valida CEP
 */
export function isValidCEP(cep: string | null | undefined): boolean {
  if (!cep) return false;
  
  const cleanCEP = onlyNumbers(cep);
  return cleanCEP.length === 8 && cleanCEP !== '00000000';
}

/**
 * Valida CPF ou CNPJ automaticamente
 */
export function isValidCPFOrCNPJ(value: string | null | undefined): { valid: boolean; type: 'CPF' | 'CNPJ' | null; message?: string } {
  if (!value) {
    return { 
      valid: false, 
      type: null, 
      message: 'Campo obrigatório' 
    };
  }
  
  const cleanValue = onlyNumbers(value);
  
  if (cleanValue.length === 11) {
    const valid = isValidCPF(cleanValue);
    return { 
      valid, 
      type: 'CPF',
      message: valid ? undefined : 'CPF inválido'
    };
  } else if (cleanValue.length === 14) {
    const valid = isValidCNPJ(cleanValue);
    return { 
      valid, 
      type: 'CNPJ',
      message: valid ? undefined : 'CNPJ inválido'
    };
  }
  
  return { 
    valid: false, 
    type: null, 
    message: 'Deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos) válido' 
  };
}

/**
 * Formata CPF
 */
export function formatCPF(cpf: string | null | undefined): string {
  if (!cpf) return '';
  
  const cleanCPF = onlyNumbers(cpf);
  if (cleanCPF.length !== 11) return cpf;
  
  return cleanCPF.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Formata CNPJ
 */
export function formatCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return '';
  
  const cleanCNPJ = onlyNumbers(cnpj);
  if (cleanCNPJ.length !== 14) return cnpj;
  
  return cleanCNPJ.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

/**
 * Formata CEP
 */
export function formatCEP(cep: string | null | undefined): string {
  if (!cep) return '';
  
  const cleanCEP = onlyNumbers(cep);
  if (cleanCEP.length !== 8) return cep;
  
  return cleanCEP.replace(/(\d{5})(\d{3})/, '$1-$2');
}

/**
 * Formata CPF ou CNPJ automaticamente
 */
export function formatCPFOrCNPJ(value: string | null | undefined): string {
  if (!value) return '';
  
  const cleanValue = onlyNumbers(value);
  
  if (cleanValue.length === 11) {
    return formatCPF(cleanValue);
  } else if (cleanValue.length === 14) {
    return formatCNPJ(cleanValue);
  }
  
  return value;
}

/**
 * Mensagens de erro padrão
 */
export const validationMessages = {
  cpf: {
    invalid: 'CPF inválido',
    required: 'CPF é obrigatório',
    format: 'CPF deve ter 11 dígitos'
  },
  cnpj: {
    invalid: 'CNPJ inválido',
    required: 'CNPJ é obrigatório',
    format: 'CNPJ deve ter 14 dígitos'
  },
  cep: {
    invalid: 'CEP inválido',
    required: 'CEP é obrigatório',
    format: 'CEP deve ter 8 dígitos'
  },
  cpfCnpj: {
    invalid: 'CPF ou CNPJ inválido',
    required: 'CPF ou CNPJ é obrigatório',
    format: 'Deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos)'
  }
};