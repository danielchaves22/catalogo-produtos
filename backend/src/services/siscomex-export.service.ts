// backend/src/services/siscomex-export.service.ts

import { catalogoPrisma } from '../utils/prisma';
import { SiscomexTransformersService } from './siscomex-transformers.service';
import { logger } from '../utils/logger';
import { storageFactory } from './storage.factory';
import { getStoragePath } from '../utils/environment';

export interface ExportacaoOptions {
  catalogoId?: number;
  incluirOperadores?: boolean;
  incluirProdutos?: boolean;
  apenasAtivos?: boolean;
  formato?: 'json' | 'xml';
}

export interface ExportacaoResultado {
  sucesso: boolean;
  arquivo?: {
    nome: string;
    caminho: string;
    tamanho: number;
  };
  resumo: {
    totalProdutos: number;
    totalOperadores: number;
    produtosValidados: number;
    produtosComErro: number;
    erros: string[];
  };
  metadados: {
    catalogoId?: number;
    cnpjRaiz: string;
    nomeEmpresa: string;
    dataExportacao: string;
    ambiente: string;
  };
}

/**
 * Serviço responsável por exportar dados para formato SISCOMEX
 * Permite gerar arquivos JSON/XML sem enviar para a API
 */
export class SiscomexExportService {
  private transformersService = new SiscomexTransformersService();

  /**
   * Exporta catálogo completo para formato SISCOMEX
   */
  async exportarCatalogo(
    superUserId: number,
    options: ExportacaoOptions = {}
  ): Promise<ExportacaoResultado> {
    try {
      logger.info(`Iniciando exportação SISCOMEX para superUserId: ${superUserId}`);

      const {
        catalogoId,
        incluirOperadores = true,
        incluirProdutos = true,
        apenasAtivos = true,
        formato = 'json'
      } = options;

      // Busca dados do banco
      const { produtos, operadores, catalogo } = await this.buscarDadosParaExportacao(
        superUserId,
        catalogoId,
        incluirProdutos,
        incluirOperadores,
        apenasAtivos
      );

      // Validação inicial
      if (!catalogo?.cpf_cnpj) {
        throw new Error('CNPJ não encontrado no catálogo');
      }

      // Processa produtos e coleta erros
      const { produtosValidos, erros } = await this.processarProdutos(produtos);

      // Gera dados no formato SISCOMEX
      const dadosExportacao = await this.transformersService.gerarArquivoExportacaoCompleta(
        catalogoId || 0,
        produtosValidos,
        operadores
      );

      // Salva arquivo
      const arquivo = await this.salvarArquivoExportacao(
        dadosExportacao,
        superUserId,
        formato
      );

      // Monta resultado
      const resultado: ExportacaoResultado = {
        sucesso: true,
        arquivo,
        resumo: {
          totalProdutos: produtos.length,
          totalOperadores: operadores.length,
          produtosValidados: produtosValidos.length,
          produtosComErro: produtos.length - produtosValidos.length,
          erros
        },
        metadados: {
          catalogoId,
          cnpjRaiz: dadosExportacao.metadata.cnpjRaiz,
          nomeEmpresa: dadosExportacao.metadata.nomeEmpresa,
          dataExportacao: dadosExportacao.metadata.dataExportacao,
          ambiente: dadosExportacao.metadata.ambiente
        }
      };

      logger.info(`Exportação SISCOMEX concluída com sucesso. Arquivo: ${arquivo.nome}`);
      return resultado;

    } catch (error) {
      logger.error('Erro na exportação SISCOMEX:', error);
      
      return {
        sucesso: false,
        resumo: {
          totalProdutos: 0,
          totalOperadores: 0,
          produtosValidados: 0,
          produtosComErro: 0,
          erros: [error instanceof Error ? error.message : 'Erro desconhecido']
        },
        metadados: {
          cnpjRaiz: '',
          nomeEmpresa: '',
          dataExportacao: new Date().toISOString(),
          ambiente: ''
        }
      };
    }
  }

  /**
   * Exporta apenas produtos específicos
   */
  async exportarProdutos(
    produtoIds: number[],
    superUserId: number,
    formato: 'json' | 'xml' = 'json'
  ): Promise<ExportacaoResultado> {
    try {
      logger.info(`Exportando produtos específicos: ${produtoIds.join(', ')}`);

      const produtos = await catalogoPrisma.produto.findMany({
        where: {
          id: { in: produtoIds },
          catalogo: { superUserId }
        },
        include: {
          catalogo: true,
          atributos: true,
          codigosInternos: true,
          operadoresEstrangeiros: {
            include: {
              pais: true,
              operadorEstrangeiro: {
                include: {
                  pais: true,
                  subdivisao: true,
                  identificacoesAdicionais: {
                    include: { agenciaEmissora: true }
                  }
                }
              }
            }
          }
        }
      });

      if (produtos.length === 0) {
        throw new Error('Nenhum produto encontrado para exportação');
      }

      // Processa e valida produtos
      const { produtosValidos, erros } = await this.processarProdutos(produtos);

      // Gera arquivo em lote
      const dadosLote = this.transformersService.gerarArquivoLoteParaUpload(produtosValidos);

      // Salva arquivo
      const nomeArquivo = `produtos_siscomex_${Date.now()}.${formato}`;
      const conteudo = formato === 'json' 
        ? JSON.stringify(dadosLote, null, 2)
        : this.converterParaXML(dadosLote);

      const arquivo = await this.salvarArquivo(
        Buffer.from(conteudo, 'utf8'),
        nomeArquivo,
        superUserId
      );

      return {
        sucesso: true,
        arquivo,
        resumo: {
          totalProdutos: produtos.length,
          totalOperadores: 0,
          produtosValidados: produtosValidos.length,
          produtosComErro: produtos.length - produtosValidos.length,
          erros
        },
        metadados: {
          cnpjRaiz: dadosLote.resumo.cnpjRaiz,
          nomeEmpresa: produtos[0]?.catalogo?.nome || '',
          dataExportacao: dadosLote.resumo.dataGeracao,
          ambiente: produtos[0]?.catalogo?.ambiente || 'HOMOLOGACAO'
        }
      };

    } catch (error) {
      logger.error('Erro na exportação de produtos específicos:', error);
      throw error;
    }
  }

  /**
   * Valida produtos antes da exportação
   */
  async validarProdutosParaExportacao(
    produtoIds: number[],
    superUserId: number
  ): Promise<{
    produtosValidos: number[];
    produtosInvalidos: Array<{
      id: number;
      denominacao: string;
      erros: string[];
    }>;
  }> {
    const produtos = await catalogoPrisma.produto.findMany({
      where: {
        id: { in: produtoIds },
        catalogo: { superUserId }
      },
      include: {
        catalogo: true,
        atributos: true,
        codigosInternos: true,
        operadoresEstrangeiros: {
          include: {
            pais: true,
            operadorEstrangeiro: {
              include: {
                pais: true,
                subdivisao: true,
                identificacoesAdicionais: {
                  include: { agenciaEmissora: true }
                }
              }
            }
          }
        }
      }
    });

    const produtosValidos: number[] = [];
    const produtosInvalidos: Array<{
      id: number;
      denominacao: string;
      erros: string[];
    }> = [];

    for (const produto of produtos) {
      const validacao = this.transformersService.validarProdutoParaEnvio(produto as any);
      
      if (validacao.valido) {
        produtosValidos.push(produto.id);
      } else {
        produtosInvalidos.push({
          id: produto.id,
          denominacao: produto.denominacao,
          erros: validacao.erros
        });
      }
    }

    return { produtosValidos, produtosInvalidos };
  }

  /**
   * Gera preview dos dados que seriam enviados
   */
  async gerarPreviewExportacao(
    catalogoId: number,
    superUserId: number
  ): Promise<{
    produtos: any[];
    operadores: any[];
    resumo: {
      totalItens: number;
      produtosValidos: number;
      produtosInvalidos: number;
      operadoresAtivos: number;
    };
  }> {
    const { produtos, operadores } = await this.buscarDadosParaExportacao(
      superUserId,
      catalogoId,
      true,
      true,
      false
    );

    const { produtosValidos } = await this.processarProdutos(produtos);

    // Transforma apenas os primeiros 5 produtos para preview
    const produtosPreview = produtosValidos.slice(0, 5).map(produto => 
      this.transformersService.transformarProdutoParaSiscomex(produto as any)
    );

    // Transforma apenas os primeiros 5 operadores para preview
    const operadoresPreview = operadores.slice(0, 5).map(operador => {
      const cnpjRaiz = this.extrairCnpjRaiz(produtos[0]?.catalogo?.cpf_cnpj);
      return this.transformersService.transformarOperadorEstrangeiroParaSiscomex(
        operador as any,
        cnpjRaiz
      );
    });

    return {
      produtos: produtosPreview,
      operadores: operadoresPreview,
      resumo: {
        totalItens: produtos.length + operadores.length,
        produtosValidos: produtosValidos.length,
        produtosInvalidos: produtos.length - produtosValidos.length,
        operadoresAtivos: operadores.filter(o => o.situacao === 'ATIVADO').length
      }
    };
  }

  // Métodos privados

  private async buscarDadosParaExportacao(
    superUserId: number,
    catalogoId?: number,
    incluirProdutos = true,
    incluirOperadores = true,
    apenasAtivos = true
  ) {
    const whereClause: any = { superUserId };
    if (catalogoId) whereClause.id = catalogoId;

    // Busca catálogo
    const catalogo = await catalogoPrisma.catalogo.findFirst({
      where: whereClause
    });

    if (!catalogo) {
      throw new Error('Catálogo não encontrado');
    }

    // Busca produtos
    let produtos: any[] = [];
    if (incluirProdutos) {
      const produtoWhere: any = { catalogoId: catalogo.id };
      if (apenasAtivos) {
        produtoWhere.situacao = 'ATIVADO';
      }

      produtos = await catalogoPrisma.produto.findMany({
        where: produtoWhere,
        include: {
          catalogo: true,
          atributos: true,
          codigosInternos: true,
          operadoresEstrangeiros: {
            include: {
              pais: true,
              operadorEstrangeiro: {
                include: {
                  pais: true,
                  subdivisao: true,
                  identificacoesAdicionais: {
                    include: { agenciaEmissora: true }
                  }
                }
              }
            }
          }
        }
      });
    }

    // Busca operadores estrangeiros
    let operadores: any[] = [];
    if (incluirOperadores) {
      const operadorWhere: any = { catalogoId: catalogo.id };
      if (apenasAtivos) {
        operadorWhere.situacao = 'ATIVADO';
      }

      operadores = await catalogoPrisma.operadorEstrangeiro.findMany({
        where: operadorWhere,
        include: {
          pais: true,
          subdivisao: true,
          identificacoesAdicionais: {
            include: { agenciaEmissora: true }
          }
        }
      });
    }

    return { produtos, operadores, catalogo };
  }

  private async processarProdutos(produtos: any[]): Promise<{
    produtosValidos: any[];
    erros: string[];
  }> {
    const produtosValidos: any[] = [];
    const erros: string[] = [];

    for (const produto of produtos) {
      try {
        const validacao = this.transformersService.validarProdutoParaEnvio(produto);
        
        if (validacao.valido) {
          produtosValidos.push(produto);
        } else {
          erros.push(`Produto ${produto.denominacao}: ${validacao.erros.join(', ')}`);
        }
      } catch (error) {
        erros.push(`Produto ${produto.denominacao}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      }
    }

    return { produtosValidos, erros };
  }

  private async salvarArquivoExportacao(
    dadosExportacao: any,
    superUserId: number,
    formato: 'json' | 'xml'
  ): Promise<{
    nome: string;
    caminho: string;
    tamanho: number;
  }> {
    const nomeArquivo = `catalogo_siscomex_${Date.now()}.${formato}`;
    
    const conteudo = formato === 'json' 
      ? JSON.stringify(dadosExportacao, null, 2)
      : this.converterParaXML(dadosExportacao);

    return this.salvarArquivo(
      Buffer.from(conteudo, 'utf8'),
      nomeArquivo,
      superUserId
    );
  }

  private async salvarArquivo(
    buffer: Buffer,
    nomeArquivo: string,
    superUserId: number
  ): Promise<{
    nome: string;
    caminho: string;
    tamanho: number;
  }> {
    const provider = storageFactory();
    const caminho = getStoragePath({
      identifier: String(superUserId),
      type: 'certificados' // Reusa a estrutura de certificados para exports
    });
    
    const caminhoCompleto = `${caminho}/exports/${nomeArquivo}`;
    
    await provider.upload(buffer, caminhoCompleto);

    return {
      nome: nomeArquivo,
      caminho: caminhoCompleto,
      tamanho: buffer.length
    };
  }

  private converterParaXML(dados: any): string {
    // Implementação básica de conversão para XML
    // Para uma implementação completa, usar uma biblioteca como xml2js
    
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
    const xmlData = this.objetoParaXML(dados, 'catalogo');
    
    return xmlHeader + xmlData;
  }

  private objetoParaXML(obj: any, rootName: string): string {
    let xml = `<${rootName}>`;
    
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        xml += `<${key}>`;
        for (const item of value) {
          xml += this.objetoParaXML(item, 'item');
        }
        xml += `</${key}>`;
      } else if (typeof value === 'object' && value !== null) {
        xml += this.objetoParaXML(value, key);
      } else {
        xml += `<${key}>${this.escaparXML(String(value))}</${key}>`;
      }
    }
    
    xml += `</${rootName}>`;
    return xml;
  }

  private escaparXML(texto: string): string {
    return texto
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private extrairCnpjRaiz(cpfCnpj?: string): string {
    if (!cpfCnpj) throw new Error('CNPJ não informado');
    
    const apenasNumeros = cpfCnpj.replace(/\D/g, '');
    
    if (apenasNumeros.length === 14) {
      return apenasNumeros.substring(0, 8);
    }
    
    throw new Error('CNPJ inválido para extração do CNPJ raiz');
  }
}