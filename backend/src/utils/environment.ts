import { APP_ENV } from '../config';

type AppEnv = 'local' | 'hml' | 'prod';

export const isLocal = (): boolean => APP_ENV === 'local';
export const isHml = (): boolean => APP_ENV === 'hml';
export const isProd = (): boolean => APP_ENV === 'prod';

interface BucketParams {
  identifier: string; // id_superuser ou cnpj
  catalogo?: string; // codigo do catalogo
  type: 'certificados' | 'anexos';
  env?: AppEnv;
}

export function getBucketName({ identifier, catalogo, type, env = APP_ENV as AppEnv }: BucketParams): string {
  if (env === 'local') {
    const base = type === 'certificados'
      ? `${identifier}/certificados`
      : `${identifier}/${catalogo}/anexos`;
    return base;
  }
  const root = env === 'prod' ? 'catprod-prd' : 'catprod-hml';
  if (type === 'certificados') {
    return `${root}/${identifier}/certificados`;
  }
  if (!catalogo) {
    throw new Error('catalogo é obrigatório para anexos');
  }
  return `${root}/${identifier}/${catalogo}/anexos`;
}

export type { AppEnv };
