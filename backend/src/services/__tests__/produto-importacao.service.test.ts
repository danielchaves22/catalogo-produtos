import { ProdutoImportacaoService } from '../produto-importacao.service';
import { createAsyncJob } from '../../jobs/async-job.repository';
import { ProdutoService } from '../produto.service';

jest.mock('../../jobs/async-job.repository', () => ({
  createAsyncJob: jest.fn().mockResolvedValue({ id: 999 }),
}));

var mockCatalogoPrisma = {
  catalogo: { findFirst: jest.fn() },
  usuarioCatalogo: { findFirst: jest.fn() },
  importacaoProduto: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
  importacaoProdutoItem: { create: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  produtoAtributo: { deleteMany: jest.fn() },
  produto: { deleteMany: jest.fn() },
  ncmCache: { findUnique: jest.fn() },
  ncmAtributoValorGrupo: { findFirst: jest.fn() },
  mensagem: { create: jest.fn(), deleteMany: jest.fn() },
  pais: { findMany: jest.fn() },
  operadorEstrangeiro: { findMany: jest.fn() },
  asyncJob: { deleteMany: jest.fn() },
  $transaction: jest.fn(),
} as any;

jest.mock('../../utils/prisma', () => ({
  get catalogoPrisma() {
    return mockCatalogoPrisma;
  },
}));

var mockNcmLegacyService = {
  sincronizarNcm: jest.fn(),
};

jest.mock('../ncm-legacy.service', () => ({
  NcmLegacyService: jest.fn(() => mockNcmLegacyService),
}));

describe('ProdutoImportacaoService', () => {
  let service: ProdutoImportacaoService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNcmLegacyService.sincronizarNcm.mockReset();
    mockCatalogoPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback(mockCatalogoPrisma)
    );
    mockCatalogoPrisma.ncmAtributoValorGrupo.findFirst.mockResolvedValue(null);
    mockCatalogoPrisma.pais.findMany.mockResolvedValue([]);
    mockCatalogoPrisma.operadorEstrangeiro.findMany.mockResolvedValue([]);
    mockCatalogoPrisma.importacaoProduto.findMany.mockResolvedValue([]);
    mockCatalogoPrisma.importacaoProdutoItem.findMany.mockResolvedValue([]);
    mockCatalogoPrisma.importacaoProdutoItem.create.mockResolvedValue({ id: 1 });
    mockCatalogoPrisma.mensagem.deleteMany.mockResolvedValue({ count: 0 });
    mockCatalogoPrisma.importacaoProduto.delete.mockResolvedValue({});
    mockCatalogoPrisma.asyncJob.deleteMany.mockResolvedValue({ count: 0 });
    (createAsyncJob as jest.Mock).mockClear();
    (createAsyncJob as jest.Mock).mockResolvedValue({ id: 999 });
    service = new ProdutoImportacaoService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cria registro e enfileira job ao iniciar importação', async () => {
    mockCatalogoPrisma.catalogo.findFirst.mockResolvedValue({
      id: 1,
      nome: 'Catálogo Teste',
      numero: 123,
    });
    mockCatalogoPrisma.usuarioCatalogo.findFirst.mockResolvedValue({ id: 10 });
    mockCatalogoPrisma.importacaoProduto.create.mockResolvedValue({
      id: 55,
      situacao: 'EM_ANDAMENTO',
      resultado: 'PENDENTE',
    });

    const arquivoBase64 = Buffer.from('conteudo').toString('base64');

    const resultado = await service.importarPlanilhaExcel(
      {
        catalogoId: 1,
        modalidade: 'IMPORTACAO',
        arquivo: { nome: 'produtos.xlsx', conteudoBase64: arquivoBase64 },
      },
      99,
      77
    );

    expect(mockCatalogoPrisma.importacaoProduto.create).toHaveBeenCalledTimes(1);
    expect(createAsyncJob).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'IMPORTACAO_PRODUTO',
        payload: expect.objectContaining({ importacaoId: 55, catalogoId: 1, superUserId: 99 }),
        arquivo: { nome: 'produtos.xlsx', conteudoBase64: arquivoBase64 },
      }),
      mockCatalogoPrisma
    );
    expect(mockCatalogoPrisma.importacaoProduto.update).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { asyncJobId: 999 },
    });
    expect(resultado).toEqual(
      expect.objectContaining({ id: 55, situacao: 'EM_ANDAMENTO', resultado: 'PENDENTE' })
    );
  });

  it('processa job e atualiza totais ao concluir importação', async () => {
    const arquivoBase64 = Buffer.from('conteudo').toString('base64');

    mockCatalogoPrisma.catalogo.findFirst.mockResolvedValue({
      id: 1,
      nome: 'Catálogo Teste',
      numero: 123,
      cpf_cnpj: '00000000000',
    });
    mockCatalogoPrisma.ncmCache.findUnique.mockResolvedValue({ codigo: '12345678' });
    mockNcmLegacyService.sincronizarNcm.mockResolvedValue(null);
    mockCatalogoPrisma.importacaoProdutoItem.create.mockResolvedValue({ id: 500 });
    mockCatalogoPrisma.importacaoProduto.update.mockResolvedValue(undefined);
    mockCatalogoPrisma.mensagem.create.mockResolvedValue(undefined);
    mockCatalogoPrisma.pais.findMany.mockResolvedValue([{ codigo: 'BR' }]);
    mockCatalogoPrisma.operadorEstrangeiro.findMany.mockResolvedValue([
      { id: 10, numero: 123, paisCodigo: 'BR' },
    ]);

    jest
      .spyOn(ProdutoService.prototype, 'criar')
      .mockResolvedValue({ id: 999 } as any);
    jest
      .spyOn<any, any>(service as any, 'lerPlanilha')
      .mockResolvedValue([
        [
          'Código Interno',
          'Descrição Curta Produto',
          'Descrição Longa Produto',
          'NCM',
          'Fabricante',
          'Operador Estrangeiro',
        ],
        ['SKU001', 'Produto Teste', 'Descrição longa', '12345678', 'BR', '123'],
      ]);

    await service.processarImportacaoJob({
      importacaoId: 88,
      superUserId: 99,
      usuarioCatalogoId: 10,
      catalogoId: 1,
      modalidade: 'IMPORTACAO',
      arquivo: { nome: 'produtos.xlsx', conteudoBase64: arquivoBase64 },
    });

    const chamada = mockCatalogoPrisma.importacaoProdutoItem.create.mock.calls[0][0];
    expect(chamada.data).toEqual(
      expect.objectContaining({
        importacaoId: 88,
        linhaPlanilha: 2,
        produtoId: 999,
        resultado: 'SUCESSO'
      })
    );
    expect(mockCatalogoPrisma.importacaoProduto.update).toHaveBeenCalledWith({
      where: { id: 88 },
      data: expect.objectContaining({
        situacao: 'CONCLUIDA',
        totalRegistros: 1,
        totalCriados: 1,
        totalComErro: 0,
      }),
    });
    expect(mockCatalogoPrisma.mensagem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ superUserId: 99 }),
      })
    );
    expect(ProdutoService.prototype.criar).toHaveBeenCalledWith(
      expect.objectContaining({
        denominacao: 'Produto Teste',
        descricao: 'Descrição longa',
        codigosInternos: ['SKU001'],
        operadoresEstrangeiros: expect.arrayContaining([
          expect.objectContaining({ paisCodigo: 'BR', conhecido: false }),
          expect.objectContaining({
            paisCodigo: 'BR',
            conhecido: true,
            operadorEstrangeiroId: 10,
          }),
        ]),
      }),
      99,
      mockCatalogoPrisma
    );
  });

  it('não cria produto quando ocorre erro e persiste item com status de erro', async () => {
    const arquivoBase64 = Buffer.from('conteudo').toString('base64');

    mockCatalogoPrisma.catalogo.findFirst.mockResolvedValue({
      id: 1,
      nome: 'Catálogo Teste',
      numero: 123,
      cpf_cnpj: '00000000000',
    });
    mockCatalogoPrisma.ncmCache.findUnique.mockResolvedValue({ codigo: '12345678' });
    mockCatalogoPrisma.importacaoProduto.update.mockResolvedValue(undefined);
    mockCatalogoPrisma.mensagem.create.mockResolvedValue(undefined);
    mockCatalogoPrisma.pais.findMany.mockResolvedValue([{ codigo: 'BR' }]);

    jest
      .spyOn(ProdutoService.prototype, 'criar')
      .mockRejectedValue(new Error('Falha inesperada'));

    jest
      .spyOn<any, any>(service as any, 'lerPlanilha')
      .mockResolvedValue([
        [
          'Código Interno',
          'Descrição Curta Produto',
          'Descrição Longa Produto',
          'NCM',
          'Fabricante',
          'Operador Estrangeiro',
        ],
        ['SKU001', 'Produto Teste', 'Descrição longa', '12345678', 'BR', ''],
      ]);

    await service.processarImportacaoJob({
      importacaoId: 99,
      superUserId: 77,
      usuarioCatalogoId: 10,
      catalogoId: 1,
      modalidade: 'IMPORTACAO',
      arquivo: { nome: 'produtos.xlsx', conteudoBase64: arquivoBase64 },
    });

    expect(ProdutoService.prototype.criar).toHaveBeenCalledWith(
      expect.any(Object),
      77,
      mockCatalogoPrisma
    );

    const chamada = mockCatalogoPrisma.importacaoProdutoItem.create.mock.calls[0][0];
    expect(chamada.data).toEqual(
      expect.objectContaining({
        importacaoId: 99,
        linhaPlanilha: 2,
        resultado: 'ERRO',
        produtoId: null,
        possuiErroImpeditivo: true,
      })
    );

    expect(mockCatalogoPrisma.importacaoProduto.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: expect.objectContaining({
        totalCriados: 0,
        totalComErro: 1,
      }),
    });
  });

  it('sincroniza NCM no legado quando não encontrada no cache', async () => {
    const arquivoBase64 = Buffer.from('conteudo').toString('base64');

    mockCatalogoPrisma.catalogo.findFirst.mockResolvedValue({
      id: 1,
      nome: 'Catálogo Teste',
      numero: 123,
      cpf_cnpj: '00000000000',
    });
    mockCatalogoPrisma.ncmCache.findUnique.mockResolvedValue(null);
    mockCatalogoPrisma.importacaoProdutoItem.create.mockResolvedValue({ id: 700 });
    mockCatalogoPrisma.importacaoProduto.update.mockResolvedValue(undefined);
    mockCatalogoPrisma.mensagem.create.mockResolvedValue(undefined);
    
    mockNcmLegacyService.sincronizarNcm.mockResolvedValue({
      descricao: 'Teste',
      unidadeMedida: 'KG',
    });
    mockCatalogoPrisma.pais.findMany.mockResolvedValue([{ codigo: 'BR' }]);
    mockCatalogoPrisma.operadorEstrangeiro.findMany.mockResolvedValue([
      { id: 5, numero: 987, paisCodigo: 'BR' },
    ]);

    const criarProdutoSpy = jest
      .spyOn(ProdutoService.prototype, 'criar')
      .mockResolvedValue({ id: 123 } as any);

    jest
      .spyOn<any, any>(service as any, 'lerPlanilha')
      .mockResolvedValue([
        [
          'Código Interno',
          'Descrição Curta Produto',
          'Descrição Longa Produto',
          'NCM',
          'Fabricante',
          'Operador Estrangeiro',
        ],
        ['SKUABC', 'Produto Teste', '', '87654321', 'BR', '987'],
      ]);

    await service.processarImportacaoJob({
      importacaoId: 88,
      superUserId: 99,
      usuarioCatalogoId: 10,
      catalogoId: 1,
      modalidade: 'IMPORTACAO',
      arquivo: { nome: 'produtos.xlsx', conteudoBase64: arquivoBase64 },
    });

    expect(mockNcmLegacyService.sincronizarNcm).toHaveBeenCalledWith('87654321');
    expect(criarProdutoSpy).toHaveBeenCalledWith(
      expect.any(Object),
      99,
      mockCatalogoPrisma
    );
  });

  it('reaproveita validação de NCM repetida evitando consultas duplicadas', async () => {
    const arquivoBase64 = Buffer.from('conteudo').toString('base64');

    mockCatalogoPrisma.catalogo.findFirst.mockResolvedValue({
      id: 1,
      nome: 'Catálogo Teste',
      numero: 123,
      cpf_cnpj: '00000000000',
    });
    mockCatalogoPrisma.ncmCache.findUnique.mockResolvedValueOnce(null);
    mockNcmLegacyService.sincronizarNcm.mockResolvedValueOnce({
      descricao: 'Teste',
      unidadeMedida: 'KG',
    });
    mockCatalogoPrisma.importacaoProdutoItem.create.mockResolvedValue({ id: 301 });
    mockCatalogoPrisma.importacaoProduto.update.mockResolvedValue(undefined);
    mockCatalogoPrisma.mensagem.create.mockResolvedValue(undefined);
    mockCatalogoPrisma.pais.findMany.mockResolvedValue([{ codigo: 'BR' }]);

    jest
      .spyOn(ProdutoService.prototype, 'criar')
      .mockResolvedValue({ id: 999 } as any);
    jest
      .spyOn<any, any>(service as any, 'lerPlanilha')
      .mockResolvedValue([
        [
          'Código Interno',
          'Descrição Curta Produto',
          'Descrição Longa Produto',
          'NCM',
          'Fabricante',
          'Operador Estrangeiro',
        ],
        ['SKU001', 'Produto Teste 1', 'Desc 1', '12345678', '', ''],
        ['SKU002', 'Produto Teste 2', 'Desc 2', '12345678', '', ''],
      ]);

    await service.processarImportacaoJob({
      importacaoId: 88,
      superUserId: 99,
      usuarioCatalogoId: 10,
      catalogoId: 1,
      modalidade: 'IMPORTACAO',
      arquivo: { nome: 'produtos.xlsx', conteudoBase64: arquivoBase64 },
    });

    expect(mockCatalogoPrisma.ncmCache.findUnique).toHaveBeenCalledTimes(1);
    expect(mockNcmLegacyService.sincronizarNcm).toHaveBeenCalledTimes(1);
    expect(mockCatalogoPrisma.importacaoProdutoItem.create).toHaveBeenCalledTimes(2);
  });

  it('marca erro quando fabricante possui código inválido', async () => {
    const arquivoBase64 = Buffer.from('conteudo').toString('base64');

    mockCatalogoPrisma.catalogo.findFirst.mockResolvedValue({
      id: 1,
      nome: 'Catálogo Teste',
      numero: 123,
      cpf_cnpj: '00000000000',
    });
    mockCatalogoPrisma.ncmCache.findUnique.mockResolvedValue({ codigo: '12345678' });
    mockCatalogoPrisma.importacaoProdutoItem.create.mockResolvedValue({ id: 901 });
    mockCatalogoPrisma.importacaoProduto.update.mockResolvedValue(undefined);
    mockCatalogoPrisma.mensagem.create.mockResolvedValue(undefined);
    mockCatalogoPrisma.pais.findMany.mockResolvedValue([{ codigo: 'BR' }]);

    const criarSpy = jest
      .spyOn(ProdutoService.prototype, 'criar')
      .mockResolvedValue({ id: 111 } as any);

    jest
      .spyOn<any, any>(service as any, 'lerPlanilha')
      .mockResolvedValue([
        [
          'Código Interno',
          'Descrição Curta Produto',
          'Descrição Longa Produto',
          'NCM',
          'Fabricante',
          'Operador Estrangeiro',
        ],
        ['SKU001', 'Produto Teste', '', '12345678', 'INVALIDO', ''],
      ]);

    await service.processarImportacaoJob({
      importacaoId: 88,
      superUserId: 99,
      usuarioCatalogoId: 10,
      catalogoId: 1,
      modalidade: 'IMPORTACAO',
      arquivo: { nome: 'produtos.xlsx', conteudoBase64: arquivoBase64 },
    });

    expect(criarSpy).not.toHaveBeenCalled();
    const chamada = mockCatalogoPrisma.importacaoProdutoItem.create.mock.calls[0][0];
    const item = chamada.data;
    expect(item.resultado).toBe('ERRO');
    expect(item.possuiErroImpeditivo).toBe(true);
    expect(JSON.stringify(item.mensagens)).toContain(
      'Fabricante contém códigos com formato inválido'
    );
  });

  it('reverte importação removendo produtos e atualizando a situação', async () => {
    mockCatalogoPrisma.importacaoProduto.findFirst.mockResolvedValue({
      id: 77,
      situacao: 'CONCLUIDA',
      itens: [
        { id: 1, produtoId: 201 },
        { id: 2, produtoId: 202 },
        { id: 3, produtoId: null },
      ],
    } as any);
    mockCatalogoPrisma.importacaoProdutoItem.updateMany.mockResolvedValue({ count: 2 });
    mockCatalogoPrisma.produtoAtributo.deleteMany.mockResolvedValue({ count: 2 });
    mockCatalogoPrisma.produto.deleteMany.mockResolvedValue({ count: 2 });
    mockCatalogoPrisma.importacaoProduto.update.mockResolvedValue({});

    await service.reverterImportacao(77, 99);

    expect(mockCatalogoPrisma.importacaoProdutoItem.updateMany).toHaveBeenCalledWith({
      where: { importacaoId: 77, produtoId: { in: [201, 202] } },
      data: { produtoId: null },
    });
    expect(mockCatalogoPrisma.produtoAtributo.deleteMany).toHaveBeenCalledWith({
      where: { produtoId: { in: [201, 202] } },
    });
    expect(mockCatalogoPrisma.produto.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [201, 202] }, catalogo: { superUserId: 99 } },
    });
    expect(mockCatalogoPrisma.importacaoProduto.update).toHaveBeenCalledWith({
      where: { id: 77 },
      data: expect.objectContaining({ situacao: 'REVERTIDA' }),
    });
    const chamadaUpdate = mockCatalogoPrisma.importacaoProduto.update.mock.calls[0][0];
    expect(chamadaUpdate.data.finalizadoEm).toBeInstanceOf(Date);
  });

  it('impede reverter importação em andamento', async () => {
    mockCatalogoPrisma.importacaoProduto.findFirst.mockResolvedValue({
      id: 10,
      situacao: 'EM_ANDAMENTO',
      itens: [],
    } as any);

    await expect(service.reverterImportacao(10, 99)).rejects.toThrow('IMPORTACAO_EM_ANDAMENTO');
  });

  it('impede reverter importação já revertida', async () => {
    mockCatalogoPrisma.importacaoProduto.findFirst.mockResolvedValue({
      id: 11,
      situacao: 'REVERTIDA',
      itens: [],
    } as any);

    await expect(service.reverterImportacao(11, 99)).rejects.toThrow('IMPORTACAO_JA_REVERTIDA');
  });

  it('retorna erro quando importação não é encontrada para reverter', async () => {
    mockCatalogoPrisma.importacaoProduto.findFirst.mockResolvedValue(null);

    await expect(service.reverterImportacao(12, 99)).rejects.toThrow('IMPORTACAO_NAO_ENCONTRADA');
  });
  it('remove importacao concluida limpando job e notificacoes associadas', async () => {
    mockCatalogoPrisma.importacaoProduto.findFirst.mockResolvedValue({
      id: 70,
      situacao: 'CONCLUIDA',
      asyncJobId: 300,
      asyncJob: { arquivo: null },
    } as any);

    await expect(service.removerImportacao(70, 99)).resolves.toBe(true);

    expect(mockCatalogoPrisma.mensagem.deleteMany).toHaveBeenCalledWith({
      where: {
        superUserId: 99,
        categoria: 'IMPORTACAO_CONCLUIDA',
        metadados: {
          path: '$.importacaoId',
          equals: 70,
        },
      },
    });
    expect(mockCatalogoPrisma.importacaoProduto.delete).toHaveBeenCalledWith({
      where: { id: 70 },
    });
    expect(mockCatalogoPrisma.asyncJob.deleteMany).toHaveBeenCalledWith({
      where: { id: 300 },
    });
  });

  it('impede excluir importacao concluida de forma incompleta antes da reversao', async () => {
    mockCatalogoPrisma.importacaoProduto.findFirst.mockResolvedValue({
      id: 71,
      situacao: 'CONCLUIDA_INCOMPLETA',
      asyncJobId: 301,
      asyncJob: null,
    } as any);

    await expect(service.removerImportacao(71, 99)).rejects.toThrow(
      'IMPORTACAO_EXCLUSAO_REQUER_REVERSAO'
    );
    expect(mockCatalogoPrisma.importacaoProduto.delete).not.toHaveBeenCalled();
  });

  it('limpa do historico apenas importacoes concluidas ou revertidas', async () => {
    mockCatalogoPrisma.importacaoProduto.findMany.mockResolvedValue([
      {
        id: 80,
        situacao: 'CONCLUIDA',
        asyncJobId: 400,
        asyncJob: { arquivo: null },
      },
      {
        id: 81,
        situacao: 'REVERTIDA',
        asyncJobId: null,
        asyncJob: null,
      },
    ] as any);

    await service.limparHistorico(99);

    expect(mockCatalogoPrisma.importacaoProduto.findMany).toHaveBeenCalledWith({
      where: {
        superUserId: 99,
        situacao: {
          in: ['CONCLUIDA', 'REVERTIDA'],
        },
      },
      select: {
        id: true,
        situacao: true,
        asyncJobId: true,
        asyncJob: {
          select: {
            arquivo: {
              select: {
                storagePath: true,
              },
            },
          },
        },
      },
    });
    expect(mockCatalogoPrisma.importacaoProduto.delete).toHaveBeenNthCalledWith(1, {
      where: { id: 80 },
    });
    expect(mockCatalogoPrisma.importacaoProduto.delete).toHaveBeenNthCalledWith(2, {
      where: { id: 81 },
    });
  });
});
