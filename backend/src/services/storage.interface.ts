export interface StorageProvider {
  upload(file: Buffer, path: string): Promise<string>;
  get(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  getSignedUrl?(path: string, expiresInSeconds?: number, options?: { filename?: string }): Promise<string>;
}
