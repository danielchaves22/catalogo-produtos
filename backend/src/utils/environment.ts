import { APP_ENV } from '../config';

type AppEnv = 'local' | 'hml' | 'prod';

export const isLocal = (): boolean => APP_ENV === 'local';
export const isHml = (): boolean => APP_ENV === 'hml';
export const isProd = (): boolean => APP_ENV === 'prod';

interface StoragePathParams {
  identifier: string; // id_superuser ou cnpj
  catalogo?: string; // codigo do catalogo
  produto?: string; // numero do produto
  type: 'certificados' | 'anexos';
}

export function getStoragePath({ identifier, catalogo, produto, type }: StoragePathParams): string {
  if (type === 'certificados') {
    return `${identifier}/certificados`;
  }
  if (!catalogo || !produto) {
    throw new Error('catalogo e produto são obrigatórios para anexos');
  }
  return `${identifier}/${catalogo}/${produto}`;
}

export type { AppEnv };
