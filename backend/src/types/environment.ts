// backend/src/types/environment.d.ts
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      PORT?: string;
      DATABASE_URL: string;
      JWT_SECRET: string;
      DB_USER?: string;
      DB_PASSWORD?: string;
      LEGACY_PASSWORD_SALT?: string;
      CATALOG_SCHEMA_NAME?: string;
    }
  }
}