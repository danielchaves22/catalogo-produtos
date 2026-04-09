import { catalogoPrisma } from '../utils/prisma';
import { encrypt, decrypt } from '../utils/crypto';
import { storageFactory } from './storage.factory';
import { getStoragePath } from '../utils/environment';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { X509Certificate } from 'crypto';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

export type CertificadoCompatibilidadeStatus =
  | 'NAO_VERIFICADO'
  | 'COMPATIVEL'
  | 'CORRIGIDO_AUTOMATICAMENTE';

export type CertificadoValidacaoErroCode =
  | 'CERTIFICADO_SENHA_INVALIDA'
  | 'CERTIFICADO_INCOMPATIVEL'
  | 'CERTIFICADO_INVALIDO'
  | 'CERTIFICADO_CORRECAO_FALHOU';

export class CertificadoValidacaoError extends Error {
  status: number;
  code: CertificadoValidacaoErroCode;

  constructor(code: CertificadoValidacaoErroCode, message: string, status = 400) {
    super(message);
    this.name = 'CertificadoValidacaoError';
    this.code = code;
    this.status = status;
  }
}

export interface UploadCertificadoDTO {
  nome: string;
  fileContent: string;
  password: string;
  tentarCorrigir?: boolean;
}

export class CertificadoService {
  async listar(superUserId: number) {
    return catalogoPrisma.certificado.findMany({
      where: { superUserId },
      select: {
        id: true,
        nome: true,
        compatibilidadeStatus: true,
        validadoEm: true,
        detalheValidacao: true,
      },
      orderBy: { nome: 'asc' },
    });
  }

  async criar(data: UploadCertificadoDTO, superUserId: number) {
    const provider = storageFactory();
    const base = getStoragePath({ identifier: String(superUserId), type: 'certificados' });
    const storagePath = `${base}/${data.nome}.pfx`;
    const bufferOriginal = Buffer.from(data.fileContent, 'base64');

    if (!bufferOriginal.length) {
      throw new CertificadoValidacaoError(
        'CERTIFICADO_INVALIDO',
        'Arquivo de certificado inválido ou vazio'
      );
    }

    const tentarCorrigir = data.tentarCorrigir ?? true;
    const processamento = await this.processarCompatibilidadeCertificado(
      bufferOriginal,
      data.password,
      tentarCorrigir
    );

    await provider.upload(processamento.pfx, storagePath);
    const encrypted = encrypt(data.password);

    return catalogoPrisma.certificado.create({
      data: {
        nome: data.nome,
        pfxPath: storagePath,
        senha: encrypted,
        superUserId,
        compatibilidadeStatus: processamento.compatibilidadeStatus,
        validadoEm: new Date(),
        detalheValidacao: processamento.detalheValidacao ?? null,
      },
      select: {
        id: true,
        nome: true,
        compatibilidadeStatus: true,
        validadoEm: true,
        detalheValidacao: true,
      },
    });
  }

  async listarCatalogos(certificadoId: number, superUserId: number) {
    return catalogoPrisma.catalogo.findMany({
      where: { certificadoId, superUserId },
      select: { id: true, nome: true }
    });
  }

  async obterArquivo(id: number, superUserId: number) {
    const cert = await catalogoPrisma.certificado.findFirst({
      where: { id, superUserId },
      select: { pfxPath: true, nome: true }
    });
    if (!cert) throw new Error('Certificado não encontrado');
    const provider = storageFactory();
    const file = await provider.get(cert.pfxPath);
    return { file, nome: cert.nome };
  }

  async obterParaCatalogo(catalogoId: number, superUserId: number) {
    const catalogo = await catalogoPrisma.catalogo.findFirst({
      where: { id: catalogoId, superUserId },
      select: { certificado: { select: { pfxPath: true, senha: true, nome: true } } },
    });

    if (!catalogo?.certificado) {
      throw new Error('Catálogo sem certificado vinculado para transmissão ao SISCOMEX');
    }

    const provider = storageFactory();
    const buffer = await provider.get(catalogo.certificado.pfxPath);
    const senha = decrypt(catalogo.certificado.senha);

    return {
      pfx: buffer,
      passphrase: senha,
      origem: catalogo.certificado.nome,
    };
  }

  async extrairInformacoes(id: number, superUserId: number) {
    const cert = await catalogoPrisma.certificado.findFirst({
      where: { id, superUserId },
      select: { pfxPath: true, senha: true }
    });
    if (!cert) throw new Error('Certificado não encontrado');
    const provider = storageFactory();
    const buffer = await provider.get(cert.pfxPath);
    const senha = decrypt(cert.senha);

    const tmpDir = await fs.mkdtemp(path.join(tmpdir(), 'pfx-'));
    const pfxPath = path.join(tmpDir, 'cert.pfx');
    const certPath = path.join(tmpDir, 'cert.pem');
    await fs.writeFile(pfxPath, buffer);

    try {
      await execFileAsync('openssl', ['pkcs12', '-in', pfxPath, '-passin', `pass:${senha}`, '-nokeys', '-clcerts', '-out', certPath]);
      const pemRaw = await fs.readFile(certPath, 'utf8');
      const match = pemRaw.match(/-----BEGIN CERTIFICATE-----[\s\S]*-----END CERTIFICATE-----/);
      if (!match) throw new Error('Certificado inválido');
      const x509 = new X509Certificate(match[0]);
      return {
        subject: x509.subject,
        issuer: x509.issuer,
        validFrom: x509.validFrom,
        validTo: x509.validTo,
        serialNumber: x509.serialNumber
      };
    } catch (error) {
      throw new Error('Falha ao ler certificado: senha inválida ou arquivo corrompido');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async remover(id: number, superUserId: number) {
    const cert = await catalogoPrisma.certificado.findFirst({
      where: { id, superUserId },
      select: { pfxPath: true }
    });
    if (!cert) throw new Error('Certificado não encontrado');
    const provider = storageFactory();
    await catalogoPrisma.catalogo.updateMany({
      where: { certificadoId: id, superUserId },
      data: { certificadoId: null }
    });
    await catalogoPrisma.certificado.delete({ where: { id } });
    await provider.delete(cert.pfxPath).catch(() => {});
  }

  private async processarCompatibilidadeCertificado(
    pfx: Buffer,
    password: string,
    tentarCorrigir: boolean
  ): Promise<{
    pfx: Buffer;
    compatibilidadeStatus: CertificadoCompatibilidadeStatus;
    detalheValidacao?: string;
  }> {
    try {
      await this.validarPfxComOpenSsl(pfx, password);
      return {
        pfx,
        compatibilidadeStatus: 'COMPATIVEL',
        detalheValidacao: 'Certificado validado com sucesso.',
      };
    } catch (error) {
      const tipo = this.classificarErroOpenSsl(error);

      if (tipo === 'SENHA_INVALIDA') {
        throw new CertificadoValidacaoError(
          'CERTIFICADO_SENHA_INVALIDA',
          'Senha do certificado inválida'
        );
      }

      if (tipo === 'INCOMPATIVEL') {
        if (!tentarCorrigir) {
          throw new CertificadoValidacaoError(
            'CERTIFICADO_INCOMPATIVEL',
            'Certificado incompatível com o ambiente atual (formato legado PKCS#12).'
          );
        }

        try {
          const pfxCorrigido = await this.converterPfxParaFormatoCompativel(pfx, password);
          await this.validarPfxComOpenSsl(pfxCorrigido, password);

          return {
            pfx: pfxCorrigido,
            compatibilidadeStatus: 'CORRIGIDO_AUTOMATICAMENTE',
            detalheValidacao: 'Certificado convertido automaticamente para formato compatível.',
          };
        } catch (erroCorrecao) {
          logger.error('Falha na correção automática de certificado PFX', {
            erro: this.obterDetalhesErro(erroCorrecao),
          });

          throw new CertificadoValidacaoError(
            'CERTIFICADO_CORRECAO_FALHOU',
            'Não foi possível corrigir automaticamente o certificado enviado.'
          );
        }
      }

      if (tipo === 'INVALIDO') {
        throw new CertificadoValidacaoError(
          'CERTIFICADO_INVALIDO',
          'Arquivo de certificado inválido ou corrompido'
        );
      }

      throw error;
    }
  }

  private async validarPfxComOpenSsl(pfx: Buffer, password: string) {
    const tmpDir = await fs.mkdtemp(path.join(tmpdir(), 'pfx-validate-'));
    const pfxPath = path.join(tmpDir, 'cert.pfx');

    try {
      await fs.writeFile(pfxPath, pfx);
      await this.executarOpenSsl(['pkcs12', '-in', pfxPath, '-noout', '-passin', `pass:${password}`]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async converterPfxParaFormatoCompativel(pfx: Buffer, password: string): Promise<Buffer> {
    const tmpDir = await fs.mkdtemp(path.join(tmpdir(), 'pfx-convert-'));
    const origemPath = path.join(tmpDir, 'origem.pfx');
    const pemPath = path.join(tmpDir, 'temp.pem');
    const convertidoPath = path.join(tmpDir, 'convertido.pfx');

    try {
      await fs.writeFile(origemPath, pfx);

      await this.executarOpenSsl([
        'pkcs12',
        '-legacy',
        '-in',
        origemPath,
        '-passin',
        `pass:${password}`,
        '-nodes',
        '-out',
        pemPath,
      ]);

      await this.executarOpenSsl([
        'pkcs12',
        '-export',
        '-in',
        pemPath,
        '-out',
        convertidoPath,
        '-passout',
        `pass:${password}`,
        '-keypbe',
        'AES-256-CBC',
        '-certpbe',
        'AES-256-CBC',
        '-macalg',
        'sha256',
      ]);

      return await fs.readFile(convertidoPath);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async executarOpenSsl(args: string[]) {
    return execFileAsync('openssl', args);
  }

  private obterDetalhesErro(error: unknown): string {
    if (!error) return 'erro desconhecido';

    if (typeof error === 'string') {
      return error;
    }

    const erro = error as Error & { stderr?: string; stdout?: string };
    return [erro.message, erro.stderr, erro.stdout].filter(Boolean).join(' | ');
  }

  private classificarErroOpenSsl(error: unknown): 'SENHA_INVALIDA' | 'INCOMPATIVEL' | 'INVALIDO' | 'DESCONHECIDO' {
    const detalhes = this.obterDetalhesErro(error).toLowerCase();

    const senhaInvalidaPadroes = [
      'mac verify error',
      'invalid password',
      'mac verify failure',
      'pkcs12 cipherfinal error',
    ];

    if (senhaInvalidaPadroes.some((padrao) => detalhes.includes(padrao))) {
      return 'SENHA_INVALIDA';
    }

    const incompatibilidadePadroes = [
      'rc2-40-cbc',
      'unsupported pkcs12 pfx data',
      'algorithm (',
      'inner_evp_generic_fetch:unsupported',
    ];

    if (incompatibilidadePadroes.some((padrao) => detalhes.includes(padrao))) {
      return 'INCOMPATIVEL';
    }

    const invalidoPadroes = [
      'asn1',
      'offset out of range',
      'not enough data',
      'header too long',
      'bad object header',
    ];

    if (invalidoPadroes.some((padrao) => detalhes.includes(padrao))) {
      return 'INVALIDO';
    }

    return 'DESCONHECIDO';
  }
}
