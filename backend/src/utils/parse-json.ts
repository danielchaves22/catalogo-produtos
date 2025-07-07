import { logger } from './logger'

export function parseJsonSafe(text: string): any | undefined {
  try {
    return JSON.parse(text)
  } catch (error) {
    logger.error('Erro ao analisar JSON:', error)
    return undefined
  }
}
