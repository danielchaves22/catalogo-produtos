import { catalogoPrisma } from '../utils/prisma';
import { encrypt } from '../utils/crypto';
import { storageFactory } from './storage.factory';
import { getBucketName } from '../utils/environment';

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
    const base = getBucketName({ identifier: String(superUserId), type: 'certificados' });
    const path = `${base}/${data.nome}.pfx`;
    const buffer = Buffer.from(data.fileContent, 'base64');
    await provider.upload(buffer, path);
    const encrypted = encrypt(data.password);
    return catalogoPrisma.certificado.create({
      data: { nome: data.nome, pfxPath: path, senha: encrypted, superUserId },
      select: { id: true, nome: true }
    });
  }
}
