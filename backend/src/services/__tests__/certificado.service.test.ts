process.env.CERT_PASSWORD_SECRET = '1'.repeat(64);

jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: {
    certificado: {
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    catalogo: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../storage.factory', () => ({
  storageFactory: jest.fn(),
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
  let storageMock: { get: jest.Mock; upload: jest.Mock; delete: jest.Mock };

  beforeEach(() => {
    storageMock = {
      get: jest.fn(),
      upload: jest.fn(),
      delete: jest.fn(),
    };
    (storageFactory as jest.Mock).mockReturnValue(storageMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('retorna dados do certificado valido', async () => {
    const buffer = gerarPfx('1234');
    (catalogoPrisma.certificado.findFirst as jest.Mock).mockResolvedValue({
      pfxPath: 'caminho',
      senha: encrypt('1234'),
    });
    storageMock.get.mockResolvedValue(buffer);

    const service = new CertificadoService();
    const info = await service.extrairInformacoes(1, 1);
    expect(info.subject).toContain('CN=Teste');
    expect(info.issuer).toContain('CN=Teste');
  });

  it('erro quando senha invalida', async () => {
    const buffer = gerarPfx('1234');
    (catalogoPrisma.certificado.findFirst as jest.Mock).mockResolvedValue({
      pfxPath: 'caminho',
      senha: encrypt('errada'),
    });
    storageMock.get.mockResolvedValue(buffer);

    const service = new CertificadoService();
    await expect(service.extrairInformacoes(1, 1)).rejects.toThrow('Falha ao ler certificado');
  });

  it('erro quando pfx corrompido', async () => {
    (catalogoPrisma.certificado.findFirst as jest.Mock).mockResolvedValue({
      pfxPath: 'caminho',
      senha: encrypt('1234'),
    });
    storageMock.get.mockResolvedValue(Buffer.from('corrompido'));

    const service = new CertificadoService();
    await expect(service.extrairInformacoes(1, 1)).rejects.toThrow('Falha ao ler certificado');
  });
});

describe('CertificadoService - criar com validacao e correcao', () => {
  let storageMock: { get: jest.Mock; upload: jest.Mock; delete: jest.Mock };

  function erroOpenSsl(stderr: string) {
    const erro: any = new Error('falha openssl');
    erro.stderr = stderr;
    return erro;
  }

  beforeEach(() => {
    storageMock = {
      get: jest.fn(),
      upload: jest.fn(),
      delete: jest.fn(),
    };
    (storageFactory as jest.Mock).mockReturnValue(storageMock);
    (catalogoPrisma.certificado.create as jest.Mock).mockResolvedValue({
      id: 10,
      nome: 'certificado',
      compatibilidadeStatus: 'COMPATIVEL',
      validadoEm: new Date('2026-04-09T00:00:00.000Z'),
      detalheValidacao: 'ok',
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('salva certificado compativel sem correcao', async () => {
    const service = new CertificadoService();
    const validarSpy = jest.spyOn(service as any, 'validarPfxComOpenSsl').mockResolvedValue(undefined);
    const converterSpy = jest
      .spyOn(service as any, 'converterPfxParaFormatoCompativel')
      .mockResolvedValue(Buffer.from('nao-usado'));

    const fileBuffer = Buffer.from('conteudo-binario');
    const resultado = await service.criar(
      {
        nome: 'certificado',
        fileContent: fileBuffer.toString('base64'),
        password: '1234',
      },
      99
    );

    expect(validarSpy).toHaveBeenCalledTimes(1);
    expect(converterSpy).not.toHaveBeenCalled();
    expect(storageMock.upload).toHaveBeenCalledWith(fileBuffer, '99/certificados/certificado.pfx');
    expect(catalogoPrisma.certificado.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          compatibilidadeStatus: 'COMPATIVEL',
        }),
      })
    );
    expect(resultado.id).toBe(10);
  });

  it('corrige automaticamente quando pfx legado e tentarCorrigir=true', async () => {
    const service = new CertificadoService();
    const validarSpy = jest
      .spyOn(service as any, 'validarPfxComOpenSsl')
      .mockRejectedValueOnce(erroOpenSsl('Algorithm (RC2-40-CBC : 0) unsupported'))
      .mockResolvedValueOnce(undefined);
    const corrigido = Buffer.from('pfx-corrigido');
    const converterSpy = jest
      .spyOn(service as any, 'converterPfxParaFormatoCompativel')
      .mockResolvedValue(corrigido);

    await service.criar(
      {
        nome: 'certificado',
        fileContent: Buffer.from('pfx-legado').toString('base64'),
        password: '1234',
        tentarCorrigir: true,
      },
      5
    );

    expect(validarSpy).toHaveBeenCalledTimes(2);
    expect(converterSpy).toHaveBeenCalledTimes(1);
    expect(storageMock.upload).toHaveBeenCalledWith(corrigido, '5/certificados/certificado.pfx');
    expect(catalogoPrisma.certificado.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          compatibilidadeStatus: 'CORRIGIDO_AUTOMATICAMENTE',
        }),
      })
    );
  });

  it('retorna erro de incompatibilidade quando tentarCorrigir=false', async () => {
    const service = new CertificadoService();
    jest
      .spyOn(service as any, 'validarPfxComOpenSsl')
      .mockRejectedValue(erroOpenSsl('Algorithm (RC2-40-CBC : 0) unsupported'));

    await expect(
      service.criar(
        {
          nome: 'certificado',
          fileContent: Buffer.from('pfx-legado').toString('base64'),
          password: '1234',
          tentarCorrigir: false,
        },
        3
      )
    ).rejects.toMatchObject({
      code: 'CERTIFICADO_INCOMPATIVEL',
      status: 400,
    });

    expect(storageMock.upload).not.toHaveBeenCalled();
    expect(catalogoPrisma.certificado.create).not.toHaveBeenCalled();
  });

  it('retorna erro quando senha do pfx e invalida', async () => {
    const service = new CertificadoService();
    jest
      .spyOn(service as any, 'validarPfxComOpenSsl')
      .mockRejectedValue(erroOpenSsl('Mac verify error: invalid password?'));

    await expect(
      service.criar(
        {
          nome: 'certificado',
          fileContent: Buffer.from('pfx').toString('base64'),
          password: 'senha-errada',
        },
        7
      )
    ).rejects.toMatchObject({
      code: 'CERTIFICADO_SENHA_INVALIDA',
      status: 400,
    });

    expect(storageMock.upload).not.toHaveBeenCalled();
  });

  it('retorna erro quando arquivo pfx e invalido/corrompido', async () => {
    const service = new CertificadoService();
    jest
      .spyOn(service as any, 'validarPfxComOpenSsl')
      .mockRejectedValue(erroOpenSsl('ASN1 routines:offset out of range'));

    await expect(
      service.criar(
        {
          nome: 'certificado',
          fileContent: Buffer.from('quebrado').toString('base64'),
          password: '1234',
        },
        7
      )
    ).rejects.toMatchObject({
      code: 'CERTIFICADO_INVALIDO',
      status: 400,
    });

    expect(storageMock.upload).not.toHaveBeenCalled();
  });

  it('retorna erro quando correcao automatica falha', async () => {
    const service = new CertificadoService();
    jest
      .spyOn(service as any, 'validarPfxComOpenSsl')
      .mockRejectedValueOnce(erroOpenSsl('Algorithm (RC2-40-CBC : 0) unsupported'));
    jest.spyOn(service as any, 'converterPfxParaFormatoCompativel').mockRejectedValue(new Error('falhou'));

    await expect(
      service.criar(
        {
          nome: 'certificado',
          fileContent: Buffer.from('pfx-legado').toString('base64'),
          password: '1234',
          tentarCorrigir: true,
        },
        8
      )
    ).rejects.toMatchObject({
      code: 'CERTIFICADO_CORRECAO_FALHOU',
      status: 400,
    });

    expect(storageMock.upload).not.toHaveBeenCalled();
    expect(catalogoPrisma.certificado.create).not.toHaveBeenCalled();
  });
});
