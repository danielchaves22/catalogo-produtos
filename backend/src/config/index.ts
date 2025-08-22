import dotenv from 'dotenv';
dotenv.config();

export const PORT = process.env.PORT || 3000;
export const JWT_SECRET = process.env.JWT_SECRET || 'defaultsecret';
export const DATABASE_URL = process.env.DATABASE_URL || '';
export const API_VERSION = process.env.API_VERSION || 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;
export const APP_ENV = (process.env.APP_ENV || 'local').toLowerCase();
