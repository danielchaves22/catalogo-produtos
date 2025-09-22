// backend/src/services/__tests__/siscomex-export.service.test.ts

import { SiscomexExportService } from '../siscomex-export.service';
import { catalogoPrisma } from '../../utils/prisma';

// Mock do Prisma
jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: {
    catalogo: {
      findFirst: jest.fn(),
      findMany: jest.fn()
    },
    produto: {
      findMany: jest.fn()
    },
    operadorEstrangeiro: {
      findMany: jest.fn()
    }
  }
}));

// Mock do storage factory
jest.mock('../storage.factory', () => ({
  storageFactory: jest.fn().mockReturnValue({
    upload: jest.fn().mockResolvedValue('mock-path'),
    get: jest.fn().mockResolvedValue(Buffer.from('mock content')),
    delete: jest.fn().mockResolvedValue(undefined)
  })
}));

// Mock dos transformers
jest.mock('../siscomex-transformers.service', () => ({
  SiscomexTransformersService: jest.fn().mockImplementation(() => ({
    validarProdutoParaEnvio: jest.fn().mockReturnValue({
      valido: true,
      erros: []
    }),
    gerarArquivoExportacaoCompleta: jest.fn().mockResolvedValue({
      metadata: {
        catalogoId: 1,
        cnpjRaiz: '12345678',
        nomeEmpresa: 'Teste',
        dataExportacao: '2023-01-01T00:00:00.000Z',
        totalProdutos: 1,
        totalOperadores: 1,
        ambiente: 'HOMOLOGACAO'
      },
      produtos: [{}],
      operadores: [{}]
    }),
    gerarArquivoLoteParaUpload: jest.fn().mockReturnValue({
      versao: '1.0',
      dados: [{}],
      resumo: {
        totalProdutos: 1,
        cnpjRaiz: '12345678',
        dataGeracao: '2023-01-01T00:00:00.000Z'
      }
    })
  }))
}));

const mockCatalogo = {
  id: 1,
  nome: 'Catálogo Teste',
  cpf_cnpj: '12345678000190',
  ambiente: 'HOMOLOGACAO',
  status: 'ATIVO',
  numero: 1,
  ultima_alteracao: new Date(),
  superUserId: 1,
  certificadoId: null
};

const mockProduto = {
  id: 1,
  codigo: 'PROD001',
  versao: 1,
  status: 'APROVADO',
  situacao: 'ATIVADO',
  ncmCodigo: '12345678',
  modalidade: 'IMPORTACAO',
  denominacao: 'Produto Teste',
  descricao: 'Descrição teste',
  numero: 1,
  catalogoId: 1,
  versaoEstruturaAtributos: 1,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  criadoPor: 'teste',
  catalogo: mockCatalogo,
  atributos: [{ valoresJson: {}, estruturaSnapshotJson: [] }],
  codigosInternos: [{ codigo: 'INT001' }],
  operadoresEstrangeiros: []
};

const mockOperador = {
  id: 1,
  tin: '123456789',
  nome: 'Operador Teste',
  paisCodigo: 'US',
  situacao: 'ATIVADO',
  catalogoId: 1,
  dataInclusao: new Date(),
  pais: { codigo: 'US', nome: 'Estados Unidos' },
  subdivisao: null,
  identificacoesAdicionais: []
};

describe('SiscomexExportService', () => {
  let service: SiscomexExportService;
  const mockPrisma = catalogoPrisma as jest.Mocked<typeof catalogoPrisma>;

  beforeEach(() => {
    service = new SiscomexExportService();
    jest.clearAllMocks();
  });

  describe('exportarCatalogo', () => {
    it('deve exportar catálogo com sucesso', async () => {
      // Arrange
      mockPrisma.catalogo.findFirst.mockResolvedValue(mockCatalogo as any);
      mockPrisma.produto.findMany.mockResolvedValue([mockProduto] as any);
      mockPrisma.operadorEstrangeiro.findMany.mockResolvedValue([mockOperador] as any);

      // Act
      const resultado = await service.exportarCatalogo(1, {
        incluirProdutos: true,
        incluirOperadores: true,
        apenasAtivos: true,
        formato: 'json'
      });

      // Assert
      expect(resultado.sucesso).toBe(true);
      expect(resultado.arquivo).toBeDefined();
      expect(resultado.arquivo!.nome).toMatch(/^catalogo_siscomex_\d+\.json$/);
      expect(resultado.resumo.totalProdutos).toBe(1);
      expect(resultado.resumo.totalOperadores).toBe(1);
      expect(resultado.metadados.cnpjRaiz).toBe('12345678');
    });

    it('deve lidar com catálogo não encontrado', async () => {
      // Arrange
      mockPrisma.catalogo.findFirst.mockResolvedValue(null);

      // Act
      const resultado = await service.exportarCatalogo(1);

      // Assert
      expect(resultado.sucesso).toBe(false);
      expect(resultado.resumo.erros).toContain('Catálogo não encontrado');
    });

    it('deve aplicar filtros corretamente', async () => {
      // Arrange
      mockPrisma.catalogo.findFirst.mockResolvedValue(mockCatalogo as any);
      mockPrisma.produto.findMany.mockResolvedValue([]);
      mockPrisma.operadorEstrangeiro.findMany.mockResolvedValue([]);

      // Act
      await service.exportarCatalogo(1, {
        catalogoId: 5,
        apenasAtivos: true,
        incluirProdutos: false,
        incluirOperadores: false
      });

      // Assert
      expect(mockPrisma.catalogo.findFirst).toHaveBeenCalledWith({
        where: { superUserId: 1, id: 5 }
      });
    });

    it('deve filtrar apenas produtos ativos quando solicitado', async () => {
      // Arrange
      mockPrisma.catalogo.findFirst.mockResolvedValue(mockCatalogo as any);
      mockPrisma.produto.findMany.mockResolvedValue([]);
      mockPrisma.operadorEstrangeiro.findMany.mockResolvedValue([]);

      // Act
      await service.exportarCatalogo(1, { apenasAtivos: true });

      // Assert
      expect(mockPrisma.produto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            situacao: 'ATIVADO'
          })
        })
      );
    });
  });

  describe('exportarProdutos', () => {
    it('deve exportar produtos específicos com sucesso', async () => {
      // Arrange
      mockPrisma.produto.findMany.mockResolvedValue([mockProduto] as any);

      // Act
      const resultado = await service.exportarProdutos([1, 2], 1, 'json');

      // Assert
      expect(resultado.sucesso).toBe(true);
      expect(resultado.arquivo).toBeDefined();
      expect(resultado.arquivo!.nome).toMatch(/^produtos_siscomex_\d+\.json$/);
      expect(mockPrisma.produto.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: [1, 2] },
          catalogo: { superUserId: 1 }
        },
        include: expect.any(Object)
      });
    });

    it('deve lançar erro quando nenhum produto for encontrado', async () => {
      // Arrange
      mockPrisma.produto.findMany.mockResolvedValue([]);

      // Act & Assert
      await expect(service.exportarProdutos([999], 1)).rejects.toThrow(
        'Nenhum produto encontrado para exportação'
      );
    });

    it('deve gerar arquivo XML quando solicitado', async () => {
      // Arrange
      mockPrisma.produto.findMany.mockResolvedValue([mockProduto] as any);

      // Act
      const resultado = await service.exportarProdutos([1], 1, 'xml');

      // Assert
      expect(resultado.arquivo!.nome).toMatch(/^produtos_siscomex_\d+\.xml$/);
    });
  });

  describe('validarProdutosParaExportacao', () => {
    it('deve validar produtos corretamente', async () => {
      // Arrange
      const mockTransformers = require('../siscomex-transformers.service');
      const transformerInstance = new mockTransformers.SiscomexTransformersService();
      
      transformerInstance.validarProdutoParaEnvio
        .mockReturnValueOnce({ valido: true, erros: [] })
        .mockReturnValueOnce({ valido: false, erros: ['Erro teste'] });

      mockPrisma.produto.findMany.mockResolvedValue([
        { ...mockProduto, id: 1, denominacao: 'Produto Válido' },
        { ...mockProduto, id: 2, denominacao: 'Produto Inválido' }
      ] as any);

      // Act
      const resultado = await service.validarProdutosParaExportacao([1, 2], 1);

      // Assert
      expect(resultado.produtosValidos).toEqual([1]);
      expect(resultado.produtosInvalidos).toHaveLength(1);
      expect(resultado.produtosInvalidos[0]).toEqual({
        id: 2,
        denominacao: 'Produto Inválido',
        erros: ['Erro teste']
      });
    });
  });

  describe('gerarPreviewExportacao', () => {
    it('deve gerar preview com limite de itens', async () => {
      // Arrange
      const produtos = Array(10).fill(0).map((_, i) => ({ ...mockProduto, id: i + 1 }));
      const operadores = Array(10).fill(0).map((_, i) => ({ ...mockOperador, id: i + 1 }));

      mockPrisma.catalogo.findFirst.mockResolvedValue(mockCatalogo as any);
      mockPrisma.produto.findMany.mockResolvedValue(produtos as any);
      mockPrisma.operadorEstrangeiro.findMany.mockResolvedValue(operadores as any);

      // Act
      const resultado = await service.gerarPreviewExportacao(1, 1);

      // Assert
      expect(resultado.produtos).toHaveLength(5); // Limitado a 5 no preview
      expect(resultado.operadores).toHaveLength(5); // Limitado a 5 no preview
      expect(resultado.resumo.totalItens).toBe(20); // 10 produtos + 10 operadores
    });
  });

  describe('salvarArquivo', () => {
    it('deve salvar arquivo corretamente', async () => {
      // Arrange
      const { storageFactory } = require('../storage.factory');
      const mockStorage = storageFactory();
      const buffer = Buffer.from('test content');

      // Act
      const resultado = await (service as any).salvarArquivo(buffer, 'test.json', 1);

      // Assert
      expect(mockStorage.upload).toHaveBeenCalledWith(
        buffer,
        expect.stringContaining('1/certificados/exports/test.json')
      );
      expect(resultado).toEqual({
        nome: 'test.json',
        caminho: expect.stringContaining('exports/test.json'),
        tamanho: buffer.length
      });
    });
  });

  describe('conversão XML', () => {
    it('deve converter objeto para XML básico', () => {
      // Arrange
      const dados = {
        produto: {
          nome: 'Teste',
          codigo: '123'
        },
        lista: ['item1', 'item2']
      };

      // Act
      const xml = (service as any).converterParaXML(dados);

      // Assert
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<catalogo>');
      expect(xml).toContain('<nome>Teste</nome>');
      expect(xml).toContain('<codigo>123</codigo>');
      expect(xml).toContain('</catalogo>');
    });

    it('deve escapar caracteres especiais XML', () => {
      // Arrange
      const texto = 'Teste & "aspas" <tags>';

      // Act
      const resultado = (service as any).escaparXML(texto);

      // Assert
      expect(resultado).toBe('Teste &amp; &quot;aspas&quot; &lt;tags&gt;');
    });
  });

  describe('buscarDadosParaExportacao', () => {
    it('deve buscar dados com filtros corretos', async () => {
      // Arrange
      mockPrisma.catalogo.findFirst.mockResolvedValue(mockCatalogo as any);
      mockPrisma.produto.findMany.mockResolvedValue([]);
      mockPrisma.operadorEstrangeiro.findMany.mockResolvedValue([]);

      // Act
      await (service as any).buscarDadosParaExportacao(1, 5, true, true, true);

      // Assert
      expect(mockPrisma.catalogo.findFirst).toHaveBeenCalledWith({
        where: { superUserId: 1, id: 5 }
      });
      expect(mockPrisma.produto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            catalogoId: 1,
            situacao: 'ATIVADO'
          })
        })
      );
      expect(mockPrisma.operadorEstrangeiro.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            catalogoId: 1,
            situacao: 'ATIVADO'
          })
        })
      );
    });

    it('deve pular busca de produtos quando não solicitado', async () => {
      // Arrange
      mockPrisma.catalogo.findFirst.mockResolvedValue(mockCatalogo as any);

      // Act
      const resultado = await (service as any).buscarDadosParaExportacao(1, 1, false, false, true);

      // Assert
      expect(mockPrisma.produto.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.operadorEstrangeiro.findMany).not.toHaveBeenCalled();
      expect(resultado.produtos).toEqual([]);
      expect(resultado.operadores).toEqual([]);
    });
  });

  describe('processarProdutos', () => {
    it('deve separar produtos válidos dos inválidos', async () => {
      // Arrange
      const produtos = [
        { ...mockProduto, id: 1, denominacao: 'Produto 1' },
        { ...mockProduto, id: 2, denominacao: 'Produto 2' }
      ];

      const mockTransformers = require('../siscomex-transformers.service');
      const transformerInstance = new mockTransformers.SiscomexTransformersService();
      
      transformerInstance.validarProdutoParaEnvio
        .mockReturnValueOnce({ valido: true, erros: [] })
        .mockReturnValueOnce({ valido: false, erros: ['Erro no produto 2'] });

      // Act
      const resultado = await (service as any).processarProdutos(produtos);

      // Assert
      expect(resultado.produtosValidos).toHaveLength(1);
      expect(resultado.produtosValidos[0].id).toBe(1);
      expect(resultado.erros).toContain('Produto Produto 2: Erro no produto 2');
    });

    it('deve capturar exceções durante validação', async () => {
      // Arrange
      const produtos = [{ ...mockProduto, denominacao: 'Produto com erro' }];

      const mockTransformers = require('../siscomex-transformers.service');
      const transformerInstance = new mockTransformers.SiscomexTransformersService();
      
      transformerInstance.validarProdutoParaEnvio.mockImplementation(() => {
        throw new Error('Erro inesperado');
      });

      // Act
      const resultado = await (service as any).processarProdutos(produtos);

      // Assert
      expect(resultado.produtosValidos).toHaveLength(0);
      expect(resultado.erros).toContain('Produto Produto com erro: Erro inesperado');
    });
  });
});