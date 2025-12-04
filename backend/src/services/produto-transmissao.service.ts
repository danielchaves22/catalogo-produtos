// backend/src/services/produto-transmissao.service.ts
import { logger } from '../utils/logger';
import { ValidationError } from '../types/validation-error';
import { ProdutoExportacaoService } from './produto-exportacao.service';
import { SiscomexService } from './siscomex.service';
import { ProdutoService } from './produto.service';
import { CertificadoService } from './certificado.service';
import { CatalogoService } from './catalogo.service';

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
    private readonly produtoService = new ProdutoService(),
    private readonly certificadoService = new CertificadoService(),
    private readonly catalogoService = new CatalogoService()
  ) {}

  async transmitir(ids: number[], catalogoId: number, superUserId: number) {
    if (!Number.isFinite(catalogoId)) {
      throw new ValidationError({ catalogoId: 'Catálogo selecionado é obrigatório para transmitir ao SISCOMEX' });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError({ produtos: 'Nenhum produto selecionado para transmissão' });
    }

    if (ids.length > 100) {
      throw new ValidationError({ produtos: 'A transmissão permite até 100 produtos por vez' });
    }

    const catalogo = await this.catalogoService.buscarPorId(catalogoId, superUserId);

    if (!catalogo) {
      throw new ValidationError({ catalogoId: 'Catálogo selecionado não encontrado para transmissão' });
    }

    const cpfCnpjRaiz = this.extrairCpfCnpjRaiz(catalogo.cpf_cnpj);

    if (!cpfCnpjRaiz) {
      throw new ValidationError({ catalogoId: 'Catálogo selecionado está sem CNPJ válido para transmissão ao SISCOMEX' });
    }

    const produtos = await this.exportacaoService.buscarProdutosComAtributos(ids, superUserId, catalogoId);

    if (produtos.length === 0) {
      throw new ValidationError({ produtos: 'Nenhum produto encontrado para transmissão' });
    }

    const idsEncontrados = new Set(produtos.map(produto => produto.id));
    const idsForaCatalogo = ids.filter(id => !idsEncontrados.has(id));

    if (idsForaCatalogo.length > 0) {
      throw new ValidationError({
        produtos: 'Todos os produtos selecionados precisam pertencer ao catálogo informado para transmissão.',
      });
    }

    const produtosExportados = this.exportacaoService.transformarParaSiscomex(produtos, {
      id: catalogo.id,
      cpf_cnpj: catalogo.cpf_cnpj ?? null,
    });

    const sucessos: ResultadoTransmissao[] = [];
    const falhas: FalhaTransmissao[] = [];

    const cliente = await this.obterClienteSiscomex(catalogo.id, superUserId, new Map());
    const payloadProdutos = produtosExportados.map(produtoExportado => {
      const { cpfCnpjRaiz: _cpfCnpj, seq: _seq, catalogoId: _catalogoId, ...payload } = produtoExportado;
      return payload as any;
    });

    let respostas: any[] = [];

    try {
      respostas = await cliente.incluirProdutos(cpfCnpjRaiz, payloadProdutos as any[]);
    } catch (error: unknown) {
      logger.error('Falha ao transmitir lote de produtos ao SISCOMEX', { erro: error });
      const motivo = error instanceof Error ? error.message : 'Erro desconhecido ao transmitir produtos ao SISCOMEX';
      return {
        sucessos,
        falhas: produtosExportados.map(produto => ({
          produtoId: Number(produto.seq),
          motivo,
        })),
      };
    }

    const respostasNormalizadas = Array.isArray(respostas) ? respostas : [respostas];

    for (let index = 0; index < produtosExportados.length; index++) {
      const produtoExportado = produtosExportados[index];
      const produtoId = Number(produtoExportado.seq);
      const resposta = respostasNormalizadas[index];
      const possuiCodigoLocal = Boolean((produtoExportado as any).codigo);

      if (!Number.isFinite(produtoId)) {
        falhas.push({ produtoId, motivo: 'Identificador do produto inválido para transmissão' });
        continue;
      }

      if (!resposta) {
        falhas.push({ produtoId, motivo: 'Retorno do SISCOMEX não trouxe resposta para o produto' });
        continue;
      }

      try {
        logger.info('Transmitindo produto ao SISCOMEX', {
          produtoId,
          catalogoId: catalogo.id,
          cpfCnpjRaiz,
          possuiCodigoLocal,
        });
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

  private async obterClienteSiscomex(
    catalogoId: number,
    superUserId: number,
    cache: Map<number, SiscomexService>
  ): Promise<SiscomexService> {
    const existente = cache.get(catalogoId);
    if (existente) {
      return existente;
    }

    logger.info('Recuperando certificado PFX vinculado ao catálogo para transmissão SISCOMEX', { catalogoId });
    const certificado = await this.certificadoService.obterParaCatalogo(catalogoId, superUserId);
    logger.info('Certificado obtido do storage para SISCOMEX', {
      catalogoId,
      origem: certificado.origem,
      tamanhoBytes: certificado.pfx.byteLength,
      possuiPassphrase: Boolean(certificado.passphrase)
    });
    const cliente = new SiscomexService({ certificado });

    cache.set(catalogoId, cliente);
    return cliente;
  }

  private extrairCpfCnpjRaiz(cpfCnpj?: string | null) {
    if (!cpfCnpj) {
      return null;
    }

    const somenteDigitos = cpfCnpj.replace(/\D/g, '');

    if (somenteDigitos.length <= 11) {
      return somenteDigitos;
    }

    return somenteDigitos.slice(0, 8);
  }
}

