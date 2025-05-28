// backend/src/services/siscomex.service.ts
import axios, { AxiosInstance } from 'axios';
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
  cnpjRaiz: string;
  codigoProduto?: string;
  ncm?: string;
  situacao?: 'ATIVADO' | 'DESATIVADO' | 'RASCUNHO';
  incluirDesativados?: boolean;
}

export interface SiscomexApiResponse<T> {
  sucesso: boolean;
  dados: T;
  mensagem?: string;
  erros?: string[];
}

export class SiscomexService {
  private api: AxiosInstance;
  private readonly baseUrl: string;
  private readonly certificadoPath: string;
  private readonly chavePrivadaPath: string;

  constructor() {
    // URLs da API SISCOMEX conforme documentação
    this.baseUrl = process.env.SISCOMEX_API_URL || 'https://api.portalunico.siscomex.gov.br';
    this.certificadoPath = process.env.SISCOMEX_CERT_PATH || '';
    this.chavePrivadaPath = process.env.SISCOMEX_KEY_PATH || '';

    this.api = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    this.setupInterceptors();
    this.configurarAutenticacao();
  }

  private setupInterceptors() {
    // Request interceptor para logs
    this.api.interceptors.request.use(
      (config) => {
        logger.info(`SISCOMEX API Request: ${config.method?.toUpperCase()} ${config.url}`);
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
        return response;
      },
      (error) => {
        logger.error('SISCOMEX API Response Error:', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url
        });
        return Promise.reject(this.tratarErroApi(error));
      }
    );
  }

  private configurarAutenticacao() {
    // Configuração de certificado digital conforme documentação SISCOMEX
    // A API usa SSL/TLS com certificado digital
    if (this.certificadoPath && this.chavePrivadaPath) {
      // TODO: Implementar configuração de certificado digital
      logger.info('Configurando autenticação com certificado digital para SISCOMEX');
    } else {
      logger.warn('Certificado digital não configurado para SISCOMEX API');
    }
  }

  private tratarErroApi(error: any): Error {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.mensagem || error.response.statusText;
      
      switch (status) {
        case 401:
          return new Error('Não autorizado - Verificar certificado digital');
        case 403:
          return new Error('Acesso negado - Verificar permissões');
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
      const params = new URLSearchParams();
      params.append('cnpjRaiz', filtros.cnpjRaiz);
      
      if (filtros.codigoProduto) params.append('codigoProduto', filtros.codigoProduto);
      if (filtros.ncm) params.append('ncm', filtros.ncm);
      if (filtros.situacao) params.append('situacao', filtros.situacao);
      if (filtros.incluirDesativados) params.append('incluirDesativados', 'true');

      const response = await this.api.get<SiscomexApiResponse<SiscomexProduto[]>>(
        `/catp/produtos?${params.toString()}`
      );

      if (!response.data.sucesso) {
        throw new Error(response.data.mensagem || 'Erro ao consultar produtos');
      }

      return response.data.dados;
    } catch (error) {
      logger.error('Erro ao consultar produtos SISCOMEX:', error);
      throw error;
    }
  }

  /**
   * Inclui novo produto no catálogo SISCOMEX
   */
  async incluirProduto(produto: Omit<SiscomexProduto, 'codigo' | 'versao'>): Promise<SiscomexProduto> {
    try {
      const response = await this.api.post<SiscomexApiResponse<SiscomexProduto>>(
        '/catp/produtos',
        produto
      );

      if (!response.data.sucesso) {
        throw new Error(response.data.mensagem || 'Erro ao incluir produto');
      }

      return response.data.dados;
    } catch (error) {
      logger.error('Erro ao incluir produto SISCOMEX:', error);
      throw error;
    }
  }

  /**
   * Atualiza produto existente (gera nova versão)
   */
  async atualizarProduto(codigoProduto: string, produto: Partial<SiscomexProduto>): Promise<SiscomexProduto> {
    try {
      const response = await this.api.put<SiscomexApiResponse<SiscomexProduto>>(
        `/catp/produtos/${codigoProduto}`,
        produto
      );

      if (!response.data.sucesso) {
        throw new Error(response.data.mensagem || 'Erro ao atualizar produto');
      }

      return response.data.dados;
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
      const response = await this.api.get<SiscomexApiResponse<SiscomexProduto>>(
        `/catp/produtos/${codigoProduto}/versoes/${versao}`
      );

      if (!response.data.sucesso) {
        throw new Error(response.data.mensagem || 'Erro ao detalhar versão do produto');
      }

      return response.data.dados;
    } catch (error) {
      logger.error('Erro ao detalhar versão do produto SISCOMEX:', error);
      throw error;
    }
  }

  /**
   * Exporta catálogo de produtos
   */
  async exportarCatalogo(cnpjRaiz: string, incluirDesativados = false): Promise<SiscomexProduto[]> {
    try {
      const params = new URLSearchParams();
      params.append('cnpjRaiz', cnpjRaiz);
      if (incluirDesativados) params.append('incluirDesativados', 'true');

      const response = await this.api.get<SiscomexApiResponse<SiscomexProduto[]>>(
        `/catp/produtos/exportar?${params.toString()}`
      );

      if (!response.data.sucesso) {
        throw new Error(response.data.mensagem || 'Erro ao exportar catálogo');
      }

      return response.data.dados;
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
      const response = await this.api.get<SiscomexApiResponse<SiscomexAtributo[]>>(
        `/catp/atributos/ncm/${ncm}`
      );

      if (!response.data.sucesso) {
        throw new Error(response.data.mensagem || 'Erro ao consultar atributos');
      }

      return response.data.dados;
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
      const response = await this.api.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.error('Erro ao testar conexão SISCOMEX:', error);
      return false;
    }
  }
}