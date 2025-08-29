import { APP_ENV } from '../config';
import { StorageProvider } from './storage.interface';
import { LocalStorageProvider } from './local-storage.service';
import { S3StorageProvider } from './s3-storage.service';

export function storageFactory(): StorageProvider {
  if (APP_ENV === 'local') {
    return new LocalStorageProvider();
  }
  return new S3StorageProvider();
}
