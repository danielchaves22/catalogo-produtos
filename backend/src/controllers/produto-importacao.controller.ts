import { Request, Response } from 'express';
import { ProdutoImportacaoService } from '../services/produto-importacao.service';
import { logger } from '../utils/logger';

const produtoImportacaoService = new ProdutoImportacaoService();

export async function importarProdutosPorPlanilha(req: Request, res: Response) {
  try {
    const { catalogoId, modalidade, arquivo } = req.body as {
      catalogoId?: number | string;
      modalidade?: string;
      arquivo?: { nome?: string; conteudoBase64?: string };
    };

    if (!catalogoId) {
      return res.status(400).json({ error: 'Catálogo é obrigatório' });
    }

    const catalogoIdNumber = Number(catalogoId);
    if (Number.isNaN(catalogoIdNumber)) {
      return res.status(400).json({ error: 'Catálogo inválido' });
    }

    const importacao = await produtoImportacaoService.importarPlanilhaExcel(
      {
        catalogoId: catalogoIdNumber,
        modalidade,
        arquivo: {
          nome: arquivo?.nome ?? '',
          conteudoBase64: arquivo?.conteudoBase64 ?? ''
        }
      },
      req.user!.superUserId,
      req.user?.id
    );

    return res.status(201).json(importacao);
  } catch (error) {
    logger.error('Erro ao importar produtos via Excel:', error);
    if (error instanceof Error) {
      if (error.message.includes('Catálogo não encontrado')) {
        return res.status(404).json({ error: error.message });
      }
      if (
        error.message.includes('Arquivo Excel não foi enviado') ||
        error.message.includes('Formato inválido') ||
        error.message.includes('Conteúdo do arquivo inválido') ||
        error.message.includes('não possui dados')
      ) {
        return res.status(400).json({ error: error.message });
      }
    }
    return res.status(500).json({ error: 'Erro interno ao importar planilha' });
  }
}

export async function listarImportacoes(req: Request, res: Response) {
  try {
    const importacoes = await produtoImportacaoService.listarImportacoes(
      req.user!.superUserId
    );
    return res.json(importacoes);
  } catch (error) {
    logger.error('Erro ao listar importações:', error);
    return res.status(500).json({ error: 'Erro ao listar importações' });
  }
}

export async function obterDetalhesImportacao(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }

    const importacao = await produtoImportacaoService.obterImportacao(
      id,
      req.user!.superUserId
    );

    if (!importacao) {
      return res.status(404).json({ error: 'Importação não encontrada' });
    }

    return res.json(importacao);
  } catch (error) {
    logger.error('Erro ao obter detalhes da importação:', error);
    return res.status(500).json({ error: 'Erro ao obter detalhes da importação' });
  }
}

export async function removerImportacao(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }

    const removida = await produtoImportacaoService.removerImportacao(
      id,
      req.user!.superUserId
    );

    if (!removida) {
      return res.status(404).json({ error: 'Importação não encontrada' });
    }

    return res.status(204).send();
  } catch (error) {
    logger.error('Erro ao remover importação:', error);
    return res.status(500).json({ error: 'Erro ao remover importação' });
  }
}

export async function limparImportacoes(req: Request, res: Response) {
  try {
    await produtoImportacaoService.limparHistorico(req.user!.superUserId);
    return res.status(204).send();
  } catch (error) {
    logger.error('Erro ao limpar histórico de importação:', error);
    return res.status(500).json({ error: 'Erro ao limpar histórico de importação' });
  }
}
