import { Request, Response } from 'express';
import { CertificadoService } from '../services/certificado.service';

const certificadoService = new CertificadoService();

export async function listarCertificados(req: Request, res: Response) {
  try {
    const certificados = await certificadoService.listar(req.user!.superUserId);
    return res.status(200).json(certificados);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar certificados';
    return res.status(500).json({ error: message });
  }
}

export async function uploadCertificado(req: Request, res: Response) {
  const { nome, fileContent, password } = req.body as { nome: string; fileContent: string; password: string };
  if (!nome || !fileContent || !password) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes' });
  }
  try {
    const cert = await certificadoService.criar({ nome, fileContent, password }, req.user!.superUserId);
    return res.status(201).json(cert);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao enviar certificado';
    return res.status(500).json({ error: message });
  }
}

export async function listarCatalogosCertificado(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const catalogos = await certificadoService.listarCatalogos(Number(id), req.user!.superUserId);
    return res.status(200).json(catalogos);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar catálogos do certificado';
    return res.status(500).json({ error: message });
  }
}

export async function downloadCertificado(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const { file, nome } = await certificadoService.obterArquivo(Number(id), req.user!.superUserId);
    res.setHeader('Content-Type', 'application/x-pkcs12');
    res.setHeader('Content-Disposition', `attachment; filename=${nome}.pfx`);
    return res.send(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao baixar certificado';
    return res.status(500).json({ error: message });
  }
}

export async function removerCertificado(req: Request, res: Response) {
  const { id } = req.params;
  try {
    await certificadoService.remover(Number(id), req.user!.superUserId);
    return res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao remover certificado';
    return res.status(500).json({ error: message });
  }
}
