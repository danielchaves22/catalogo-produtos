import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { StorageProvider } from './storage.interface';

export class LocalStorageProvider implements StorageProvider {
  constructor(private baseDir = path.join(os.homedir(), '.temp', 'uploads')) {}

  async upload(file: Buffer, filePath: string): Promise<string> {
    const fullPath = path.join(this.baseDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file);
    return fullPath;
  }

  async get(filePath: string): Promise<Buffer> {
    const fullPath = path.join(this.baseDir, filePath);
    return fs.readFile(fullPath);
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = path.join(this.baseDir, filePath);
    await fs.unlink(fullPath).catch(() => {});
  }
}
