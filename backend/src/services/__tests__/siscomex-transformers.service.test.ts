// backend/src/services/__tests__/siscomex-transformers.service.test.ts

import { SiscomexTransformersService } from '../siscomex-transformers.service';
import { Prisma } from '@prisma/client';

// Mock data para testes
const mockCatalogo = {
  id: 1,
  nome: 'Catálogo Teste',
  cpf_cnpj: '12345678000190',
  ambiente: 'HOMOLOGACAO' as const,
  status: 'ATIVO' as const,
  numero: 1,
  ultima_alteracao: new Date(),
  superUserId: 1,
  certificadoId: null
};

const mockProdutoCompleto = {
  id: 1,
  codigo: 'PROD001',
  versao: 1,
  status: 'APROVADO' as const,
  situacao: 'ATIVADO' as const,
  ncmCodigo: '12345678',
  modalidade: 'IMPORTACAO',
  denominacao: 'Produto Teste',
  descricao: 'Descrição do produto teste',
  numero: 1,
  catalogoId: 1,
  versaoEstruturaAtributos: 1,
  criadoEm: new Date('2023-01-01'),
  atualizadoEm: new Date(),
  criadoPor: 'teste',
  catalogo: mockCatalogo,
  atributos: [{
    valoresJson: { '001': 'Valor teste', '002': '123' },
    estruturaSnapshotJson: [
      {
        codigo: '001',
        nome: 'Atributo Teste',
        tipo: 'TEXTO',
        obrigatorio: true,
        multivalorado: false,
        validacoes: {}
      },
      {
        codigo: '002',
        nome: 'Atributo Numérico',
        tipo: 'NUMERO_INTEIRO',
        obrigatorio: false,
        multivalorado: false,
        validacoes: {}
      }
    ]
  }],
  codigosInternos: [{ codigo: 'INT001' }],
  operadoresEstrangeiros: [{
    paisCodigo: 'US',
    conhecido: true,
    operadorEstrangeiro: {
      id: 1,
      tin: '123456789',
      nome: 'Fabricante Teste',
      email: 'test@fabricante.com',
      paisCodigo: 'US',
      pais: { codigo: 'US', nome: 'Estados Unidos' },
      subdivisao: { codigo: 'CA', nome: 'California' },
      identificacoesAdicionais: [{
        numero: '123456',
        agenciaEmissora: { codigo: 'DUNS', nome: 'DUNS' },
        agenciaEmissoraCodigo: 'DUNS'
      }],
      logradouro: '123 Main St',
      cidade: 'Los Angeles',
      codigoPostal: '90210',
      dataInclusao: new Date('2023-01-01')
    }
  }]
};

describe('SiscomexTransformersService', () => {
  let service: SiscomexTransformersService;

  beforeEach(() => {
    service = new SiscomexTransformersService();
  });

  describe('transformarProdutoParaSiscomex', () => {
    it('deve transformar produto interno para formato SISCOMEX', () => {
      const resultado = service.transformarProdutoParaSiscomex(mockProdutoCompleto as any);

      expect(resultado).toEqual({
        cnpjRaiz: '12345678',
        ncm: '12345678',
        modalidadeOperacao: 'IMPORTACAO',
        denominacaoProduto: 'Produto Teste',
        detalhamentoComplementar: 'Descrição do produto teste',
        codigoInterno: 'INT001',
        atributos: expect.arrayContaining([
          expect.objectContaining({
            codigo: '001',
            nome: 'Atributo Teste',
            valor: 'Valor teste',
            obrigatorio: true,
            tipo: 'TEXTO'
          }),
          expect.objectContaining({
            codigo: '002',
            nome: 'Atributo Numérico',
            valor: 123,
            obrigatorio: false,
            tipo: 'NUMERO_INTEIRO'
          })
        ]),
        fabricantes: expect.arrayContaining([
          expect.objectContaining({
            tin: '123456789',
            nome: 'Fabricante Teste',
            pais: 'US',
            conhecido: true,
            endereco: {
              logradouro: '123 Main St',
              cidade: 'Los Angeles',
              codigoPostal: '90210',
              subdivisao: 'CA'
            },
            email: 'test@fabricante.com',
            identificacoesAdicionais: [{
              numero: '123456',
              agenciaEmissora: 'DUNS'
            }]
          })
        ]),
        dataReferencia: expect.any(String)
      });
    });

    it('deve extrair CNPJ raiz corretamente', () => {
      const resultado = service.transformarProdutoParaSiscomex(mockProdutoCompleto as any);
      expect(resultado.cnpjRaiz).toBe('12345678');
    });

    it('deve mapear modalidade corretamente', () => {
      const produtoExportacao = {
        ...mockProdutoCompleto,
        modalidade: 'EXPORTACAO'
      };

      const resultado = service.transformarProdutoParaSiscomex(produtoExportacao as any);
      expect(resultado.modalidadeOperacao).toBe('EXPORTACAO');
    });

    it('deve lançar erro quando CNPJ for inválido', () => {
      const produtoInvalido = {
        ...mockProdutoCompleto,
        catalogo: { ...mockCatalogo, cpf_cnpj: '123' }
      };

      expect(() => {
        service.transformarProdutoParaSiscomex(produtoInvalido as any);
      }).toThrow('CNPJ inválido');
    });
  });

  describe('validarProdutoParaEnvio', () => {
    it('deve validar produto válido', () => {
      const resultado = service.validarProdutoParaEnvio(mockProdutoCompleto as any);
      
      expect(resultado.valido).toBe(true);
      expect(resultado.erros).toHaveLength(0);
    });

    it('deve detectar CNPJ ausente', () => {
      const produtoInvalido = {
        ...mockProdutoCompleto,
        catalogo: { ...mockCatalogo, cpf_cnpj: null }
      };

      const resultado = service.validarProdutoParaEnvio(produtoInvalido as any);
      
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain('CNPJ do catálogo é obrigatório');
    });

    it('deve detectar NCM inválido', () => {
      const produtoInvalido = {
        ...mockProdutoCompleto,
        ncmCodigo: '123'
      };

      const resultado = service.validarProdutoParaEnvio(produtoInvalido as any);
      
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain('NCM deve ter 8 dígitos');
    });

    it('deve detectar denominação ausente', () => {
      const produtoInvalido = {
        ...mockProdutoCompleto,
        denominacao: ''
      };

      const resultado = service.validarProdutoParaEnvio(produtoInvalido as any);
      
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain('Denominação do produto é obrigatória');
    });

    it('deve detectar falta de operadores conhecidos', () => {
      const produtoInvalido = {
        ...mockProdutoCompleto,
        operadoresEstrangeiros: [{
          paisCodigo: 'US',
          conhecido: false,
          operadorEstrangeiro: null
        }]
      };

      const resultado = service.validarProdutoParaEnvio(produtoInvalido as any);
      
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain('Pelo menos um operador estrangeiro conhecido deve ser informado');
    });
  });

  describe('gerarArquivoLoteParaUpload', () => {
    it('deve gerar arquivo de lote válido', () => {
      const produtos = [mockProdutoCompleto, mockProdutoCompleto];
      
      const resultado = service.gerarArquivoLoteParaUpload(produtos as any);

      expect(resultado).toEqual({
        versao: '1.0',
        dados: expect.arrayContaining([
          expect.objectContaining({
            cnpjRaiz: '12345678',
            denominacaoProduto: 'Produto Teste'
          })
        ]),
        resumo: {
          totalProdutos: 2,
          cnpjRaiz: '12345678',
          dataGeracao: expect.any(String)
        }
      });
    });

    it('deve lançar erro para produtos de CNPJs diferentes', () => {
      const produto2 = {
        ...mockProdutoCompleto,
        catalogo: { ...mockCatalogo, cpf_cnpj: '87654321000190' }
      };
      
      const produtos = [mockProdutoCompleto, produto2];

      expect(() => {
        service.gerarArquivoLoteParaUpload(produtos as any);
      }).toThrow('Todos os produtos devem pertencer ao mesmo CNPJ raiz');
    });

    it('deve lançar erro para lista vazia', () => {
      expect(() => {
        service.gerarArquivoLoteParaUpload([]);
      }).toThrow('Nenhum produto fornecido para exportação');
    });
  });

  describe('formatação de atributos', () => {
    it('deve formatar número inteiro', () => {
      const service = new SiscomexTransformersService();
      const resultado = (service as any).formatarValorAtributo('123', 'NUMERO_INTEIRO');
      expect(resultado).toBe(123);
      expect(typeof resultado).toBe('number');
    });

    it('deve formatar número real', () => {
      const service = new SiscomexTransformersService();
      const resultado = (service as any).formatarValorAtributo('123.45', 'NUMERO_REAL');
      expect(resultado).toBe(123.45);
      expect(typeof resultado).toBe('number');
    });

    it('deve formatar booleano', () => {
      const service = new SiscomexTransformersService();
      expect((service as any).formatarValorAtributo('true', 'BOOLEANO')).toBe(true);
      expect((service as any).formatarValorAtributo('false', 'BOOLEANO')).toBe(false);
      expect((service as any).formatarValorAtributo(true, 'BOOLEANO')).toBe(true);
    });

    it('deve formatar data', () => {
      const service = new SiscomexTransformersService();
      const resultado = (service as any).formatarValorAtributo('2023-01-01', 'DATA');
      expect(resultado).toBeInstanceOf(Date);
    });

    it('deve manter texto como string', () => {
      const service = new SiscomexTransformersService();
      const resultado = (service as any).formatarValorAtributo('Texto teste', 'TEXTO');
      expect(resultado).toBe('Texto teste');
      expect(typeof resultado).toBe('string');
    });
  });

  describe('transformarOperadorEstrangeiroParaSiscomex', () => {
    const mockOperador = {
      id: 1,
      tin: '123456789',
      nome: 'Operador Teste',
      email: 'test@operador.com',
      paisCodigo: 'US',
      logradouro: '123 Main St',
      cidade: 'Los Angeles',
      codigoPostal: '90210',
      dataInclusao: new Date('2023-01-01'),
      subdivisao: { codigo: 'CA', nome: 'California' },
      identificacoesAdicionais: [{
        numero: '123456',
        agenciaEmissora: { codigo: 'DUNS', nome: 'DUNS' },
        agenciaEmissoraCodigo: 'DUNS'
      }]
    };

    it('deve transformar operador estrangeiro para formato SISCOMEX', () => {
      const resultado = service.transformarOperadorEstrangeiroParaSiscomex(
        mockOperador as any,
        '12345678'
      );

      expect(resultado).toEqual({
        cnpjRaiz: '12345678',
        tin: '123456789',
        nome: 'Operador Teste',
        pais: 'US',
        endereco: {
          logradouro: '123 Main St',
          cidade: 'Los Angeles',
          codigoPostal: '90210',
          subdivisao: 'CA'
        },
        email: 'test@operador.com',
        codigoInterno: undefined,
        identificacoesAdicionais: [{
          numero: '123456',
          agenciaEmissora: 'DUNS'
        }],
        dataReferencia: expect.any(String)
      });
    });

    it('deve lidar com operador sem endereço', () => {
      const operadorSemEndereco = {
        ...mockOperador,
        logradouro: null,
        cidade: null,
        codigoPostal: null
      };

      const resultado = service.transformarOperadorEstrangeiroParaSiscomex(
        operadorSemEndereco as any,
        '12345678'
      );

      expect(resultado.endereco).toBeUndefined();
    });
  });
});