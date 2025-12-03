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

const execFileAsync = promisify(execFile);

export interface UploadCertificadoDTO {
  nome: string;
  fileContent: string;
  password: string;
}

export class CertificadoService {
  async listar(superUserId: number) {
    return catalogoPrisma.certificado.findMany({
      where: { superUserId },
      select: { id: true, nome: true }
    });
  }

  async criar(data: UploadCertificadoDTO, superUserId: number) {
    const provider = storageFactory();
    const base = getStoragePath({ identifier: String(superUserId), type: 'certificados' });
    const path = `${base}/${data.nome}.pfx`;
    const buffer = Buffer.from(data.fileContent, 'base64');
    await provider.upload(buffer, path);
    const encrypted = encrypt(data.password);
    return catalogoPrisma.certificado.create({
      data: { nome: data.nome, pfxPath: path, senha: encrypted, superUserId },
      select: { id: true, nome: true }
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
}
