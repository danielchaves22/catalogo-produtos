// backend/src/controllers/produto.controller.ts
import { Request, Response } from 'express';
import { ProdutoService, RemoverProdutosEmMassaDTO } from '../services/produto.service';
import { ValidationError } from '../types/validation-error';
import { logger } from '../utils/logger';
import { ProdutoInativacaoError, ProdutoInativacaoService } from '../services/produto-inativacao.service';
import { ProdutoTransmissaoService } from '../services/produto-transmissao.service';

const produtoService = new ProdutoService();
const produtoInativacaoService = new ProdutoInativacaoService();
const produtoTransmissaoService = new ProdutoTransmissaoService();

export async function listarProdutos(req: Request, res: Response) {
  try {
    const statusPermitidos = [
      'PENDENTE',
      'APROVADO',
      'PROCESSANDO',
      'TRANSMITIDO',
      'ERRO',
      'AJUSTAR_ESTRUTURA'
    ] as const;
    const situacoesPermitidas = ['RASCUNHO', 'ATIVADO', 'DESATIVADO'] as const;

    const statusQuery = req.query.status;
    const situacaoQuery = req.query.situacao;

    const paraArray = (valor: unknown): string[] => {
      if (Array.isArray(valor)) {
        return valor
          .map(item => (typeof item === 'string' ? item : null))
          .filter((item): item is string => Boolean(item));
      }
      if (typeof valor === 'string') {
        return valor.split(',');
      }
      return [];
    };

    const status = paraArray(statusQuery)
      .map(valor => valor.trim())
      .filter((valor): valor is (typeof statusPermitidos)[number] =>
        statusPermitidos.includes(valor as (typeof statusPermitidos)[number])
      );

    const situacoes = paraArray(situacaoQuery)
      .map(valor => valor.trim())
      .filter((valor): valor is (typeof situacoesPermitidas)[number] =>
        situacoesPermitidas.includes(valor as (typeof situacoesPermitidas)[number])
      );

    const filtros = {
      status: status.length > 0 ? status : undefined,
      situacoes: situacoes.length > 0 ? situacoes : undefined,
      ncm: typeof req.query.ncm === 'string' ? req.query.ncm : undefined,
      catalogoId: req.query.catalogoId
        ? Number(req.query.catalogoId)
        : undefined,
      busca: typeof req.query.busca === 'string' ? req.query.busca : undefined
    };
    const pagina = Number(req.query.page);
    const tamanhoPagina = Number(req.query.pageSize);
    const paginacao = {
      page: Number.isFinite(pagina) && pagina > 0 ? pagina : undefined,
      pageSize:
        Number.isFinite(tamanhoPagina) && tamanhoPagina > 0
          ? tamanhoPagina
          : undefined
    };

    const produtos = await produtoService.listarTodos(
      filtros,
      req.user!.superUserId,
      paginacao
    );
    res.json(produtos);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function obterProduto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const produto = await produtoService.buscarPorId(
      id,
      req.user!.superUserId
    );
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(produto);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function obterHistoricoProduto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const historico = await produtoService.listarHistorico(id, req.user!.superUserId);
    res.json(historico);
  } catch (error: any) {
    if (error.message?.includes('não encontrado')) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Erro ao carregar histórico do produto:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function criarProduto(req: Request, res: Response) {
  try {
    const produto = await produtoService.criar(
      req.body,
      req.user!.superUserId
    );
    res.status(201).json(produto);
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message, details: error.details });
    }
    logger.error('Erro ao criar produto:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function atualizarProduto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const produto = await produtoService.atualizar(
      id,
      req.body,
      req.user!.superUserId
    );
    res.json(produto);
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message, details: error.details });
    }
    if (error.message?.includes('não encontrado')) {
      return res.status(404).json({ error: error.message });
    }
    if (
      error.message?.includes('não pode ser alterado') ||
      error.message?.includes('nao pode ser alterado')
    ) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Erro ao atualizar produto:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function removerProduto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    await produtoService.remover(id, req.user!.superUserId);
    res.status(204).send();
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message, details: error.details });
    }
    if (error.message?.includes('não encontrado')) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Erro ao remover produto:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function inativarProduto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Identificador de produto invalido.' });
    }

    const resultado = await produtoInativacaoService.inativarProduto(id, req.user!.superUserId);
    return res.status(200).json(resultado);
  } catch (error: any) {
    if (error instanceof ProdutoInativacaoError) {
      return res.status(error.status).json({
        error: error.message,
        codigo: error.codigo,
        retryable: error.retryable,
      });
    }

    logger.error('Erro ao inativar produto:', error);
    return res.status(500).json({ error: error?.message ?? 'Falha ao inativar produto.' });
  }
}

export async function prepararRetificacaoProduto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Identificador de produto invalido.' });
    }

    const resultado = await produtoTransmissaoService.prepararRetificacaoProduto(
      id,
      req.user!.superUserId
    );

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Pré-transmissão de retificação criada com sucesso. Revise antes de transmitir.',
      dados: resultado,
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.details || error.message });
    }

    logger.error('Erro ao preparar retificação de produto:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Falha ao preparar retificação do produto.',
    });
  }
}

export async function transmitirRetificacaoProduto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Identificador de produto invalido.' });
    }

    const resultado = await produtoTransmissaoService.transmitirRetificacaoProduto(
      id,
      req.user!.superUserId
    );
    const mensagem =
      resultado.posicaoFilaCatalogo > 1
        ? `Retificação enfileirada. Há ${resultado.posicaoFilaCatalogo - 1} transmissão(ões) antes dela para este catálogo.`
        : 'Retificação enfileirada para transmissão ao SISCOMEX.';

    return res.status(202).json({
      sucesso: true,
      mensagem,
      dados: resultado,
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.details || error.message });
    }

    logger.error('Erro ao transmitir retificação de produto:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Falha ao transmitir retificação do produto.',
    });
  }
}

export async function transmitirReativacaoProduto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Identificador de produto invalido.' });
    }

    const resultado = await produtoTransmissaoService.transmitirReativacaoProduto(
      id,
      req.body,
      req.user!.superUserId
    );
    const mensagem =
      resultado.posicaoFilaCatalogo > 1
        ? `Reativação enfileirada. Há ${resultado.posicaoFilaCatalogo - 1} transmissão(ões) antes dela para este catálogo.`
        : 'Reativação enfileirada para transmissão ao SISCOMEX.';

    return res.status(202).json({
      sucesso: true,
      mensagem,
      dados: resultado,
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.details || error.message });
    }

    logger.error('Erro ao transmitir reativação de produto:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Falha ao transmitir reativação do produto.',
    });
  }
}

export async function clonarProduto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const produto = await produtoService.clonar(
      id,
      req.body,
      req.user!.superUserId
    );
    res.status(201).json(produto);
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message, details: error.details });
    }
    if (error.message?.includes('não encontrado')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('Catálogo de destino')) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Erro ao clonar produto:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function contarPendenciasAjusteEstrutura(req: Request, res: Response) {
  try {
    const total = await produtoService.contarPendenciasAjusteEstrutura(req.user!.superUserId);
    return res.json({ total });
  } catch (error: any) {
    logger.error('Erro ao contar pendências de ajuste de estrutura:', error);
    return res.status(500).json({ error: 'Não foi possível carregar as pendências.' });
  }
}

export async function listarPendenciasAjusteEstruturaDetalhadas(req: Request, res: Response) {
  try {
    const detalhes = await produtoService.listarPendenciasAjusteEstruturaDetalhadas(
      req.user!.superUserId
    );
    return res.json(detalhes);
  } catch (error: any) {
    logger.error('Erro ao listar pendências detalhadas de ajuste de estrutura:', error);
    return res.status(500).json({ error: 'Não foi possível carregar as pendências detalhadas.' });
  }
}

export async function ajustarEstruturaCatalogo(req: Request, res: Response) {
  try {
    const { ncmCodigo, modalidade, catalogoId } = req.body ?? {};

    if (!ncmCodigo || !catalogoId) {
      return res.status(400).json({ error: 'NCM e catálogo são obrigatórios para o ajuste.' });
    }

    const resultado = await produtoService.solicitarAjusteEstruturaCatalogo(
      {
        ncmCodigo,
        modalidade: modalidade ?? '',
        catalogoId: Number(catalogoId),
      },
      req.user!.superUserId
    );

    return res.status(202).json({
      ...resultado,
      mensagem: resultado.reutilizado
        ? `Já existe um ajuste em processamento para o catálogo ${catalogoId} e a NCM ${ncmCodigo}.`
        : `Ajuste de estrutura enfileirado para o catálogo ${catalogoId} e a NCM ${ncmCodigo}.`,
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message, details: error.details });
    }

    logger.error('Erro ao ajustar estrutura por catálogo:', error);
    return res.status(500).json({ error: error.message ?? 'Falha ao ajustar estrutura.' });
  }
}

export async function corrigirStatusAjusteEstrutura(req: Request, res: Response) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas administradores podem corrigir ajustes de estrutura.' });
  }

  try {
    const produtoIds = Array.isArray(req.body?.produtoIds)
      ? req.body.produtoIds
      : undefined;

    const resultado = await produtoService.solicitarCorrecaoStatusAjusteEstrutura(
      { produtoIds },
      req.user!.superUserId
    );

    return res.status(202).json({
      ...resultado,
      mensagem: 'Correcao de status enfileirada. Acompanhe em Processos Assincronos.',
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message, details: error.details });
    }

    logger.error('Erro ao enfileirar correcao de status de ajuste de estrutura:', error);
    return res.status(500).json({ error: error.message ?? 'Falha ao corrigir status de ajuste de estrutura.' });
  }
}

export async function removerProdutosEmMassa(req: Request, res: Response) {
  try {
    const dados = req.body as RemoverProdutosEmMassaDTO;
    const resultado = await produtoService.removerEmMassa(
      dados,
      req.user!.superUserId
    );
    res.status(200).json(resultado);
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message, details: error.details });
    }
    logger.error('Erro ao remover produtos em massa:', error);
    res.status(500).json({ error: error.message });
  }
}

