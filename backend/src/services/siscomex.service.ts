// backend/src/services/siscomex.service.ts
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import https from 'https';
import { logger } from '../utils/logger';

// Interfaces baseadas na documentação SISCOMEX
export interface SiscomexProduto {
  codigo: string;
  versao: number;
  situacao: 'ATIVADO' | 'DESATIVADO' | 'RASCUNHO';
  modalidadeOperacao: 'IMPORTACAO' | 'EXPORTACAO' | 'AMBOS';
  ncm: string;
  descricaoNcm: string;
  unidadeMedidaEstatistica: string;
  denominacaoProduto: string;
  codigoInterno?: string;
  detalhamentoComplementar?: string;
  atributos: SiscomexAtributo[];
  fabricantes: SiscomexFabricante[];
  dataReferencia: string;
}

export interface SiscomexAtributo {
  codigo: string;
  nome: string;
  valor: string | number | boolean | Date;
  obrigatorio: boolean;
  tipo: 'TEXTO' | 'NUMERO_INTEIRO' | 'NUMERO_REAL' | 'BOOLEANO' | 'DATA' | 'LISTA_ESTATICA';
}

export interface SiscomexFabricante {
  tin?: string; // Trader Identification Number
  nome: string;
  pais: string;
  conhecido: boolean;
  endereco?: {
    logradouro: string;
    cidade: string;
    codigoPostal: string;
    subdivisao: string;
  };
  email?: string;
  codigoInterno?: string;
}

export interface SiscomexConsultaFiltros {
  cpfCnpjRaiz: string;
  codigoProduto?: string;
  ncm?: string;
  situacao?: 'ATIVADO' | 'DESATIVADO' | 'RASCUNHO';
  incluirDesativados?: boolean;
}

type SiscomexAutenticacaoHeaders = {
  authorization?: string;
  csrfToken?: string;
};

type SiscomexProdutoInclusao = Omit<SiscomexProduto, 'codigo' | 'versao'>;

type SiscomexProdutoAtualizacao = Partial<SiscomexProduto> & { versao?: number };

export type SiscomexCertificado = {
  pfx: Buffer;
  passphrase?: string;
  origem?: string;
};

type SiscomexServiceOptions = {
  carregarCertificado?: () => Promise<SiscomexCertificado>;
  certificado?: SiscomexCertificado;
};

export class SiscomexService {
  private api: AxiosInstance;
  private readonly baseUrl: string;
  private readonly authUrl?: string;
  private readonly roleType: string;
  private readonly carregarCertificado?: () => Promise<SiscomexCertificado>;
  private certificado?: SiscomexCertificado;
  private httpsAgent?: https.Agent;
  private authorizationToken?: string;
  private csrfToken?: string;
  private autenticacaoPromise: Promise<void> | null = null;
  constructor(opcoes?: SiscomexServiceOptions) {
    // URLs da API SISCOMEX conforme documentação
    this.baseUrl = process.env.SISCOMEX_API_URL || 'https://api.portalunico.siscomex.gov.br/catp/api';
    this.authUrl = this.resolverAuthUrl(process.env.SISCOMEX_AUTH_URL);
    this.roleType = process.env.SISCOMEX_ROLE_TYPE || 'PJ';
    this.carregarCertificado = opcoes?.carregarCertificado;
    this.certificado = opcoes?.certificado;

    this.api = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Role-Type': this.roleType
      }
    });

    this.setupInterceptors();
  }

  /**
   * Obtém a URL de autenticação conforme a documentação PLAT (https://docs.portalunico.siscomex.gov.br/api/plat/).
   * Caso a variável não seja informada, utilizamos o host do SISCOMEX_API_URL e trocamos o serviço para o /platp.
   */
  private resolverAuthUrl(authUrl?: string): string | undefined {
    if (authUrl?.trim()) {
      return authUrl;
    }

    try {
      const base = new URL(this.baseUrl);
      const hostBase = `${base.protocol}//${base.host}`;
      const urlPadrao = `${hostBase}/platp/api/autenticar`;

      logger.info('SISCOMEX_AUTH_URL não configurado; aplicando URL padrão do PLAT', {
        baseUrl: this.baseUrl,
        urlAutenticacao: urlPadrao
      });

      return urlPadrao;
    } catch (error) {
      logger.warn('Não foi possível deduzir SISCOMEX_AUTH_URL a partir do SISCOMEX_API_URL', {
        baseUrl: this.baseUrl,
        erro: error instanceof Error ? error.message : String(error)
      });
      return authUrl;
    }
  }

  private async obterHttpsAgent(): Promise<https.Agent> {
    if (this.httpsAgent) {
      return this.httpsAgent;
    }

    if (!this.certificado && this.carregarCertificado) {
      logger.info('Carregando certificado PFX vinculado ao catálogo para SISCOMEX...');
      this.certificado = await this.carregarCertificado();
      logger.info('Certificado PFX carregado do catálogo', {
        origemCertificado: this.certificado?.origem || 'catalogo',
        tamanhoBytes: this.certificado?.pfx?.byteLength
      });
    }

    if (!this.certificado) {
      throw new Error('Certificado do catálogo não configurado para autenticação SISCOMEX');
    }

    try {
      this.httpsAgent = new https.Agent({
        pfx: this.certificado.pfx,
        passphrase: this.certificado.passphrase,
        rejectUnauthorized: true
      });
      this.api.defaults.httpsAgent = this.httpsAgent;
      logger.info('HTTPS Agent configurado com mTLS para SISCOMEX', {
        origemCertificado: this.certificado.origem || 'catalogo'
      });
    } catch (error) {
      logger.error('Falha ao montar HTTPS Agent com o certificado PFX', {
        origemCertificado: this.certificado.origem,
        erro: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    return this.httpsAgent;
  }

  atualizarCertificado(certificado: SiscomexCertificado) {
    this.certificado = certificado;
    this.httpsAgent = undefined;
    this.authorizationToken = undefined;
    this.csrfToken = undefined;
  }

  private setupInterceptors() {
    // Request interceptor para logs e autenticação
    this.api.interceptors.request.use(
      async (config) => {
        const agent = await this.obterHttpsAgent();
        await this.garantirAutenticacao();

        if (this.authorizationToken) {
          config.headers = config.headers || {};
          config.headers['Authorization'] = this.authorizationToken;
        }
        if (this.csrfToken) {
          config.headers = config.headers || {};
          config.headers['X-CSRF-Token'] = this.csrfToken;
        }
        config.httpsAgent = agent;

        logger.info(`SISCOMEX API Request: ${config.method?.toUpperCase()} ${config.url}`, {
          possuiCertificado: Boolean(this.certificado),
          possuiTokens: Boolean(this.authorizationToken && this.csrfToken),
          catalogoOrigemCertificado: this.certificado?.origem
        });
        return config;
      },
      (error) => {
        logger.error('SISCOMEX API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor para tratamento de erros
    this.api.interceptors.response.use(
      (response) => {
        logger.info(`SISCOMEX API Response: ${response.status} - ${response.config.url}`);
        this.extrairHeadersAutenticacao(response.headers as Record<string, any>);
        return response;
      },
      async (error) => {
        const status = error.response?.status;
        const originalConfig = error.config as AxiosRequestConfig & { _retry?: boolean };

        if ((status === 401 || status === 403) && !originalConfig?._retry) {
          originalConfig._retry = true;
          await this.reautenticar();
          return this.api.request(originalConfig);
        }

        logger.error('SISCOMEX API Response Error:', {
          status,
          data: error.response?.data,
          url: error.config?.url,
          metodo: error.config?.method,
          origemCertificado: this.certificado?.origem
        });
        return Promise.reject(this.tratarErroApi(error));
      }
    );
  }

  private async garantirAutenticacao() {
    if (this.authorizationToken && this.csrfToken) {
      return;
    }
    logger.info('Tokens de sessão do SISCOMEX ausentes; iniciando reautenticação...');
    await this.reautenticar();
  }

  private async reautenticar() {
    if (!this.autenticacaoPromise) {
      this.autenticacaoPromise = this.autenticar().finally(() => {
        this.autenticacaoPromise = null;
      });
    }
    return this.autenticacaoPromise;
  }

  private async autenticar() {
    if (!this.authUrl) {
      logger.warn('Endpoint de autenticação SISCOMEX não configurado (SISCOMEX_AUTH_URL). Assumindo sessão pré-autenticada.');
      return;
    }

    const agent = await this.obterHttpsAgent();

    // Usa um cliente dedicado sem interceptors para evitar deadlock quando o interceptor
    // de requisição chama `garantirAutenticacao` e o próprio login tenta reutilizar
    // a instância principal (que aguardaria a autenticação em andamento).
    const clienteAutenticacao = axios.create({
      baseURL: this.baseUrl,
      httpsAgent: agent,
      timeout: this.api.defaults.timeout,
      headers: {
        Accept: 'application/json',
        'Role-Type': this.roleType
      }
    });

    const urlLogin = this.authUrl.startsWith('http')
      ? this.authUrl
      : `${this.baseUrl.replace(/\/$/, '')}/${this.authUrl.replace(/^\//, '')}`;

    logger.info('Realizando autenticação SISCOMEX (mTLS) ...', {
      urlLogin,
      origemCertificado: this.certificado?.origem,
      roleType: this.roleType,
      passphrasePresente: Boolean(this.certificado?.passphrase)
    });

    const response = await clienteAutenticacao.get(urlLogin);

    const tokens = this.extrairHeadersAutenticacao(response.headers as Record<string, any>);
    if (!tokens.authorization || !tokens.csrfToken) {
      throw new Error('Tokens de autenticação não retornados pela API SISCOMEX');
    }

    logger.info('Autenticação SISCOMEX concluída com tokens capturados');
  }

  private extrairHeadersAutenticacao(headers: Record<string, any>): SiscomexAutenticacaoHeaders {
    const token = headers['set-token'] || headers['authorization'] || headers['Authorization'];
    const csrf = headers['x-csrf-token'] || headers['X-CSRF-Token'];

    const authorization = Array.isArray(token) ? token[0] : token;
    const csrfToken = Array.isArray(csrf) ? csrf[0] : csrf;

    if (authorization) {
      this.authorizationToken = authorization;
      this.api.defaults.headers.common['Authorization'] = authorization;
    }
    if (csrfToken) {
      this.csrfToken = csrfToken;
      this.api.defaults.headers.common['X-CSRF-Token'] = csrfToken;
    }

    logger.info('Headers de autenticação do SISCOMEX processados', {
      authorizationPresente: Boolean(authorization),
      csrfTokenPresente: Boolean(csrfToken)
    });

    return { authorization, csrfToken };
  }

  private tratarErroApi(error: any): Error {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.mensagem || error.response.data?.message || error.response.statusText;

      switch (status) {
        case 401:
          return new Error('Não autorizado - verifique o certificado digital e o token');
        case 403:
          return new Error('Acesso negado - verificar permissões ou token CSRF');
        case 404:
          return new Error('Recurso não encontrado');
        case 422:
          return new Error(`Dados inválidos: ${message}`);
        case 500:
          return new Error('Erro interno do servidor SISCOMEX');
        default:
          return new Error(`Erro da API SISCOMEX: ${message}`);
      }
    }

    return new Error(`Erro de conexão com SISCOMEX: ${error.message}`);
  }

  /**
   * Consulta produtos no catálogo SISCOMEX
   */
  async consultarProdutos(filtros: SiscomexConsultaFiltros): Promise<SiscomexProduto[]> {
    try {
      const params = {
        cpfCnpjRaiz: filtros.cpfCnpjRaiz,
        codigo: filtros.codigoProduto,
        ncm: filtros.ncm,
        situacao: filtros.situacao,
        incluirDesativados: filtros.incluirDesativados
      };

      const response = await this.api.get<SiscomexProduto[]>('/ext/produto', { params });
      return response.data;
    } catch (error) {
      logger.error('Erro ao consultar produtos SISCOMEX:', error);
      throw error;
    }
  }

  /**
   * Inclui novo produto no catálogo SISCOMEX
   */
  async incluirProduto(cpfCnpjRaiz: string, produto: SiscomexProdutoInclusao): Promise<SiscomexProduto> {
    try {
      const response = await this.api.post<SiscomexProduto | SiscomexProduto[]>(
        `/ext/produto/${cpfCnpjRaiz}`,
        produto
      );

      const dados = Array.isArray(response.data) ? response.data[0] : response.data;
      return dados;
    } catch (error) {
      logger.error('Erro ao incluir produto SISCOMEX:', error);
      throw error;
    }
  }

  /**
   * Atualiza produto existente (gera nova versão)
   */
  async atualizarProduto(
    cpfCnpjRaiz: string,
    codigoProduto: string,
    produto: SiscomexProdutoAtualizacao
  ): Promise<SiscomexProduto> {
    try {
      const response = await this.api.put<SiscomexProduto | SiscomexProduto[]>(
        `/ext/produto/${cpfCnpjRaiz}/${codigoProduto}`,
        produto
      );

      const dados = Array.isArray(response.data) ? response.data[0] : response.data;
      return dados;
    } catch (error) {
      logger.error('Erro ao atualizar produto SISCOMEX:', error);
      throw error;
    }
  }

  /**
   * Obtém detalhes de uma versão específica do produto
   */
  async detalharVersaoProduto(codigoProduto: string, versao: number): Promise<SiscomexProduto> {
    try {
      const response = await this.api.get<SiscomexProduto>(`/ext/produto/${codigoProduto}/versoes/${versao}`);
      return response.data;
    } catch (error) {
      logger.error('Erro ao detalhar versão do produto SISCOMEX:', error);
      throw error;
    }
  }

  /**
   * Exporta catálogo de produtos
   */
  async exportarCatalogo(cpfCnpjRaiz: string, incluirDesativados = false): Promise<SiscomexProduto[]> {
    try {
      const params = { cpfCnpjRaiz, incluirDesativados };
      const response = await this.api.get<SiscomexProduto[]>('/ext/produto', { params });
      return response.data;
    } catch (error) {
      logger.error('Erro ao exportar catálogo SISCOMEX:', error);
      throw error;
    }
  }

  /**
   * Consulta atributos por NCM
   */
  async consultarAtributosPorNcm(ncm: string): Promise<SiscomexAtributo[]> {
    try {
      const response = await this.api.get<SiscomexAtributo[]>(`/ext/atributos/ncm/${ncm}`);
      return response.data;
    } catch (error) {
      logger.error('Erro ao consultar atributos por NCM:', error);
      throw error;
    }
  }

  /**
   * Teste de conectividade com a API
   */
  async testarConexao(): Promise<boolean> {
    try {
      await this.garantirAutenticacao();
      const response = await this.api.get('/ext/produto', { params: { limite: 1 } });
      return response.status === 200;
    } catch (error) {
      logger.error('Erro ao testar conexão SISCOMEX:', error);
      return false;
    }
  }
}
