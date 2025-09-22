// backend/src/validators/siscomex.validator.ts

import { z } from 'zod';

// Schema para exportação de catálogo
export const exportCatalogoSchema = z.object({
  catalogoId: z.coerce.number().int().positive().optional(),
  incluirOperadores: z.coerce.boolean().optional().default(true),
  incluirProdutos: z.coerce.boolean().optional().default(true),
  apenasAtivos: z.coerce.boolean().optional().default(true),
  formato: z.enum(['json', 'xml']).optional().default('json')
});

// Schema para exportação de produtos específicos
export const exportProdutosSchema = z.object({
  produtoIds: z.array(z.number().int().positive()).min(1, {
    message: 'Pelo menos um produto deve ser informado'
  }).max(100, {
    message: 'Máximo de 100 produtos por exportação'
  }),
  formato: z.enum(['json', 'xml']).optional().default('json')
});

// Schema para validação de produtos
export const validarProdutosSchema = z.object({
  produtoIds: z.array(z.number().int().positive()).min(1, {
    message: 'Pelo menos um produto deve ser informado'
  }).max(500, {
    message: 'Máximo de 500 produtos por validação'
  })
});

// Schema para consulta de produtos SISCOMEX
export const consultaProdutosSiscomexSchema = z.object({
  cnpjRaiz: z.string().regex(/^\d{8}$/, {
    message: 'CNPJ raiz deve ter exatamente 8 dígitos'
  }),
  codigoProduto: z.string().optional(),
  ncm: z.string().regex(/^\d{8}$/, {
    message: 'NCM deve ter exatamente 8 dígitos'
  }).optional(),
  situacao: z.enum(['ATIVADO', 'DESATIVADO', 'RASCUNHO']).optional(),
  incluirDesativados: z.coerce.boolean().optional().default(false)
});

// Schema para incluir produto no SISCOMEX
export const incluirProdutoSiscomexSchema = z.object({
  cnpjRaiz: z.string().regex(/^\d{8}$/, {
    message: 'CNPJ raiz deve ter exatamente 8 dígitos'
  }),
  ncm: z.string().regex(/^\d{8}$/, {
    message: 'NCM deve ter exatamente 8 dígitos'
  }),
  modalidadeOperacao: z.enum(['IMPORTACAO', 'EXPORTACAO', 'AMBOS']),
  denominacaoProduto: z.string().min(1, {
    message: 'Denominação do produto é obrigatória'
  }).max(200, {
    message: 'Denominação deve ter no máximo 200 caracteres'
  }),
  detalhamentoComplementar: z.string().max(4000, {
    message: 'Detalhamento deve ter no máximo 4000 caracteres'
  }).optional(),
  codigoInterno: z.string().max(60, {
    message: 'Código interno deve ter no máximo 60 caracteres'
  }).optional(),
  atributos: z.array(z.object({
    codigo: z.string(),
    nome: z.string(),
    valor: z.union([z.string(), z.number(), z.boolean(), z.date()]),
    obrigatorio: z.boolean(),
    tipo: z.enum(['TEXTO', 'NUMERO_INTEIRO', 'NUMERO_REAL', 'BOOLEANO', 'DATA', 'LISTA_ESTATICA', 'COMPOSTO']),
    valorCodigoDescricao: z.string().optional(),
    subAtributos: z.array(z.any()).optional() // Recursivo
  })),
  fabricantes: z.array(z.object({
    tin: z.string().optional(),
    nome: z.string().min(1, {
      message: 'Nome do fabricante é obrigatório'
    }),
    pais: z.string().length(2, {
      message: 'Código do país deve ter 2 caracteres'
    }),
    conhecido: z.boolean(),
    endereco: z.object({
      logradouro: z.string(),
      cidade: z.string(),
      codigoPostal: z.string(),
      subdivisao: z.string()
    }).optional(),
    email: z.string().email().optional(),
    codigoInterno: z.string().optional(),
    identificacoesAdicionais: z.array(z.object({
      numero: z.string(),
      agenciaEmissora: z.string()
    })).optional()
  })).min(1, {
    message: 'Pelo menos um fabricante deve ser informado'
  }),
  dataReferencia: z.string().datetime().optional()
});

// Schema para incluir operador estrangeiro no SISCOMEX
export const incluirOperadorEstrangeiroSiscomexSchema = z.object({
  cnpjRaiz: z.string().regex(/^\d{8}$/, {
    message: 'CNPJ raiz deve ter exatamente 8 dígitos'
  }),
  tin: z.string().optional(),
  nome: z.string().min(1, {
    message: 'Nome do operador é obrigatório'
  }).max(200, {
    message: 'Nome deve ter no máximo 200 caracteres'
  }),
  pais: z.string().length(2, {
    message: 'Código do país deve ter 2 caracteres'
  }),
  endereco: z.object({
    logradouro: z.string().max(200),
    cidade: z.string().max(100),
    codigoPostal: z.string().max(20),
    subdivisao: z.string().max(10)
  }).optional(),
  email: z.string().email().optional(),
  codigoInterno: z.string().max(60).optional(),
  identificacoesAdicionais: z.array(z.object({
    numero: z.string().max(50),
    agenciaEmissora: z.string().max(10)
  })).optional(),
  dataReferencia: z.string().datetime().optional()
});

// Schema para busca de histórico
export const historicoExportacoesSchema = z.object({
  limite: z.coerce.number().int().min(1).max(100).optional().default(10),
  offset: z.coerce.number().int().min(0).optional().default(0),
  dataInicio: z.string().datetime().optional(),
  dataFim: z.string().datetime().optional(),
  formato: z.enum(['json', 'xml']).optional(),
  status: z.enum(['sucesso', 'erro', 'processando']).optional()
});

// Schema para download de arquivo
export const downloadArquivoSchema = z.object({
  arquivo: z.string().regex(/^[a-zA-Z0-9_\-\.]+$/, {
    message: 'Nome de arquivo inválido'
  }).refine(val => !val.includes('..'), {
    message: 'Nome de arquivo não pode conter ..'
  })
});

// Schema para preview
export const previewExportacaoSchema = z.object({
  catalogoId: z.coerce.number().int().positive({
    message: 'ID do catálogo deve ser um número positivo'
  })
});

// Schema para status de exportação
export const statusExportacaoSchema = z.object({
  catalogoId: z.coerce.number().int().positive().optional()
});

// Schema para remoção de arquivo
export const removerArquivoSchema = z.object({
  arquivo: z.string().regex(/^[a-zA-Z0-9_\-\.]+$/, {
    message: 'Nome de arquivo inválido'
  }).refine(val => {
    // Verifica extensões permitidas
    const extensoesPermitidas = ['.json', '.xml', '.zip'];
    return extensoesPermitidas.some(ext => val.toLowerCase().endsWith(ext));
  }, {
    message: 'Tipo de arquivo não permitido'
  })
});

// Schema para atualização de produto SISCOMEX
export const atualizarProdutoSiscomexSchema = z.object({
  codigo: z.string().min(1, {
    message: 'Código do produto é obrigatório'
  }),
  modalidadeOperacao: z.enum(['IMPORTACAO', 'EXPORTACAO', 'AMBOS']).optional(),
  denominacaoProduto: z.string().min(1).max(200).optional(),
  detalhamentoComplementar: z.string().max(4000).optional(),
  codigoInterno: z.string().max(60).optional(),
  atributos: z.array(z.object({
    codigo: z.string(),
    nome: z.string(),
    valor: z.union([z.string(), z.number(), z.boolean(), z.date()]),
    obrigatorio: z.boolean(),
    tipo: z.enum(['TEXTO', 'NUMERO_INTEIRO', 'NUMERO_REAL', 'BOOLEANO', 'DATA', 'LISTA_ESTATICA', 'COMPOSTO'])
  })).optional(),
  fabricantes: z.array(z.object({
    tin: z.string().optional(),
    nome: z.string().min(1),
    pais: z.string().length(2),
    conhecido: z.boolean(),
    endereco: z.object({
      logradouro: z.string(),
      cidade: z.string(),
      codigoPostal: z.string(),
      subdivisao: z.string()
    }).optional()
  })).optional()
});

// Utilitários de validação específicos para SISCOMEX
export class SiscomexValidationUtils {
  
  /**
   * Valida se um TIN está no formato correto para um país específico
   */
  static validarTIN(tin: string, paisCodigo: string): boolean {
    // Implementação simplificada - na prática, cada país tem seu formato
    const formatosPorPais: Record<string, RegExp> = {
      'US': /^\d{2}-\d{7}$/, // Formato americano simplificado
      'DE': /^DE\d{9}$/, // Formato alemão
      'GB': /^GB\d{9}$/, // Formato britânico
      'FR': /^FR[A-Z]{2}\d{9}$/, // Formato francês
      'IT': /^IT\d{11}$/, // Formato italiano
      'CA': /^\d{9}RT\d{4}$/, // Formato canadense
      'MX': /^[A-Z]{4}\d{6}[A-Z]{3}$/, // Formato mexicano
      'CN': /^\d{18}$/, // Formato chinês
      'JP': /^\d{13}$/, // Formato japonês
    };

    const formato = formatosPorPais[paisCodigo];
    if (!formato) {
      // Se não temos formato específico, aceita qualquer string alfanumérica
      return /^[A-Z0-9\-]{3,50}$/i.test(tin);
    }

    return formato.test(tin);
  }

  /**
   * Valida código postal por país
   */
  static validarCodigoPostal(codigoPostal: string, paisCodigo: string): boolean {
    const formatosPorPais: Record<string, RegExp> = {
      'US': /^\d{5}(-\d{4})?$/, // ZIP code americano
      'BR': /^\d{5}-?\d{3}$/, // CEP brasileiro
      'CA': /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/, // Código postal canadense
      'GB': /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i, // UK postcode
      'DE': /^\d{5}$/, // Código postal alemão
      'FR': /^\d{5}$/, // Código postal francês
    };

    const formato = formatosPorPais[paisCodigo];
    if (!formato) {
      // Formato genérico
      return /^[A-Z0-9\s\-]{3,20}$/i.test(codigoPostal);
    }

    return formato.test(codigoPostal);
  }

  /**
   * Valida se um arquivo é seguro para download
   */
  static validarArquivoSeguro(nomeArquivo: string): boolean {
    // Verifica caracteres perigosos
    const caracteresProibidos = ['/', '\\', '..', '<', '>', ':', '"', '|', '?', '*'];
    
    if (caracteresProibidos.some(char => nomeArquivo.includes(char))) {
      return false;
    }

    // Verifica extensões permitidas
    const extensoesPermitidas = ['.json', '.xml', '.zip', '.txt'];
    const temExtensaoValida = extensoesPermitidas.some(ext => 
      nomeArquivo.toLowerCase().endsWith(ext)
    );

    return temExtensaoValida;
  }

  /**
   * Valida limite de tamanho de lote baseado no tipo de operação
   */
  static validarTamanhoLote(quantidade: number, tipoOperacao: 'validacao' | 'exportacao' | 'envio'): boolean {
    const limites = {
      validacao: 500,
      exportacao: 100,
      envio: 50
    };

    return quantidade <= limites[tipoOperacao];
  }

  /**
   * Normaliza CNPJ raiz removendo caracteres especiais
   */
  static normalizarCnpjRaiz(cnpj: string): string {
    const apenasNumeros = cnpj.replace(/\D/g, '');
    
    if (apenasNumeros.length >= 8) {
      return apenasNumeros.substring(0, 8);
    }
    
    throw new Error('CNPJ inválido para extração do CNPJ raiz');
  }

  /**
   * Valida se o ambiente SISCOMEX está configurado corretamente
   */
  static validarConfiguracaoAmbiente(): { valido: boolean; erros: string[] } {
    const erros: string[] = [];

    if (!process.env.SISCOMEX_API_URL) {
      erros.push('SISCOMEX_API_URL não configurada');
    }

    if (!process.env.SISCOMEX_CERT_PATH) {
      erros.push('SISCOMEX_CERT_PATH não configurada');
    }

    if (!process.env.SISCOMEX_KEY_PATH) {
      erros.push('SISCOMEX_KEY_PATH não configurada');
    }

    if (!process.env.CERT_PASSWORD_SECRET) {
      erros.push('CERT_PASSWORD_SECRET não configurada');
    }

    const ambiente = process.env.SISCOMEX_AMBIENTE;
    if (ambiente && !['producao', 'treinamento'].includes(ambiente)) {
      erros.push('SISCOMEX_AMBIENTE deve ser "producao" ou "treinamento"');
    }

    return {
      valido: erros.length === 0,
      erros
    };
  }
}

// Middleware personalizado para validações específicas do SISCOMEX
export function validateSiscomexConfig() {
  return (req: any, res: any, next: any) => {
    const validacao = SiscomexValidationUtils.validarConfiguracaoAmbiente();
    
    if (!validacao.valido) {
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Configuração SISCOMEX inválida',
        erros: validacao.erros
      });
    }

    next();
  };
}

// Middleware para validar arquivos de upload/download
export function validateFileAccess() {
  return (req: any, res: any, next: any) => {
    const { arquivo } = req.params;
    
    if (arquivo && !SiscomexValidationUtils.validarArquivoSeguro(arquivo)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nome de arquivo inválido ou inseguro'
      });
    }

    next();
  };
}

// Middleware para validar limites de lote
export function validateBatchSize(tipoOperacao: 'validacao' | 'exportacao' | 'envio') {
  return (req: any, res: any, next: any) => {
    const { produtoIds } = req.body;
    
    if (Array.isArray(produtoIds)) {
      const valido = SiscomexValidationUtils.validarTamanhoLote(produtoIds.length, tipoOperacao);
      
      if (!valido) {
        return res.status(400).json({
          sucesso: false,
          mensagem: `Limite de ${tipoOperacao} excedido`,
          detalhes: `Máximo permitido para ${tipoOperacao}: ${produtoIds.length > 500 ? 500 : produtoIds.length > 100 ? 100 : 50} itens`
        });
      }
    }

    next();
  };
}