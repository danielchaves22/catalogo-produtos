import { logger } from './logger'

export function parseJsonSafe(text: string): any | undefined {
  try {
    return JSON.parse(text)
  } catch (_) {
    try {
      const normalized = text
        .replace(/\b'([^']*)'(?=\s*:)/g, '"$1"')
        .replace(/:\s*'([^']*)'/g, ': "$1"')
      return JSON.parse(normalized)
    } catch (error) {
      logger.error('Erro ao analisar JSON:', error)
      return undefined
    }
  }
}
