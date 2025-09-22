// backend/src/services/siscomex-transformers.service.ts

import { Produto, OperadorEstrangeiro, IdentificacaoAdicional, Catalogo } from '@prisma/client';
import { AtributoEstruturaDTO } from './atributo-legacy.service';

/**
 * Interfaces baseadas na documentação oficial do SISCOMEX CATP
 */

// Produto no formato SISCOMEX
export interface SiscomexProdutoPayload {
  cnpjRaiz: string;
  ncm: string;
  modalidadeOperacao: 'IMPORTACAO' | 'EXPORTACAO' | 'AMBOS';
  denominacaoProduto: string;
  detalhamentoComplementar?: string;
  codigoInterno?: string;
  atributos: SiscomexAtributo[];
  fabricantes: SiscomexFabricante[];
  dataReferencia?: string;
}

export interface SiscomexAtributo {
  codigo: string;
  nome: string;
  valor: string | number | boolean | Date;
  obrigatorio: boolean;
  tipo: 'TEXTO' | 'NUMERO_INTEIRO' | 'NUMERO_REAL' | 'BOOLEANO' | 'DATA' | 'LISTA_ESTATICA' | 'COMPOSTO';
  valorCodigoDescricao?: string; // Para listas estáticas
  subAtributos?: SiscomexAtributo[]; // Para atributos compostos
}

export interface SiscomexFabricante {
  tin?: string;
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
  identificacoesAdicionais?: Array<{
    numero: string;
    agenciaEmissora: string;
  }>;
}

// Operador Estrangeiro no formato SISCOMEX
export interface SiscomexOperadorEstrangeiroPayload {
  cnpjRaiz: string;
  tin?: string;
  nome: string;
  pais: string;
  endereco?: {
    logradouro: string;
    cidade: string;
    codigoPostal: string;
    subdivisao: string;
  };
  email?: string;
  codigoInterno?: string;
  identificacoesAdicionais?: Array<{
    numero: string;
    agenciaEmissora: string;
  }>;
  dataReferencia?: string;
}

// Resposta da API SISCOMEX
export interface SiscomexResponse<T> {
  sucesso: boolean;
  dados: T;
  mensagem?: string;
  erros?: string[];
}

// Produto cadastrado retornado pelo SISCOMEX
export interface SiscomexProdutoCadastrado {
  codigo: string;
  versao: number;
  situacao: 'ATIVADO' | 'DESATIVADO' | 'RASCUNHO';
  ncm: string;
  denominacao: string;
  dataRegistro: string;
  dataUltimaAlteracao: string;
}

/**
 * Interface estendida para produtos com relacionamentos
 */
interface ProdutoCompleto extends Produto {
  catalogo: Catalogo;
  atributos: Array<{
    valoresJson: any;
    estruturaSnapshotJson: any;
  }>;
  codigosInternos: Array<{ codigo: string }>;
  operadoresEstrangeiros: Array<{
    paisCodigo: string;
    conhecido: boolean;
    operadorEstrangeiro?: OperadorEstrangeiroCompleto;
  }>;
}

interface OperadorEstrangeiroCompleto extends OperadorEstrangeiro {
  pais: { codigo: string; nome: string };
  subdivisao?: { codigo: string; nome: string };
  identificacoesAdicionais: Array<IdentificacaoAdicional & {
    agenciaEmissora: { codigo: string; nome: string };
  }>;
}

/**
 * Service para transformar dados internos em formato SISCOMEX
 */
export class SiscomexTransformersService {
  
  /**
   * Transforma um produto interno para o formato SISCOMEX
   */
  transformarProdutoParaSiscomex(produto: ProdutoCompleto): SiscomexProdutoPayload {
    const cnpjRaiz = this.extrairCnpjRaiz(produto.catalogo.cpf_cnpj);
    
    return {
      cnpjRaiz,
      ncm: produto.ncmCodigo,
      modalidadeOperacao: this.mapearModalidade(produto.modalidade),
      denominacaoProduto: produto.denominacao,
      detalhamentoComplementar: produto.descricao,
      codigoInterno: produto.codigosInternos[0]?.codigo,
      atributos: this.transformarAtributos(produto.atributos),
      fabricantes: this.transformarFabricantes(produto.operadoresEstrangeiros),
      dataReferencia: produto.criadoEm.toISOString()
    };
  }

  /**
   * Transforma um operador estrangeiro interno para o formato SISCOMEX
   */
  transformarOperadorEstrangeiroParaSiscomex(
    operador: OperadorEstrangeiroCompleto, 
    cnpjRaiz: string
  ): SiscomexOperadorEstrangeiroPayload {
    return {
      cnpjRaiz,
      tin: operador.tin || undefined,
      nome: operador.nome,
      pais: operador.paisCodigo,
      endereco: operador.logradouro ? {
        logradouro: operador.logradouro,
        cidade: operador.cidade || '',
        codigoPostal: operador.codigoPostal || '',
        subdivisao: operador.subdivisao?.codigo || ''
      } : undefined,
      email: operador.email || undefined,
      codigoInterno: operador.codigoInterno || undefined,
      identificacoesAdicionais: operador.identificacoesAdicionais.map(id => ({
        numero: id.numero,
        agenciaEmissora: id.agenciaEmissora.codigo
      })),
      dataReferencia: operador.dataInclusao.toISOString()
    };
  }

  /**
   * Gera arquivo JSON para download do catálogo completo
   */
  async gerarArquivoExportacaoCompleta(
    catalogoId: number,
    produtos: ProdutoCompleto[],
    operadores: OperadorEstrangeiroCompleto[]
  ): Promise<{
    metadata: any;
    produtos: SiscomexProdutoPayload[];
    operadores: SiscomexOperadorEstrangeiroPayload[];
  }> {
    const catalogo = produtos[0]?.catalogo;
    const cnpjRaiz = this.extrairCnpjRaiz(catalogo?.cpf_cnpj);

    return {
      metadata: {
        catalogoId,
        cnpjRaiz,
        nomeEmpresa: catalogo?.nome,
        dataExportacao: new Date().toISOString(),
        totalProdutos: produtos.length,
        totalOperadores: operadores.length,
        ambiente: catalogo?.ambiente
      },
      produtos: produtos.map(produto => this.transformarProdutoParaSiscomex(produto)),
      operadores: operadores.map(operador => 
        this.transformarOperadorEstrangeiroParaSiscomex(operador, cnpjRaiz)
      )
    };
  }

  /**
   * Extrai CNPJ raiz (8 primeiros dígitos) do CNPJ completo
   */
  private extrairCnpjRaiz(cpfCnpj?: string): string {
    if (!cpfCnpj) throw new Error('CNPJ não informado');
    
    const apenasNumeros = cpfCnpj.replace(/\D/g, '');
    
    if (apenasNumeros.length === 14) {
      return apenasNumeros.substring(0, 8);
    }
    
    throw new Error('CNPJ inválido para extração do CNPJ raiz');
  }

  /**
   * Mapeia modalidade interna para formato SISCOMEX
   */
  private mapearModalidade(modalidade?: string): 'IMPORTACAO' | 'EXPORTACAO' | 'AMBOS' {
    switch (modalidade?.toUpperCase()) {
      case 'EXPORTACAO':
        return 'EXPORTACAO';
      case 'IMPORTACAO':
        return 'IMPORTACAO';
      case 'AMBOS':
        return 'AMBOS';
      default:
        return 'IMPORTACAO'; // Padrão para compatibilidade
    }
  }

  /**
   * Transforma atributos internos para formato SISCOMEX
   */
  private transformarAtributos(atributosData: Array<{ valoresJson: any; estruturaSnapshotJson: any }>): SiscomexAtributo[] {
    if (!atributosData.length) return [];

    const valores = atributosData[0].valoresJson as Record<string, any>;
    const estrutura = atributosData[0].estruturaSnapshotJson as AtributoEstruturaDTO[];

    return this.processarAtributosRecursivo(estrutura, valores);
  }

  /**
   * Processa atributos de forma recursiva para suportar compostos
   */
  private processarAtributosRecursivo(estrutura: AtributoEstruturaDTO[], valores: Record<string, any>): SiscomexAtributo[] {
    const atributos: SiscomexAtributo[] = [];

    for (const attr of estrutura) {
      const valor = valores[attr.codigo];
      
      // Pula atributos não preenchidos (exceto obrigatórios)
      if (valor === undefined || valor === null || valor === '') {
        if (attr.obrigatorio) {
          throw new Error(`Atributo obrigatório não preenchido: ${attr.nome} (${attr.codigo})`);
        }
        continue;
      }

      const siscomexAttr: SiscomexAtributo = {
        codigo: attr.codigo,
        nome: attr.nome,
        valor: this.formatarValorAtributo(valor, attr.tipo),
        obrigatorio: attr.obrigatorio,
        tipo: this.mapearTipoAtributo(attr.tipo)
      };

      // Adiciona descrição para listas estáticas
      if (attr.tipo === 'LISTA_ESTATICA' && attr.dominio) {
        const opcao = attr.dominio.find(d => d.codigo === String(valor));
        if (opcao) {
          siscomexAttr.valorCodigoDescricao = opcao.descricao || undefined;
        }
      }

      // Processa sub-atributos para atributos compostos
      if (attr.subAtributos && attr.subAtributos.length > 0) {
        siscomexAttr.subAtributos = this.processarAtributosRecursivo(attr.subAtributos, valores);
      }

      atributos.push(siscomexAttr);
    }

    return atributos;
  }

  /**
   * Formata valor do atributo de acordo com o tipo
   */
  private formatarValorAtributo(valor: any, tipo: string): string | number | boolean | Date {
    switch (tipo) {
      case 'NUMERO_INTEIRO':
        return parseInt(String(valor), 10);
      case 'NUMERO_REAL':
        return parseFloat(String(valor));
      case 'BOOLEANO':
        return valor === 'true' || valor === true;
      case 'DATA':
        return new Date(valor);
      default:
        return String(valor);
    }
  }

  /**
   * Mapeia tipo de atributo interno para formato SISCOMEX
   */
  private mapearTipoAtributo(tipo: string): SiscomexAtributo['tipo'] {
    const mapeamento: Record<string, SiscomexAtributo['tipo']> = {
      'TEXTO': 'TEXTO',
      'NUMERO_INTEIRO': 'NUMERO_INTEIRO',
      'NUMERO_REAL': 'NUMERO_REAL',
      'BOOLEANO': 'BOOLEANO',
      'DATA': 'DATA',
      'LISTA_ESTATICA': 'LISTA_ESTATICA',
      'COMPOSTO': 'COMPOSTO'
    };

    return mapeamento[tipo] || 'TEXTO';
  }

  /**
   * Transforma fabricantes/operadores estrangeiros do produto
   */
  private transformarFabricantes(operadoresEstrangeiros: Array<{
    paisCodigo: string;
    conhecido: boolean;
    operadorEstrangeiro?: OperadorEstrangeiroCompleto;
  }>): SiscomexFabricante[] {
    return operadoresEstrangeiros.map(oe => {
      if (!oe.conhecido || !oe.operadorEstrangeiro) {
        // Operador desconhecido - apenas país
        return {
          nome: `Operador não identificado`,
          pais: oe.paisCodigo,
          conhecido: false
        };
      }

      const op = oe.operadorEstrangeiro;
      
      return {
        tin: op.tin || undefined,
        nome: op.nome,
        pais: op.paisCodigo,
        conhecido: true,
        endereco: op.logradouro ? {
          logradouro: op.logradouro,
          cidade: op.cidade || '',
          codigoPostal: op.codigoPostal || '',
          subdivisao: op.subdivisao?.codigo || ''
        } : undefined,
        email: op.email || undefined,
        codigoInterno: op.codigoInterno || undefined,
        identificacoesAdicionais: op.identificacoesAdicionais.map(id => ({
          numero: id.numero,
          agenciaEmissora: id.agenciaEmissoraCodigo
        }))
      };
    });
  }

  /**
   * Valida se um produto está pronto para envio ao SISCOMEX
   */
  validarProdutoParaEnvio(produto: ProdutoCompleto): { valido: boolean; erros: string[] } {
    const erros: string[] = [];

    // Validações básicas
    if (!produto.catalogo.cpf_cnpj) {
      erros.push('CNPJ do catálogo é obrigatório');
    }

    if (!produto.ncmCodigo || produto.ncmCodigo.length !== 8) {
      erros.push('NCM deve ter 8 dígitos');
    }

    if (!produto.denominacao?.trim()) {
      erros.push('Denominação do produto é obrigatória');
    }

    // Validação de atributos obrigatórios
    if (produto.atributos.length > 0) {
      try {
        this.transformarAtributos(produto.atributos);
      } catch (error) {
        erros.push(`Erro nos atributos: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      }
    }

    // Validação de operadores estrangeiros
    const operadoresConhecidos = produto.operadoresEstrangeiros.filter(oe => oe.conhecido);
    if (operadoresConhecidos.length === 0) {
      erros.push('Pelo menos um operador estrangeiro conhecido deve ser informado');
    }

    return {
      valido: erros.length === 0,
      erros
    };
  }

  /**
   * Converte dados para formato de exportação em lote
   */
  gerarArquivoLoteParaUpload(produtos: ProdutoCompleto[]): {
    versao: string;
    dados: SiscomexProdutoPayload[];
    resumo: {
      totalProdutos: number;
      cnpjRaiz: string;
      dataGeracao: string;
    };
  } {
    if (produtos.length === 0) {
      throw new Error('Nenhum produto fornecido para exportação');
    }

    const cnpjRaiz = this.extrairCnpjRaiz(produtos[0].catalogo.cpf_cnpj);

    // Valida se todos os produtos são do mesmo CNPJ raiz
    const cnpjsDiferentes = produtos.filter(p => 
      this.extrairCnpjRaiz(p.catalogo.cpf_cnpj) !== cnpjRaiz
    );

    if (cnpjsDiferentes.length > 0) {
      throw new Error('Todos os produtos devem pertencer ao mesmo CNPJ raiz');
    }

    return {
      versao: '1.0',
      dados: produtos.map(produto => this.transformarProdutoParaSiscomex(produto)),
      resumo: {
        totalProdutos: produtos.length,
        cnpjRaiz,
        dataGeracao: new Date().toISOString()
      }
    };
  }
}