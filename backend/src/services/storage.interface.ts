export interface StorageProvider {
  upload(file: Buffer, path: string): Promise<string>;
  get(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
}
