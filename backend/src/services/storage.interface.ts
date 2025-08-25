export interface StorageProvider {
  upload(file: Buffer, path: string): Promise<string>;
  get(path: string): Promise<Buffer>;
}
