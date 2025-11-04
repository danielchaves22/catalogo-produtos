import { Request, Response } from 'express';
import { AtributoPreenchimentoMassaService } from '../services/atributo-preenchimento-massa.service';
import { logger } from '../utils/logger';

const service = new AtributoPreenchimentoMassaService();

export async function listarPreenchimentosMassa(req: Request, res: Response) {
  try {
    const registros = await service.listar(req.user!.superUserId);
    res.json(registros);
  } catch (error) {
    logger.error('Erro ao listar histórico de preenchimento de atributos em massa', error);
    res.status(500).json({ error: 'Erro ao listar histórico de preenchimento de atributos em massa' });
  }
}

export async function obterPreenchimentoMassa(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const registro = await service.buscarPorId(id, req.user!.superUserId);
    if (!registro) {
      return res.status(404).json({ error: 'Registro de preenchimento em massa não encontrado' });
    }
    res.json(registro);
  } catch (error) {
    logger.error('Erro ao buscar registro de preenchimento de atributos em massa', error);
    res.status(500).json({ error: 'Erro ao buscar registro de preenchimento de atributos em massa' });
  }
}

export async function criarPreenchimentoMassa(req: Request, res: Response) {
  try {
    const resultado = await service.criar(
      {
        ncmCodigo: req.body.ncmCodigo,
        modalidade: req.body.modalidade,
        catalogoIds: req.body.catalogoIds,
        valoresAtributos: req.body.valoresAtributos,
        estruturaSnapshot: req.body.estruturaSnapshot,
        produtosExcecao: req.body.produtosExcecao
      },
      req.user!.superUserId,
      { nome: req.user!.name }
    );
    res.status(202).json({
      jobId: resultado.jobId,
      mensagem: 'Processamento de atributos em massa enfileirado. Acompanhe em Processos Assíncronos.'
    });
  } catch (error: any) {
    if (
      error.message?.includes('Catálogo inválido') ||
      error.message?.includes('Informe ao menos um atributo') ||
      error.message?.includes('Produto informado')
    ) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Erro ao aplicar preenchimento de atributos em massa', error);
    res.status(500).json({ error: 'Erro ao aplicar preenchimento de atributos em massa' });
  }
}
