import fs from 'fs/promises';
import path from 'path';

describe('StorageFactory', () => {
  afterEach(async () => {
    delete process.env.APP_ENV;
    jest.resetModules();
    await fs.rm(path.resolve('uploads'), { recursive: true, force: true });
  });

  it('deve usar armazenamento local quando APP_ENV=local', async () => {
    process.env.APP_ENV = 'local';
    const { storageFactory } = await import('../storage.factory');
    const { LocalStorageProvider } = await import('../local-storage.service');
    const provider = storageFactory();
    expect(provider).toBeInstanceOf(LocalStorageProvider);
    const conteudo = Buffer.from('teste');
    await provider.upload(conteudo, 'exemplo/arquivo.txt');
    const resultado = await provider.get('exemplo/arquivo.txt');
    expect(resultado.toString()).toBe('teste');
  });

  it('deve usar S3 quando APP_ENV=hml', async () => {
    process.env.APP_ENV = 'hml';
    const { storageFactory } = await import('../storage.factory');
    const { S3StorageProvider } = await import('../s3-storage.service');
    const provider = storageFactory();
    expect(provider).toBeInstanceOf(S3StorageProvider);
  });
});
