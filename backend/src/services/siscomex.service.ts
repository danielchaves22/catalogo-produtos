// backend/src/services/siscomex.service.ts (ATUALIZADO)

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import fs from 'fs';
import { logger } from '../utils/logger';
import { 
  SiscomexTransformersService,
  SiscomexProdutoPayload,
  SiscomexOperadorEstrangeiroPayload,
  SiscomexResponse,
  SiscomexProdutoCadastrado
} from './siscomex-transformers.service';

// Interfaces para consultas e filtros
export interface SiscomexConsultaFiltros {
  cnpjRaiz: string;
  codigoProduto?: string;
  ncm?: string;
  situacao?: 'ATIVADO' | 'DESATIVADO' | 'RASCUNHO';
  incluirDesativados?: boolean;
}

export interface SiscomexEstadoConexao {
  conectado: boolean;
  certificadoValido: boolean;
  ambiente: string;
  ultimaVerificacao: string;
  versaoApi: string;
}

/**
 * Serviço atualizado para comunicação com a API SISCOMEX
 * Implementa autenticação com certificado digital e transformação de dados
 */
export class SiscomexService {
  private api: AxiosInstance;
  private readonly baseUrl: string;
  private readonly certificadoPath: string;
  private readonly chavePrivadaPath: string;
  private readonly ambiente: string;
  private transformersService = new SiscomexTransformersService();

  constructor() {
    // URLs da API SISCOMEX conforme ambiente
    this.ambiente = process.env.SISCOMEX_AMBIENTE || 'producao';
    this.baseUrl = this.ambiente === 'producao'
      ? process.env.SISCOMEX_API_URL || 'https://api.portalunico.siscomex.gov.br'
      : 'https://val.portalunico.siscomex.gov.br';
    
    this.certificadoPath = process.env.SISCOMEX_CERT_PATH || '';
    this.chavePrivadaPath = process.env.SISCOMEX_KEY_PATH || '';

    this.api = this.criarClienteHTTPS();
    this.setupInterceptors();
  }

  /**
   * Cria cliente HTTPS com certificado digital
   */
  private criarClienteHTTPS(): AxiosInstance {
    let httpsAgent: https.Agent | undefined;

    // Configura certificado digital se os caminhos estiverem definidos
    if (this.certificadoPath && this.chavePrivadaPath) {
      try {
        const cert = fs.readFileSync(this.certificadoPath);
        const key = fs.readFileSync(this.chavePrivadaPath);
        
        httpsAgent = new https.Agent({
          cert,
          key,
          // Configurações SSL/TLS específicas do SISCOMEX
          secureProtocol: 'TLSv1_2_method',
          rejectUnauthorized: true,
          keepAlive: true,
          maxSockets: 10
        });

        logger.info('Certificado digital configurado para SISCOMEX API');
      } catch (error) {
        logger.error('Erro ao carregar certificado digital:', error);
        throw new Error('Falha na configuração do certificado digital para SISCOMEX');
      }
    } else {
      logger.warn('Certificado digital não configurado - algumas operações podem falhar');
    }

    return axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      httpsAgent,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'CatalogoProdutos/1.0'
      }
    });
  }

  /**
   * Configura interceptors para logging e tratamento de erros
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.api.interceptors.request.use(
      (config) => {
        logger.info(`SISCOMEX API Request: ${config.method?.toUpperCase()} ${config.url}`);
        
        // Adiciona headers específicos do SISCOMEX se necessário
        if (config.data) {
          config.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(config.data));
        }
        
        return config;
      },
      (error) => {
        logger.error('SISCOMEX API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response) => {
        logger.info(`SISCOMEX API Response: ${response.status} - ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error('SISCOMEX API Response Error:', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url,
          message: error.message
        });
        return Promise.reject(this.tratarErroApi(error));
      }
    );
  }

  /**
   * Trata erros da API SISCOMEX de forma padronizada
   */
  private tratarErroApi(error: any): Error {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      switch (status) {
        case 401:
          return new Error('Não autorizado - Verifique o certificado digital');
        case 403:
          return new Error('Acesso negado - Verifique as permissões do certificado');
        case 404:
          return new Error('Recurso não encontrado na API SISCOMEX');
        case 422:
          const mensagem = data?.mensagem || data?.message || 'Dados inválidos';
          const erros = data?.erros || [];
          return new Error(`Dados inválidos: ${mensagem}${erros.length ? ` - ${erros.join(', ')}` : ''}`);
        case 429:
          return new Error('Limite de requisições excedido - Tente novamente em alguns minutos');
        case 500:
          return new Error('Erro interno do servidor SISCOMEX');
        case 502:
        case 503:
        case 504:
          return new Error('Serviço SISCOMEX temporariamente indisponível');
        default:
          return new Error(`Erro da API SISCOMEX (${status}): ${data?.mensagem || error.message}`);
      }
    }
    
    if (error.code === 'ECONNREFUSED') {
      return new Error('Conexão recusada - Verifique a conectividade com SISCOMEX');
    }
    
    if (error.code === 'CERT_HAS_EXPIRED') {
      return new Error('Certificado digital expirado');
    }
    
    return new Error(`Erro de conexão com SISCOMEX: ${error.message}`);
  }

  /**
   * Verifica conectividade e status da API
   */
  async verificarConexao(): Promise<SiscomexEstadoConexao> {
    try {
      // Endpoint de status/health da API SISCOMEX
      const response = await this.api.get('/catp/api/publico/status');
      
      return {
        conectado: true,
        certificadoValido: !!this.certificadoPath,
        ambiente: this.ambiente,
        ultimaVerificacao: new Date().toISOString(),
        versaoApi: response.data?.versao || '1.0'
      };
    } catch (error) {
      logger.error('Erro na verificação de conexão SISCOMEX:', error);
      
      return {
        conectado: false,
        certificadoValido: !!this.certificadoPath,
        ambiente: this.ambiente,
        ultimaVerificacao: new Date().toISOString(),
        versaoApi: 'Desconhecida'
      };
    }
  }

  /**
   * Consulta produtos no catálogo SISCOMEX
   */
  async consultarProdutos(filtros: SiscomexConsultaFiltros): Promise<SiscomexProdutoCadastrado[]> {
    try {
      const params = new URLSearchParams();
      params.append('cnpjRaiz', filtros.cnpjRaiz);
      
      if (filtros.codigoProduto) params.append('codigoProduto', filtros.codigoProduto);
      if (filtros.ncm) params.append('ncm', filtros.ncm);
      if (filtros.situacao) params.append('situacao', filtros.situacao);
      if (filtros.incluirDesativados) params.append('incluirDesativados', 'true');

      const response = await this.api.get<SiscomexResponse<SiscomexProdutoCadastrado[]>>(
        `/catp/api/produto/consultar?${params.toString()}`
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
  async incluirProduto(produtoPayload: SiscomexProdutoPayload): Promise<SiscomexProdutoCadastrado> {
    try {
      logger.info(`Incluindo produto no SISCOMEX: ${produtoPayload.denominacaoProduto}`);

      const response = await this.api.post<SiscomexResponse<SiscomexProdutoCadastrado>>(
        '/catp/api/produto/incluir',
        produtoPayload
      );

      if (!response.data.sucesso) {
        throw new Error(response.data.mensagem || 'Erro ao incluir produto');
      }

      logger.info(`Produto incluído com sucesso no SISCOMEX. Código: ${response.data.dados.codigo}`);
      return response.data.dados;
    } catch (error) {
      logger.error('Erro ao incluir produto SISCOMEX:', error);
      throw error;
    }
  }

  /**
   * Inclui múltiplos produtos em lote
   */
  async incluirProdutosLote(produtosPayload: SiscomexProdutoPayload[]): Promise<{
    sucessos: SiscomexProdutoCadastrado[];
    erros: Array<{ produto: string; erro: string }>;
  }> {
    const sucessos: SiscomexProdutoCadastrado[] = [];
    const erros: Array<{ produto: string; erro: string }> = [];

    logger.info(`Incluindo ${produtosPayload.length} produtos em lote no SISCOMEX`);

    // Processa produtos em lotes menores para evitar timeout
    const TAMANHO_LOTE = 5;
    
    for (let i = 0; i < produtosPayload.length; i += TAMANHO_LOTE) {
      const lote = produtosPayload.slice(i, i + TAMANHO_LOTE);
      
      // Processa cada produto do lote
      const promessas = lote.map(async (produto) => {
        try {
          const resultado = await this.incluirProduto(produto);
          sucessos.push(resultado);
        } catch (error) {
          erros.push({
            produto: produto.denominacaoProduto,
            erro: error instanceof Error ? error.message : 'Erro desconhecido'
          });
        }
      });

      // Aguarda completar o lote atual antes de processar o próximo
      await Promise.all(promessas);
      
      // Pequena pausa entre lotes para não sobrecarregar a API
      if (i + TAMANHO_LOTE < produtosPayload.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info(`Lote processado: ${sucessos.length} sucessos, ${erros.length} erros`);
    
    return { sucessos, erros };
  }

  /**
   * Atualiza produto existente (gera nova versão)
   */
  async atualizarProduto(codigoProduto: string, produtoPayload: Partial<SiscomexProdutoPayload>): Promise<SiscomexProdutoCadastrado> {
    try {
      logger.info(`Atualizando produto SISCOMEX: ${codigoProduto}`);

      const response = await this.api.put<SiscomexResponse<SiscomexProdutoCadastrado>>(
        `/catp/api/produto/retificar/${codigoProduto}`,
        produtoPayload
      );

      if (!response.data.sucesso) {
        throw new Error(response.data.mensagem || 'Erro ao atualizar produto');
      }

      logger.info(`Produto atualizado com sucesso. Nova versão: ${response.data.dados.versao}`);
      return response.data.dados;
    } catch (error) {
      logger.error('Erro ao atualizar produto SISCOMEX:', error);
      throw error;
    }
  }

  /**
   * Inclui operador estrangeiro no SISCOMEX
   */
  async incluirOperadorEstrangeiro(operadorPayload: SiscomexOperadorEstrangeiroPayload): Promise<any> {
    try {
      logger.info(`Incluindo operador estrangeiro no SISCOMEX: ${operadorPayload.nome}`);

      const response = await this.api.post<SiscomexResponse<any>>(
        '/catp/api/operador-estrangeiro/incluir',
        operadorPayload
      );

      if (!response.data.sucesso) {
        throw new Error(response.data.mensagem || 'Erro ao incluir operador estrangeiro');
      }

      logger.info(`Operador estrangeiro incluído com sucesso no SISCOMEX`);
      return response.data.dados;
    } catch (error) {
      logger.error('Erro ao incluir operador estrangeiro SISCOMEX:', error);
      throw error;
    }
  }

  /**
   * Consulta operadores estrangeiros
   */
  async consultarOperadoresEstrangeiros(cnpjRaiz: string): Promise<any[]> {
    try {
      const response = await this.api.get<SiscomexResponse<any[]>>(
        `/catp/api/operador-estrangeiro/consultar?cnpjRaiz=${cnpjRaiz}`
      );

      if (!response.data.sucesso) {
        throw new Error(response.data.mensagem || 'Erro ao consultar operadores estrangeiros');
      }

      return response.data.dados;
    } catch (error) {
      logger.error('Erro ao consultar operadores estrangeiros SISCOMEX:', error);
      throw error;
    }
  }

  /**
   * Exporta catálogo completo do SISCOMEX
   */
  async exportarCatalogo(cnpjRaiz: string, incluirDesativados = false): Promise<SiscomexProdutoCadastrado[]> {
    try {
      const params = new URLSearchParams();
      params.append('cnpjRaiz', cnpjRaiz);
      if (incluirDesativados) params.append('incluirDesativados', 'true');

      const response = await this.api.get<SiscomexResponse<SiscomexProdutoCadastrado[]>>(
        `/catp/api/produto/exportar?${params.toString()}`
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
   * Obtém detalhes de uma versão específica do produto
   */
  async detalharVersaoProduto(codigoProduto: string, versao: number): Promise<SiscomexProdutoCadastrado> {
    try {
      const response = await this.api.get<SiscomexResponse<SiscomexProdutoCadastrado>>(
        `/catp/api/produto/${codigoProduto}/versao/${versao}`
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
   * Consulta atributos por NCM
   */
  async consultarAtributosPorNcm(ncm: string, modalidade = 'IMPORTACAO'): Promise<any[]> {
    try {
      const response = await this.api.get<SiscomexResponse<any[]>>(
        `/catp/api/atributo/consultar/${ncm}?modalidade=${modalidade}`
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
   * Testa conectividade básica com a API
   */
  async testarConexao(): Promise<boolean> {
    try {
      const estado = await this.verificarConexao();
      return estado.conectado;
    } catch (error) {
      return false;
    }
  }

  // Método legado mantido para compatibilidade
  async consultarProdutos_legacy(filtros: SiscomexConsultaFiltros) {
    return this.consultarProdutos(filtros);
  }

  async incluirProduto_legacy(produto: any) {
    // Converte do formato legado para o novo formato
    // Esta implementação dependeria da estrutura do formato legado
    throw new Error('Método legado - utilize incluirProduto com SiscomexProdutoPayload');
  }

  async atualizarProduto_legacy(codigoProduto: string, produto: any) {
    // Similar ao incluirProduto_legacy
    throw new Error('Método legado - utilize atualizarProduto com SiscomexProdutoPayload');
  }
}