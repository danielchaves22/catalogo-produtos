import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf, errors, colorize } = format;

// Formato de log personalizado com metadados serializados (para exibir payloads)
const logFormat = printf(info => {
  const { level, message, timestamp, stack, ...metadata } = info;
  const splat = info[Symbol.for('splat')] as Record<string, unknown>[] | undefined;
  const detalhes = { ...metadata } as Record<string, unknown>;

  if (splat?.length) {
    for (const item of splat) {
      Object.assign(detalhes, item);
    }
  }

  const metadataSerializada = Object.keys(detalhes).length
    ? ` ${JSON.stringify(detalhes)}`
    : '';

  return `${timestamp} [${level}]: ${stack || message}${metadataSerializada}`;
});

export const logger = createLogger({
  level: 'info',
  format: combine(
    colorize(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    new transports.Console(),
    // Se quiser gravar em arquivo:
    // new transports.File({ filename: 'logs/error.log', level: 'error' }),
    // new transports.File({ filename: 'logs/combined.log' })
  ]
});
