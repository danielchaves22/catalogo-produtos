import { createHash } from 'crypto';
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { CatalogoService } from './catalogo.service';
import { ProdutoService } from './produto.service';
import { SiscomexErroDetalhado, SiscomexProduto, SiscomexService } from './siscomex.service';

type ProdutoSituacao = 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';

type SiscomexClientCacheItem = {
  cliente: SiscomexService;
  certificadoHash: string;
  verificarCertificadoEm: number;
};

type CategoriaErroSiscomex = 'funcional' | 'autenticacao' | 'certificado' | 'tecnico';

type ResultadoConfirmacaoDesativacao = {
  confirmado: boolean;
  versao?: number;
};

export type ProdutoInativacaoErroCodigo =
  | 'NAO_ENCONTRADO'
  | 'NEGOCIO'
  | 'VALIDACAO_SISCOMEX'
  | 'INTEGRACAO'
  | 'INTEGRACAO_RETRYAVEL';

export class ProdutoInativacaoError extends Error {
  readonly status: number;
  readonly codigo: ProdutoInativacaoErroCodigo;
  readonly retryable: boolean;
  readonly siscomexDetalhes?: SiscomexErroDetalhado;

  constructor(params: {
    message: string;
    status: number;
    codigo: ProdutoInativacaoErroCodigo;
    retryable?: boolean;
    siscomexDetalhes?: SiscomexErroDetalhado;
  }) {
    super(params.message);
    this.name = 'ProdutoInativacaoError';
    this.status = params.status;
    this.codigo = params.codigo;
    this.retryable = params.retryable ?? false;
    this.siscomexDetalhes = params.siscomexDetalhes;
  }
}

export interface InativarProdutoResultado {
  produto: any;
  reconciliado: boolean;
}

const SISCOMEX_CLIENTE_CACHE_TTL_PADRAO_MS = 60000;

type CertificadoParaSiscomex = {
  pfx: Buffer;
  passphrase?: string;
  origem?: string;
};

type CertificadoSiscomexProvider = {
  obterParaCatalogo: (catalogoId: number, superUserId: number) => Promise<CertificadoParaSiscomex>;
};

function criarCertificadoServicePadrao(): CertificadoSiscomexProvider {
  const modulo = require('./certificado.service') as {
    CertificadoService: new () => CertificadoSiscomexProvider;
  };
  return new modulo.CertificadoService();
}

export class ProdutoInativacaoService {
  private readonly siscomexClients = new Map<number, SiscomexClientCacheItem>();
  private readonly siscomexClientCacheTtlMs = this.resolverCacheTtlMs(
    process.env.SISCOMEX_CLIENT_CACHE_TTL_MS
  );

  constructor(
    private readonly catalogoService = new CatalogoService(),
    private readonly certificadoService: CertificadoSiscomexProvider = criarCertificadoServicePadrao(),
    private readonly produtoService = new ProdutoService()
  ) {}

  async inativarProduto(produtoId: number, superUserId: number): Promise<InativarProdutoResultado> {
    const produto = await catalogoPrisma.produto.findFirst({
      where: { id: produtoId, catalogo: { superUserId } },
      select: {
        id: true,
        codigo: true,
        catalogoId: true,
        situacao: true,
        versao: true,
      },
    });

    if (!produto) {
      throw new ProdutoInativacaoError({
        message: `Produto ID ${produtoId} nao encontrado`,
        status: 404,
        codigo: 'NAO_ENCONTRADO',
      });
    }

    if (produto.situacao === 'DESATIVADO') {
      throw new ProdutoInativacaoError({
        message: 'Produto ja esta desativado.',
        status: 400,
        codigo: 'NEGOCIO',
      });
    }

    if (!this.produtoJaTransmitido(produto.situacao, produto.codigo)) {
      throw new ProdutoInativacaoError({
        message: 'Somente produtos ja transmitidos podem ser inativados.',
        status: 400,
        codigo: 'NEGOCIO',
      });
    }

    const codigoProduto = this.normalizarCodigoSiscomex(produto.codigo);
    if (!codigoProduto) {
      throw new ProdutoInativacaoError({
        message: 'Produto sem codigo SISCOMEX para inativacao.',
        status: 400,
        codigo: 'NEGOCIO',
      });
    }

    const catalogo = await this.catalogoService.buscarPorId(produto.catalogoId, superUserId);
    if (!catalogo) {
      throw new ProdutoInativacaoError({
        message: 'Catalogo do produto nao encontrado para inativacao.',
        status: 404,
        codigo: 'NAO_ENCONTRADO',
      });
    }

    const cpfCnpjRaiz = this.extrairCpfCnpjRaiz(catalogo.cpf_cnpj);
    if (!cpfCnpjRaiz) {
      throw new ProdutoInativacaoError({
        message: 'Catalogo sem CNPJ valido para inativacao no SISCOMEX.',
        status: 400,
        codigo: 'NEGOCIO',
      });
    }

    let cliente: SiscomexService;
    try {
      cliente = await this.obterClienteSiscomex(produto.catalogoId, superUserId);
    } catch (error) {
      logger.error('Falha ao preparar cliente SISCOMEX para inativacao', {
        produtoId,
        catalogoId: produto.catalogoId,
        erro: error instanceof Error ? error.message : String(error),
      });
      throw new ProdutoInativacaoError({
        message: 'Nao foi possivel preparar a integracao SISCOMEX para inativacao.',
        status: 502,
        codigo: 'INTEGRACAO',
      });
    }

    try {
      const resposta = await cliente.desativarProduto(cpfCnpjRaiz, codigoProduto);
      const confirmacaoDireta = this.normalizarRespostaDesativacao(resposta);

      if (confirmacaoDireta.confirmado) {
        const produtoAtualizado = await this.sincronizarProdutoDesativado(
          produto.id,
          superUserId,
          codigoProduto,
          confirmacaoDireta.versao ?? produto.versao
        );

        return { produto: produtoAtualizado, reconciliado: false };
      }

      const reconciliacao = await this.reconciliarDesativacao(cliente, cpfCnpjRaiz, codigoProduto);
      if (reconciliacao.confirmado) {
        const produtoAtualizado = await this.sincronizarProdutoDesativado(
          produto.id,
          superUserId,
          codigoProduto,
          reconciliacao.versao ?? produto.versao
        );

        return { produto: produtoAtualizado, reconciliado: true };
      }

      logger.error('Inativacao SISCOMEX sem confirmacao remota apos chamada de sucesso', {
        produtoId,
        codigoProduto,
      });
      throw new ProdutoInativacaoError({
        message: 'Nao foi possivel confirmar a inativacao no SISCOMEX. Tente novamente.',
        status: 503,
        codigo: 'INTEGRACAO_RETRYAVEL',
        retryable: true,
      });
    } catch (error) {
      if (error instanceof ProdutoInativacaoError) {
        throw error;
      }

      const detalhesSiscomex = this.obterDetalhesSiscomex(error);
      const categoria = this.classificarErroSiscomex(error);

      logger.error('Falha ao inativar produto no SISCOMEX', {
        produtoId,
        codigoProduto,
        categoria,
        detalhesSiscomex,
        erro: error instanceof Error ? error.message : String(error),
      });

      if (categoria === 'funcional') {
        throw new ProdutoInativacaoError({
          message: this.extrairMensagemSiscomex(
            error,
            'Falha de validacao no SISCOMEX ao inativar o produto.'
          ),
          status: 400,
          codigo: 'VALIDACAO_SISCOMEX',
          siscomexDetalhes: detalhesSiscomex,
        });
      }

      if (categoria === 'autenticacao' || categoria === 'certificado') {
        throw new ProdutoInativacaoError({
          message: this.extrairMensagemSiscomex(
            error,
            'Falha de autenticacao/permissao/certificado na integracao com SISCOMEX.'
          ),
          status: 502,
          codigo: 'INTEGRACAO',
          siscomexDetalhes: detalhesSiscomex,
        });
      }

      const reconciliacao = await this.reconciliarDesativacao(cliente, cpfCnpjRaiz, codigoProduto);
      if (reconciliacao.confirmado) {
        const produtoAtualizado = await this.sincronizarProdutoDesativado(
          produto.id,
          superUserId,
          codigoProduto,
          reconciliacao.versao ?? produto.versao
        );

        return { produto: produtoAtualizado, reconciliado: true };
      }

      throw new ProdutoInativacaoError({
        message: 'Nao foi possivel confirmar a inativacao no SISCOMEX. Tente novamente.',
        status: 503,
        codigo: 'INTEGRACAO_RETRYAVEL',
        retryable: true,
        siscomexDetalhes: detalhesSiscomex,
      });
    }
  }

  private async sincronizarProdutoDesativado(
    produtoId: number,
    superUserId: number,
    codigoProduto: string,
    versao?: number
  ) {
    const versaoNumerica = Number(versao);
    const versaoFinal = Number.isFinite(versaoNumerica) && versaoNumerica > 0 ? versaoNumerica : 1;

    return this.produtoService.marcarComoTransmitido(produtoId, superUserId, {
      codigo: codigoProduto,
      versao: versaoFinal,
      situacao: 'DESATIVADO',
      atualizarCodigo: false,
    });
  }

  private async reconciliarDesativacao(
    cliente: SiscomexService,
    cpfCnpjRaiz: string,
    codigoProduto: string
  ): Promise<ResultadoConfirmacaoDesativacao> {
    try {
      const produtos = await cliente.consultarProdutos({
        cpfCnpjRaiz,
        codigoProduto,
        incluirDesativados: true,
      });

      const produtoRemoto = produtos.find(item => this.normalizarCodigoSiscomex(item.codigo) === codigoProduto);
      if (!produtoRemoto) {
        logger.warn('Reconcilacao SISCOMEX nao encontrou produto para codigo informado', {
          codigoProduto,
        });
        return { confirmado: false };
      }

      const situacao = String(produtoRemoto.situacao || '').toUpperCase();
      if (situacao !== 'DESATIVADO') {
        logger.info('Reconcilacao SISCOMEX encontrou produto sem situacao DESATIVADO', {
          codigoProduto,
          situacao,
        });
        return { confirmado: false };
      }

      const versao = this.resolverVersao(produtoRemoto);
      return { confirmado: true, versao };
    } catch (error) {
      logger.error('Falha ao reconciliar situacao do produto no SISCOMEX', {
        codigoProduto,
        erro: error instanceof Error ? error.message : String(error),
      });
      return { confirmado: false };
    }
  }

  private normalizarRespostaDesativacao(resposta: unknown): ResultadoConfirmacaoDesativacao {
    const payload = Array.isArray(resposta) ? resposta[0] : resposta;
    if (!payload || typeof payload !== 'object') {
      return { confirmado: false };
    }

    const dados = payload as Record<string, unknown>;

    if (this.isRespostaComErro(dados)) {
      return { confirmado: false };
    }

    const situacao = String(dados.situacao ?? '').toUpperCase();
    if (situacao !== 'DESATIVADO') {
      return { confirmado: false };
    }

    const versao = this.resolverVersao(dados as Partial<SiscomexProduto>);
    return { confirmado: true, versao };
  }

  private isRespostaComErro(dados: Record<string, unknown>) {
    if (dados.sucesso === false) {
      return true;
    }

    if (Array.isArray(dados.erros)) {
      return dados.erros.length > 0;
    }

    return Boolean(dados.erros);
  }

  private resolverVersao(item?: Partial<SiscomexProduto>) {
    if (!item) {
      return undefined;
    }

    const valor = Number(item.versao);
    return Number.isFinite(valor) && valor > 0 ? valor : undefined;
  }

  private classificarErroSiscomex(error: unknown): CategoriaErroSiscomex {
    const detalhes = this.obterDetalhesSiscomex(error);
    const status = detalhes?.status;

    if (status === 400 || status === 404 || status === 409 || status === 410 || status === 422) {
      return 'funcional';
    }

    if (status === 401 || status === 403) {
      return 'autenticacao';
    }

    if (status && status >= 500) {
      return 'tecnico';
    }

    const mensagem = error instanceof Error ? error.message.toLowerCase() : '';

    if (
      mensagem.includes('certificado') ||
      mensagem.includes('pfx') ||
      mensagem.includes('mtls') ||
      mensagem.includes('tls')
    ) {
      return 'certificado';
    }

    return 'tecnico';
  }

  private obterDetalhesSiscomex(error: unknown): SiscomexErroDetalhado | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    return (error as Error & { siscomexDetalhes?: SiscomexErroDetalhado }).siscomexDetalhes;
  }

  private extrairMensagemSiscomex(error: unknown, fallback: string) {
    const detalhes = this.obterDetalhesSiscomex(error);
    const dados = detalhes?.data as Record<string, unknown> | undefined;

    if (typeof dados?.mensagem === 'string' && dados.mensagem.trim()) {
      return dados.mensagem.trim();
    }

    if (typeof dados?.message === 'string' && dados.message.trim()) {
      return dados.message.trim();
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    return fallback;
  }

  private async obterClienteSiscomex(catalogoId: number, superUserId: number): Promise<SiscomexService> {
    const agora = Date.now();
    const existente = this.siscomexClients.get(catalogoId);

    if (existente && existente.verificarCertificadoEm > agora) {
      return existente.cliente;
    }

    const certificado = await this.certificadoService.obterParaCatalogo(catalogoId, superUserId);
    const certificadoHash = this.calcularHashCertificado(certificado.pfx);

    if (existente && existente.certificadoHash === certificadoHash) {
      this.siscomexClients.set(catalogoId, {
        ...existente,
        verificarCertificadoEm: agora + this.siscomexClientCacheTtlMs,
      });
      return existente.cliente;
    }

    const cliente = new SiscomexService({ certificado });
    this.siscomexClients.set(catalogoId, {
      cliente,
      certificadoHash,
      verificarCertificadoEm: agora + this.siscomexClientCacheTtlMs,
    });

    return cliente;
  }

  private resolverCacheTtlMs(valor?: string) {
    if (!valor) {
      return SISCOMEX_CLIENTE_CACHE_TTL_PADRAO_MS;
    }

    const ttl = Number(valor);
    if (!Number.isFinite(ttl) || ttl <= 0) {
      return SISCOMEX_CLIENTE_CACHE_TTL_PADRAO_MS;
    }

    return ttl;
  }

  private calcularHashCertificado(pfx: Buffer) {
    return createHash('sha256').update(pfx).digest('hex');
  }

  private extrairCpfCnpjRaiz(cpfCnpj?: string | null) {
    if (!cpfCnpj) {
      return null;
    }

    const somenteDigitos = cpfCnpj.replace(/\D/g, '');
    if (!somenteDigitos) {
      return null;
    }

    if (somenteDigitos.length <= 11) {
      return somenteDigitos;
    }

    return somenteDigitos.slice(0, 8);
  }

  private normalizarCodigoSiscomex(codigo?: string | null) {
    if (!codigo) {
      return null;
    }

    const normalizado = String(codigo).trim();
    return normalizado.length > 0 ? normalizado : null;
  }

  private produtoJaTransmitido(situacao: ProdutoSituacao, codigo?: string | null) {
    const codigoNormalizado = this.normalizarCodigoSiscomex(codigo);
    return situacao !== 'RASCUNHO' && codigoNormalizado !== null;
  }
}
