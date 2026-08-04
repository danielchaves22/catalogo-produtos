import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf, errors, colorize } = format;

const MAX_SERIALIZATION_DEPTH = 5;
const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'csrf',
  'passphrase',
  'password',
  'pfx',
  'senha',
  'token',
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    SENSITIVE_KEYS.includes(normalized) ||
    normalized === 'x-csrf-token' ||
    normalized === 'set-cookie' ||
    normalized.includes('authorization') ||
    normalized.includes('passphrase') ||
    normalized.includes('password') ||
    normalized.includes('senha') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('token') ||
    normalized.endsWith('key')
  );
}

function resumirHttpInterno(value: Record<string, unknown>) {
  return {
    tipo: value.constructor?.name ?? 'Object',
  };
}

function normalizarError(error: Error, seen: WeakSet<object>, depth: number): Record<string, unknown> {
  const erro = error as Error & {
    code?: unknown;
    config?: Record<string, unknown>;
    response?: Record<string, unknown>;
    status?: unknown;
  };

  const normalizado: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  if (erro.code !== undefined) {
    normalizado.code = erro.code;
  }
  if (erro.status !== undefined) {
    normalizado.status = erro.status;
  }
  if (erro.response) {
    normalizado.response = sanitizarValor(
      {
        status: erro.response.status,
        statusText: erro.response.statusText,
        data: erro.response.data,
      },
      seen,
      depth + 1
    );
  }
  if (erro.config) {
    normalizado.config = sanitizarValor(
      {
        baseURL: erro.config.baseURL,
        url: erro.config.url,
        method: erro.config.method,
        params: erro.config.params,
        timeout: erro.config.timeout,
        headers: erro.config.headers,
      },
      seen,
      depth + 1
    );
  }

  for (const [key, value] of Object.entries(erro)) {
    if (key === 'config' || key === 'request' || key === 'response') {
      continue;
    }
    normalizado[key] = sanitizarValor(value, seen, depth + 1, key);
  }

  return normalizado;
}

function sanitizarValor(
  value: unknown,
  seen: WeakSet<object>,
  depth: number = 0,
  key: string = ''
): unknown {
  if (isSensitiveKey(key)) {
    return '[REDACTED]';
  }

  if (value === null || value === undefined || typeof value !== 'object') {
    if (typeof value === 'function') {
      return `[Function ${(value as Function).name || 'anonymous'}]`;
    }
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.byteLength} bytes]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  const objectValue = value as Record<string, unknown>;
  const constructorName = objectValue.constructor?.name;
  if (constructorName === 'ClientRequest' || constructorName === 'IncomingMessage') {
    return resumirHttpInterno(objectValue);
  }

  if (value instanceof Error) {
    seen.add(value);
    const normalizado = normalizarError(value, seen, depth);
    seen.delete(value);
    return normalizado;
  }

  if (depth >= MAX_SERIALIZATION_DEPTH) {
    return `[${constructorName ?? 'Object'}]`;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const itens = value.slice(0, 50).map(item => sanitizarValor(item, seen, depth + 1));
    if (value.length > 50) {
      itens.push(`[+${value.length - 50} itens]`);
    }
    seen.delete(value);
    return itens;
  }

  const resultado: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(objectValue)) {
    resultado[entryKey] = sanitizarValor(entryValue, seen, depth + 1, entryKey);
  }

  seen.delete(value);
  return resultado;
}

export function serializarMetadadosLog(metadata: Record<string, unknown>): string {
  try {
    return JSON.stringify(sanitizarValor(metadata, new WeakSet<object>()));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ logSerializationError: message });
  }
}

// Formato de log personalizado com metadados serializados (para exibir payloads)
const logFormat = printf(info => {
  const { level, message, timestamp, stack, ...metadata } = info;
  const splat = info[Symbol.for('splat')] as Record<string, unknown>[] | undefined;
  const detalhes = { ...metadata } as Record<string, unknown>;

  if (splat?.length) {
    splat.forEach((item, index) => {
      if (item instanceof Error) {
        detalhes.error = item;
        return;
      }

      if (item && typeof item === 'object') {
        Object.assign(detalhes, item);
        return;
      }

      detalhes[`arg${index}`] = item;
    });
  }

  const metadataSerializada = Object.keys(detalhes).length
    ? ` ${serializarMetadadosLog(detalhes)}`
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
