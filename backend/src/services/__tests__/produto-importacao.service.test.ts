import { ProdutoImportacaoService } from '../produto-importacao.service';
import { enqueueProdutoImportacaoJob } from '../../jobs/produto-importacao.job';
import { ProdutoService } from '../produto.service';

jest.mock('../../jobs/produto-importacao.job', () => ({
  enqueueProdutoImportacaoJob: jest.fn().mockResolvedValue(undefined),
  registerProdutoImportacaoProcessor: jest.fn(),
}));

const mockCatalogoPrisma = {
  catalogo: { findFirst: jest.fn() },
  usuarioCatalogo: { findFirst: jest.fn() },
  importacaoProduto: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  importacaoProdutoItem: { create: jest.fn(), updateMany: jest.fn() },
  produtoAtributos: { deleteMany: jest.fn() },
  produto: { deleteMany: jest.fn() },
  ncmCache: { findUnique: jest.fn() },
  mensagem: { create: jest.fn() },
  $transaction: jest.fn(),
} as any;

jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: mockCatalogoPrisma,
}));

const mockNcmLegacyService = {
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
    expect(enqueueProdutoImportacaoJob).toHaveBeenCalledWith(
      expect.objectContaining({ importacaoId: 55, catalogoId: 1, superUserId: 99 })
    );
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
    mockCatalogoPrisma.importacaoProdutoItem.create.mockResolvedValue(undefined);
    mockCatalogoPrisma.importacaoProduto.update.mockResolvedValue(undefined);
    mockCatalogoPrisma.mensagem.create.mockResolvedValue(undefined);

    jest
      .spyOn(ProdutoService.prototype, 'criar')
      .mockResolvedValue({ id: 999 } as any);
    jest
      .spyOn<any, any>(service as any, 'lerPlanilha')
      .mockResolvedValue([
        ['NCM', 'Nome', 'Codigos'],
        ['12345678', 'Produto Teste', '123'],
      ]);

    await service.processarImportacaoJob({
      importacaoId: 88,
      superUserId: 99,
      usuarioCatalogoId: 10,
      catalogoId: 1,
      modalidade: 'IMPORTACAO',
      arquivo: { nome: 'produtos.xlsx', conteudoBase64: arquivoBase64 },
    });

    expect(mockCatalogoPrisma.importacaoProdutoItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ importacaoId: 88, linhaPlanilha: 2 })
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
      expect.objectContaining({ superUserId: 99 })
    );
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
    mockCatalogoPrisma.importacaoProdutoItem.create.mockResolvedValue(undefined);
    mockCatalogoPrisma.importacaoProduto.update.mockResolvedValue(undefined);
    mockCatalogoPrisma.mensagem.create.mockResolvedValue(undefined);

    mockNcmLegacyService.sincronizarNcm.mockResolvedValue({
      descricao: 'Teste',
      unidadeMedida: 'KG',
    });

    const criarProdutoSpy = jest
      .spyOn(ProdutoService.prototype, 'criar')
      .mockResolvedValue({ id: 123 } as any);

    jest
      .spyOn<any, any>(service as any, 'lerPlanilha')
      .mockResolvedValue([
        ['NCM', 'Nome', 'Codigos'],
        ['87654321', 'Produto Teste', '123'],
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
    expect(criarProdutoSpy).toHaveBeenCalled();
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
    mockCatalogoPrisma.produtoAtributos.deleteMany.mockResolvedValue({ count: 2 });
    mockCatalogoPrisma.produto.deleteMany.mockResolvedValue({ count: 2 });
    mockCatalogoPrisma.importacaoProduto.update.mockResolvedValue({});

    await service.reverterImportacao(77, 99);

    expect(mockCatalogoPrisma.importacaoProdutoItem.updateMany).toHaveBeenCalledWith({
      where: { importacaoId: 77, produtoId: { in: [201, 202] } },
      data: { produtoId: null },
    });
    expect(mockCatalogoPrisma.produtoAtributos.deleteMany).toHaveBeenCalledWith({
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
});
