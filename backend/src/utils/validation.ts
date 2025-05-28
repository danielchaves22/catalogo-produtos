// backend/src/utils/validation.ts
/**
 * Utilitários de validação para CPF, CNPJ, CEP
 */

/**
 * Remove caracteres não numéricos
 */
export function onlyNumbers(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Valida CPF
 */
export function isValidCPF(cpf: string): boolean {
  const cleanCPF = onlyNumbers(cpf);
  
  // CPF deve ter 11 dígitos
  if (cleanCPF.length !== 11) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false;
  
  // Valida primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
  }
  let remainder = 11 - (sum % 11);
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.charAt(9))) return false;
  
  // Valida segundo dígito verificador
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
export function isValidCNPJ(cnpj: string): boolean {
  const cleanCNPJ = onlyNumbers(cnpj);
  
  // CNPJ deve ter 14 dígitos
  if (cleanCNPJ.length !== 14) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{13}$/.test(cleanCNPJ)) return false;
  
  // Valida primeiro dígito verificador
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
  
  // Valida segundo dígito verificador
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
export function isValidCEP(cep: string): boolean {
  const cleanCEP = onlyNumbers(cep);
  
  // CEP deve ter 8 dígitos
  if (cleanCEP.length !== 8) return false;
  
  // Verifica se não são todos zeros
  if (cleanCEP === '00000000') return false;
  
  return true;
}

/**
 * Valida CPF ou CNPJ automaticamente
 */
export function isValidCPFOrCNPJ(value: string): { valid: boolean; type: 'CPF' | 'CNPJ' | null } {
  const cleanValue = onlyNumbers(value);
  
  if (cleanValue.length === 11) {
    return { valid: isValidCPF(cleanValue), type: 'CPF' };
  } else if (cleanValue.length === 14) {
    return { valid: isValidCNPJ(cleanValue), type: 'CNPJ' };
  }
  
  return { valid: false, type: null };
}

/**
 * Formata CPF
 */
export function formatCPF(cpf: string): string {
  const cleanCPF = onlyNumbers(cpf);
  if (cleanCPF.length !== 11) return cpf;
  
  return cleanCPF.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Formata CNPJ
 */
export function formatCNPJ(cnpj: string): string {
  const cleanCNPJ = onlyNumbers(cnpj);
  if (cleanCNPJ.length !== 14) return cnpj;
  
  return cleanCNPJ.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

/**
 * Formata CEP
 */
export function formatCEP(cep: string): string {
  const cleanCEP = onlyNumbers(cep);
  if (cleanCEP.length !== 8) return cep;
  
  return cleanCEP.replace(/(\d{5})(\d{3})/, '$1-$2');
}

/**
 * Formata CPF ou CNPJ automaticamente
 */
export function formatCPFOrCNPJ(value: string): string {
  const cleanValue = onlyNumbers(value);
  
  if (cleanValue.length === 11) {
    return formatCPF(cleanValue);
  } else if (cleanValue.length === 14) {
    return formatCNPJ(cleanValue);
  }
  
  return value;
}

/**
 * Tipos de validação personalizados para Zod
 */
export const customValidations = {
  cpf: (value: string) => {
    if (!value) return true; // Campo opcional
    return isValidCPF(value);
  },
  cnpj: (value: string) => {
    if (!value) return true; // Campo opcional
    return isValidCNPJ(value);
  },
  cpfOrCnpj: (value: string) => {
    if (!value) return true; // Campo opcional
    return isValidCPFOrCNPJ(value).valid;
  },
  cep: (value: string) => {
    if (!value) return true; // Campo opcional
    return isValidCEP(value);
  }
};