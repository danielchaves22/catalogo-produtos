import { AsyncJobStatus } from '@prisma/client';
import { exportacaoFabricanteJobHandler } from '../exportacao-fabricante.handler';
import { atualizarArquivoJob, registerJobLog } from '../../async-job.repository';
import { storageFactory } from '../../../services/storage.factory';

jest.mock('../../async-job.repository', () => ({
  atualizarArquivoJob: jest.fn(),
  registerJobLog: jest.fn(),
}));

jest.mock('../../../services/storage.factory', () => {
  const storageMock = { upload: jest.fn(), getSignedUrl: jest.fn() };
  const storageFactory = jest.fn(() => storageMock);
  (storageFactory as any).__mock = storageMock;
  return { storageFactory };
});

jest.mock('../../../services/produto-exportacao.service', () => {
  const serviceMock = {
    obterExportacaoPorId: jest.fn(),
    resolverIdsSelecionados: jest.fn(),
    buscarFabricantesVinculados: jest.fn(),
    transformarFabricantesParaSiscomex: jest.fn(),
    atualizarMetadadosArquivo: jest.fn(),
  };

  const ProdutoExportacaoService = jest.fn(() => serviceMock);
  (ProdutoExportacaoService as any).__mock = serviceMock;

  return {
    ProdutoExportacaoService,
  };
});

const storageMock = (storageFactory as jest.Mock & { __mock: { upload: jest.Mock; getSignedUrl: jest.Mock } }).__mock;
const ProdutoExportacaoServiceMock = jest.requireMock('../../../services/produto-exportacao.service')
  .ProdutoExportacaoService as jest.Mock & {
  __mock: {
    obterExportacaoPorId: jest.Mock;
    resolverIdsSelecionados: jest.Mock;
    buscarFabricantesVinculados: jest.Mock;
    transformarFabricantesParaSiscomex: jest.Mock;
    atualizarMetadadosArquivo: jest.Mock;
  };
};
const produtoExportacaoServiceMock = ProdutoExportacaoServiceMock.__mock;

describe('exportacaoFabricanteJobHandler', () => {
  const heartbeat = jest.fn();
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    jest.clearAllMocks();
    storageMock.upload.mockReset();
    storageMock.getSignedUrl.mockReset();
    (storageFactory as jest.Mock).mockReturnValue(storageMock);
    produtoExportacaoServiceMock.obterExportacaoPorId.mockReset();
    produtoExportacaoServiceMock.resolverIdsSelecionados.mockReset();
    produtoExportacaoServiceMock.buscarFabricantesVinculados.mockReset();
    produtoExportacaoServiceMock.transformarFabricantesParaSiscomex.mockReset();
    produtoExportacaoServiceMock.atualizarMetadadosArquivo.mockReset();
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  it('gera arquivo de fabricantes e atualiza metadados', async () => {
    produtoExportacaoServiceMock.obterExportacaoPorId.mockResolvedValue({
      id: 71,
      superUserId: 99,
      arquivoNome: 'fabricantes.json',
    });
    produtoExportacaoServiceMock.resolverIdsSelecionados.mockResolvedValue([10, 11]);
    produtoExportacaoServiceMock.buscarFabricantesVinculados.mockResolvedValue([{ id: 1 }]);
    produtoExportacaoServiceMock.transformarFabricantesParaSiscomex.mockReturnValue([{ id: 1 }]);
    storageMock.upload.mockResolvedValue(undefined);

    await exportacaoFabricanteJobHandler({
      job: { id: 321 } as any,
      payload: { exportacaoId: 71, superUserId: 99 },
      heartbeat,
    });

    expect(produtoExportacaoServiceMock.obterExportacaoPorId).toHaveBeenCalledWith(71);
    expect(produtoExportacaoServiceMock.resolverIdsSelecionados).toHaveBeenCalledWith(
      expect.objectContaining({ id: 71 }),
      99
    );
    expect(produtoExportacaoServiceMock.buscarFabricantesVinculados).toHaveBeenCalledWith([10, 11], 99);
    expect(produtoExportacaoServiceMock.transformarFabricantesParaSiscomex).toHaveBeenCalledWith([{ id: 1 }]);

    expect(storageFactory).toHaveBeenCalled();
    expect(storageMock.upload).toHaveBeenCalledWith(expect.any(Buffer), '99/exportacoes/321/1700000000000.json');

    expect(atualizarArquivoJob).toHaveBeenCalledWith(321, {
      nome: 'fabricantes.json',
      conteudoBase64: null,
      storagePath: '99/exportacoes/321/1700000000000.json',
      storageProvider: 's3',
      expiraEm: expect.any(Date),
    });

    expect(produtoExportacaoServiceMock.atualizarMetadadosArquivo).toHaveBeenCalledWith(71, {
      arquivoPath: '99/exportacoes/321/1700000000000.json',
      arquivoExpiraEm: expect.any(Date),
      arquivoTamanho: expect.any(Number),
      totalItens: 1,
    });

    expect(registerJobLog).toHaveBeenCalledWith(
      321,
      AsyncJobStatus.PROCESSANDO,
      expect.stringContaining('Exportação de fabricantes gerada com 1 item(ns)')
    );
    expect(heartbeat).toHaveBeenCalled();
  });

  it('lança erro quando exportação não é encontrada', async () => {
    produtoExportacaoServiceMock.obterExportacaoPorId.mockResolvedValue(null);

    await expect(
      exportacaoFabricanteJobHandler({
        job: { id: 33 } as any,
        payload: { exportacaoId: 999, superUserId: 1 },
        heartbeat,
      })
    ).rejects.toThrow('Registro de exportação de fabricantes não encontrado.');
  });
});
