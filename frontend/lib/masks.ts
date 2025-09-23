// frontend/lib/masks.ts
// Utilitários para aplicar máscaras dinâmicas baseadas em padrões vindos do backend.

const PATTERN_PLACEHOLDER = '#';

/**
 * Remove todos os caracteres que não são dígitos.
 * Mantemos apenas números porque os padrões do backend utilizam '#'
 * para representar posições numéricas.
 */
export function stripNonDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Conta o número de placeholders disponíveis em um padrão.
 */
function countPlaceholders(pattern: string): number {
  return (pattern.match(new RegExp(PATTERN_PLACEHOLDER, 'g')) || []).length;
}

/**
 * Aplica o padrão informado ao valor digitado, retornando tanto a versão
 * formatada quanto a representação sem os caracteres especiais.
 */
export function formatValueWithPattern(value: string, pattern: string): {
  formatted: string;
  clean: string;
} {
  const digitsOnly = stripNonDigits(value);
  const maxDigits = countPlaceholders(pattern);
  const limitedDigits = digitsOnly.slice(0, maxDigits);

  let formatted = '';
  let digitIndex = 0;

  for (const char of pattern) {
    if (char === PATTERN_PLACEHOLDER) {
      if (digitIndex < limitedDigits.length) {
        formatted += limitedDigits[digitIndex];
        digitIndex += 1;
      } else {
        break;
      }
    } else {
      if (digitIndex < limitedDigits.length) {
        formatted += char;
      } else {
        break;
      }
    }
  }

  return {
    formatted,
    clean: limitedDigits,
  };
}

/**
 * Sugestão de placeholder para inputs com padrão dinâmico.
 */
export function getPatternPlaceholder(pattern: string): string {
  return pattern.replace(new RegExp(PATTERN_PLACEHOLDER, 'g'), '0');
}

/**
 * Tamanho máximo permitido no input com base no padrão informado.
 */
export function getPatternMaxLength(pattern: string): number {
  return pattern.length;
}
