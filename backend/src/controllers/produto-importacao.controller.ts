import { Request, Response } from 'express';
import {
  OrigemImportacaoProduto,
  ProdutoImportacaoService
} from '../services/produto-importacao.service';
import { logger } from '../utils/logger';

const produtoImportacaoService = new ProdutoImportacaoService();

export async function importarProdutosPorPlanilha(req: Request, res: Response) {
  try {
    const { catalogoId, modalidade, arquivo, origem, arquivos } = req.body as {
      catalogoId?: number | string;
      modalidade?: string;
      origem?: OrigemImportacaoProduto;
      arquivo?: { nome?: string; conteudoBase64?: string };
      arquivos?: {
        produtos?: { nome?: string; conteudoBase64?: string };
        operadores?: { nome?: string; conteudoBase64?: string } | null;
        fabricantes?: { nome?: string; conteudoBase64?: string } | null;
      };
    };

    if (!catalogoId) {
      return res.status(400).json({ error: 'Catalogo e obrigatorio' });
    }

    const catalogoIdNumber = Number(catalogoId);
    if (Number.isNaN(catalogoIdNumber)) {
      return res.status(400).json({ error: 'Catalogo invalido' });
    }

    const origemNormalizada =
      origem === 'SISCOMEX_ARQUIVO' ? 'SISCOMEX_ARQUIVO' : 'PLANILHA';

    const importacao =
      origemNormalizada === 'SISCOMEX_ARQUIVO'
        ? await produtoImportacaoService.importarArquivoSiscomex(
            {
              catalogoId: catalogoIdNumber,
              arquivos: {
                produtos: {
                  nome: arquivos?.produtos?.nome ?? '',
                  conteudoBase64: arquivos?.produtos?.conteudoBase64 ?? ''
                },
                operadores: arquivos?.operadores
                  ? {
                      nome: arquivos.operadores.nome ?? '',
                      conteudoBase64: arquivos.operadores.conteudoBase64 ?? ''
                    }
                  : null,
                fabricantes: arquivos?.fabricantes
                  ? {
                      nome: arquivos.fabricantes.nome ?? '',
                      conteudoBase64: arquivos.fabricantes.conteudoBase64 ?? ''
                    }
                  : null
              }
            },
            req.user!.superUserId,
            req.user?.id
          )
        : await produtoImportacaoService.importarPlanilhaExcel(
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

    return res.status(202).json({
      id: importacao.id,
      situacao: importacao.situacao,
      resultado: importacao.resultado
    });
  } catch (error) {
    logger.error('Erro ao iniciar importacao de produtos:', error);

    if (error instanceof Error) {
      if (
        error.message.includes('Catalogo nao encontrado') ||
        error.message.includes('Catálogo não encontrado')
      ) {
        return res.status(404).json({ error: error.message });
      }

      if (
        error.message.includes('Arquivo Excel') ||
        error.message.includes('Arquivo JSON') ||
        error.message.includes('Formato invalido') ||
        error.message.includes('Formato inválido') ||
        error.message.includes('Conteudo invalido') ||
        error.message.includes('Conteúdo do arquivo inválido') ||
        error.message.includes('nao possui dados') ||
        error.message.includes('não possui dados')
      ) {
        return res.status(400).json({ error: error.message });
      }

      if (
        error.message.includes('Nao foi possivel iniciar o processamento') ||
        error.message.includes('Não foi possível iniciar o processamento')
      ) {
        return res.status(500).json({ error: error.message });
      }
    }

    return res.status(500).json({ error: 'Erro interno ao iniciar a importacao' });
  }
}

export async function listarImportacoes(req: Request, res: Response) {
  try {
    const importacoes = await produtoImportacaoService.listarImportacoes(
      req.user!.superUserId
    );
    return res.json(importacoes);
  } catch (error) {
    logger.error('Erro ao listar importacoes:', error);
    return res.status(500).json({ error: 'Erro ao listar importacoes' });
  }
}

export async function obterDetalhesImportacao(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }

    const importacao = await produtoImportacaoService.obterImportacao(
      id,
      req.user!.superUserId
    );

    if (!importacao) {
      return res.status(404).json({ error: 'Importacao nao encontrada' });
    }

    return res.json(importacao);
  } catch (error) {
    logger.error('Erro ao obter detalhes da importacao:', error);
    return res.status(500).json({ error: 'Erro ao obter detalhes da importacao' });
  }
}

export async function reverterImportacao(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }

    await produtoImportacaoService.reverterImportacao(id, req.user!.superUserId);
    return res.status(204).send();
  } catch (error) {
    logger.error('Erro ao reverter importacao:', error);
    if (error instanceof Error) {
      if (error.message === 'IMPORTACAO_NAO_ENCONTRADA') {
        return res.status(404).json({ error: 'Importacao nao encontrada' });
      }
      if (error.message === 'IMPORTACAO_EM_ANDAMENTO') {
        return res
          .status(409)
          .json({ error: 'Nao e possivel reverter uma importacao em andamento.' });
      }
      if (error.message === 'IMPORTACAO_JA_REVERTIDA') {
        return res
          .status(409)
          .json({ error: 'A importacao ja foi revertida anteriormente.' });
      }
    }
    return res.status(500).json({ error: 'Erro ao reverter importacao' });
  }
}

export async function removerImportacao(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }

    const removida = await produtoImportacaoService.removerImportacao(
      id,
      req.user!.superUserId
    );

    if (!removida) {
      return res.status(404).json({ error: 'Importacao nao encontrada' });
    }

    return res.status(204).send();
  } catch (error) {
    logger.error('Erro ao remover importacao:', error);
    if (error instanceof Error) {
      if (error.message === 'IMPORTACAO_EXCLUSAO_EM_ANDAMENTO') {
        return res
          .status(409)
          .json({ error: 'Nao e possivel excluir uma importacao em andamento.' });
      }
      if (error.message === 'IMPORTACAO_EXCLUSAO_REQUER_REVERSAO') {
        return res
          .status(409)
          .json({ error: 'Importacoes concluidas de forma incompleta precisam ser revertidas antes da exclusao.' });
      }
      if (error.message === 'IMPORTACAO_EXCLUSAO_NAO_PERMITIDA') {
        return res
          .status(409)
          .json({ error: 'Somente importacoes concluidas ou revertidas podem ser excluidas.' });
      }
    }
    return res.status(500).json({ error: 'Erro ao remover importacao' });
  }
}

export async function limparImportacoes(req: Request, res: Response) {
  try {
    await produtoImportacaoService.limparHistorico(req.user!.superUserId);
    return res.status(204).send();
  } catch (error) {
    logger.error('Erro ao limpar historico de importacao:', error);
    return res.status(500).json({ error: 'Erro ao limpar historico de importacao' });
  }
}
