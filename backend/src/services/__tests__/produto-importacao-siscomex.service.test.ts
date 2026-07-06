import { ProdutoImportacaoService } from '../produto-importacao.service';
import { serializarBundleSiscomexArquivo } from '../produto-importacao-siscomex-arquivo.service';

const mockCatalogoPrisma = {
  catalogo: { findFirst: jest.fn() },
  importacaoProduto: { update: jest.fn() },
  importacaoProdutoItem: { findMany: jest.fn() },
  mensagem: { create: jest.fn() },
} as any;

jest.mock('../../utils/prisma', () => ({
  get catalogoPrisma() {
    return mockCatalogoPrisma;
  },
}));

describe('ProdutoImportacaoService - SISCOMEX por arquivo', () => {
  let service: ProdutoImportacaoService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalogoPrisma.catalogo.findFirst.mockResolvedValue({
      id: 1,
      nome: 'Catalogo Teste',
      numero: 123,
      cpf_cnpj: '00000000000000',
    });
    mockCatalogoPrisma.importacaoProduto.update.mockResolvedValue(undefined);
    mockCatalogoPrisma.importacaoProdutoItem.findMany.mockResolvedValue([]);
    mockCatalogoPrisma.mensagem.create.mockResolvedValue(undefined);
    service = new ProdutoImportacaoService();
  });

  it('preserva totais parciais quando o processamento falha apos persistir itens', async () => {
    const bundleBase64 = serializarBundleSiscomexArquivo({
      origem: 'SISCOMEX_ARQUIVO',
      arquivos: {
        produtos: {
          nome: 'produtos.json',
          conteudoBase64: Buffer.from('[]').toString('base64'),
        },
      },
    });

    mockCatalogoPrisma.importacaoProdutoItem.findMany.mockResolvedValue([
      { resultado: 'SUCESSO', produtoId: 100 },
      { resultado: 'ATENCAO', produtoId: null },
      { resultado: 'ATENCAO', produtoId: 101 },
      { resultado: 'ERRO', produtoId: null },
    ]);

    jest
      .spyOn((service as any).siscomexArquivoService, 'processar')
      .mockRejectedValue(new Error('Falha ao sincronizar NCM'));

    await expect(
      service.processarImportacaoJob({
        importacaoId: 14,
        superUserId: 99,
        usuarioCatalogoId: 10,
        catalogoId: 1,
        modalidade: 'IMPORTACAO',
        origem: 'SISCOMEX_ARQUIVO',
        arquivo: {
          nome: 'siscomex-importacao-arquivo.json',
          conteudoBase64: bundleBase64,
        },
      })
    ).rejects.toThrow('Falha ao sincronizar NCM');

    expect(mockCatalogoPrisma.importacaoProduto.update).toHaveBeenCalledWith({
      where: { id: 14 },
      data: expect.objectContaining({
        situacao: 'CONCLUIDA_INCOMPLETA',
        resultado: 'ATENCAO',
        totalRegistros: 4,
        totalCriados: 2,
        totalComAtencao: 2,
        totalComErro: 1,
      }),
    });

    expect(mockCatalogoPrisma.mensagem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          texto: expect.stringContaining('Registros analisados: 4'),
        }),
      })
    );
  });
});
