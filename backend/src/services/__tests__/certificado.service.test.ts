process.env.CERT_PASSWORD_SECRET = '1'.repeat(64);

jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: {
    certificado: { findFirst: jest.fn() }
  }
}));

jest.mock('../storage.factory', () => ({
  storageFactory: jest.fn()
}));

const { CertificadoService } = require('../certificado.service');
const { catalogoPrisma } = require('../../utils/prisma');
const { storageFactory } = require('../storage.factory');
const { encrypt } = require('../../utils/crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function gerarPfx(senha: string): Buffer {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfx-'));
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  const pfxPath = path.join(dir, 'cert.pfx');
  execSync(`openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 1 -nodes -subj "/CN=Teste"`);
  execSync(`openssl pkcs12 -export -out ${pfxPath} -inkey ${keyPath} -in ${certPath} -passout pass:${senha}`);
  const pfx = fs.readFileSync(pfxPath);
  fs.rmSync(dir, { recursive: true, force: true });
  return pfx;
}

describe('CertificadoService - extrairInformacoes', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('retorna dados do certificado válido', async () => {
    const buffer = gerarPfx('1234');
    (catalogoPrisma.certificado.findFirst as jest.Mock).mockResolvedValue({
      pfxPath: 'caminho',
      senha: encrypt('1234')
    });
    (storageFactory as jest.Mock).mockReturnValue({ get: jest.fn().mockResolvedValue(buffer) });

    const service = new CertificadoService();
    const info = await service.extrairInformacoes(1, 1);
    expect(info.subject).toContain('CN=Teste');
    expect(info.issuer).toContain('CN=Teste');
  });

  it('erro quando senha inválida', async () => {
    const buffer = gerarPfx('1234');
    (catalogoPrisma.certificado.findFirst as jest.Mock).mockResolvedValue({
      pfxPath: 'caminho',
      senha: encrypt('errada')
    });
    (storageFactory as jest.Mock).mockReturnValue({ get: jest.fn().mockResolvedValue(buffer) });

    const service = new CertificadoService();
    await expect(service.extrairInformacoes(1, 1)).rejects.toThrow('Falha ao ler certificado');
  });

  it('erro quando pfx corrompido', async () => {
    (catalogoPrisma.certificado.findFirst as jest.Mock).mockResolvedValue({
      pfxPath: 'caminho',
      senha: encrypt('1234')
    });
    (storageFactory as jest.Mock).mockReturnValue({ get: jest.fn().mockResolvedValue(Buffer.from('corrompido')) });

    const service = new CertificadoService();
    await expect(service.extrairInformacoes(1, 1)).rejects.toThrow('Falha ao ler certificado');
  });
});
