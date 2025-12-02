// backend/src/services/produto-transmissao.service.ts
import { logger } from '../utils/logger';
import { ValidationError } from '../types/validation-error';
import { ProdutoExportacaoService } from './produto-exportacao.service';
import { SiscomexService } from './siscomex.service';
import { ProdutoService } from './produto.service';

interface ResultadoTransmissao {
  produtoId: number;
  codigo?: string;
  versao?: number;
  situacao?: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO' | string | null;
}

interface FalhaTransmissao {
  produtoId: number;
  motivo: string;
}

export class ProdutoTransmissaoService {
  constructor(
    private readonly exportacaoService = new ProdutoExportacaoService(),
    private readonly siscomexService = new SiscomexService(),
    private readonly produtoService = new ProdutoService()
  ) {}

  async transmitir(ids: number[], superUserId: number) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError({ produtos: 'Nenhum produto selecionado para transmissão' });
    }

    const produtos = await this.exportacaoService.buscarProdutosComAtributos(ids, superUserId);

    if (produtos.length === 0) {
      throw new ValidationError({ produtos: 'Nenhum produto encontrado para transmissão' });
    }

    const idsEncontrados = new Set(produtos.map(produto => produto.id));
    const falhas: FalhaTransmissao[] = ids
      .filter(id => !idsEncontrados.has(id))
      .map(id => ({ produtoId: id, motivo: 'Produto não encontrado para transmissão' }));

    const produtosExportados = this.exportacaoService.transformarParaSiscomex(produtos);

    const sucessos: ResultadoTransmissao[] = [];

    for (const produtoExportado of produtosExportados) {
      const produtoId = Number(produtoExportado.seq);
      const cpfCnpjRaiz = produtoExportado.cpfCnpjRaiz?.replace(/\D/g, '');

      if (!Number.isFinite(produtoId)) {
        falhas.push({ produtoId, motivo: 'Identificador do produto inválido para transmissão' });
        continue;
      }

      if (!cpfCnpjRaiz) {
        falhas.push({ produtoId, motivo: 'Produto sem CNPJ raiz do catálogo para envio' });
        continue;
      }

      try {
        const { cpfCnpjRaiz: _, seq, ...payload } = produtoExportado;

        const resposta = await this.siscomexService.incluirProduto(cpfCnpjRaiz, payload as any);
        const situacaoNormalizada =
          typeof resposta.situacao === 'string'
            ? (['RASCUNHO', 'ATIVADO', 'DESATIVADO'].includes(resposta.situacao.toUpperCase())
                ? (resposta.situacao.toUpperCase() as 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO')
                : undefined)
            : undefined;

        await this.produtoService.marcarComoTransmitido(produtoId, superUserId, {
          codigo: resposta.codigo,
          versao: resposta.versao,
          situacao: situacaoNormalizada,
        });

        sucessos.push({
          produtoId,
          codigo: resposta.codigo,
          versao: resposta.versao,
          situacao: situacaoNormalizada ?? resposta.situacao,
        });
      } catch (error: unknown) {
        logger.error('Falha ao transmitir produto ao SISCOMEX', {
          produtoId,
          erro: error,
        });

        falhas.push({
          produtoId,
          motivo: error instanceof Error ? error.message : 'Erro desconhecido ao transmitir produto',
        });
      }
    }

    return { sucessos, falhas };
  }
}

