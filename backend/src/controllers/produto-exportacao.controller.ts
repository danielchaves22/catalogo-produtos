import { Request, Response } from 'express';
import { ProdutoExportacaoService } from '../services/produto-exportacao.service';
import { ValidationError } from '../types/validation-error';
import { logger } from '../utils/logger';
import { AsyncJobTipo } from '@prisma/client';

const produtoExportacaoService = new ProdutoExportacaoService();

export async function solicitarExportacaoProdutos(req: Request, res: Response) {
  try {
    const resultado = await produtoExportacaoService.solicitarExportacao(
      req.body,
      req.user!.superUserId,
      req.user!
    );
    return res.status(202).json(resultado);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message, details: error.details });
    }

    logger.error('Erro ao solicitar exportação de produtos', error);
    return res.status(500).json({ error: 'Não foi possível agendar a exportação de produtos.' });
  }
}

export async function solicitarExportacaoFabricantes(req: Request, res: Response) {
  try {
    const resultado = await produtoExportacaoService.solicitarExportacao(
      req.body,
      req.user!.superUserId,
      req.user!,
      {
        tipo: AsyncJobTipo.EXPORTACAO_FABRICANTE,
        arquivoNomePrefixo: 'fabricantes-siscomex',
      }
    );
    return res.status(202).json(resultado);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message, details: error.details });
    }

    logger.error('Erro ao solicitar exportação de fabricantes', error);
    return res.status(500).json({ error: 'Não foi possível agendar a exportação de fabricantes.' });
  }
}
