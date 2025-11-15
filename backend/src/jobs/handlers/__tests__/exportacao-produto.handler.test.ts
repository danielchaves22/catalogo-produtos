import { AsyncJobStatus } from '@prisma/client'
import { exportacaoProdutoJobHandler } from '../exportacao-produto.handler'
import { atualizarArquivoJob, registerJobLog } from '../../async-job.repository'
import { storageFactory } from '../../../services/storage.factory'

jest.mock('../../async-job.repository', () => ({
  atualizarArquivoJob: jest.fn(),
  registerJobLog: jest.fn(),
}))

jest.mock('../../../services/storage.factory', () => {
  const storageMock = { upload: jest.fn(), getSignedUrl: jest.fn() }
  const storageFactory = jest.fn(() => storageMock)
  ;(storageFactory as any).__mock = storageMock
  return { storageFactory }
})

jest.mock('../../../services/produto-exportacao.service', () => {
  const serviceMock = {
    obterExportacaoPorId: jest.fn(),
    resolverIdsSelecionados: jest.fn(),
    buscarProdutosComAtributos: jest.fn(),
    transformarParaSiscomex: jest.fn(),
    atualizarMetadadosArquivo: jest.fn(),
  }

  const ProdutoExportacaoService = jest.fn(() => serviceMock)
  ;(ProdutoExportacaoService as any).__mock = serviceMock

  return {
    ProdutoExportacaoService,
  }
})

const storageMock = (storageFactory as jest.Mock & { __mock: { upload: jest.Mock; getSignedUrl: jest.Mock } }).__mock
const ProdutoExportacaoServiceMock = jest.requireMock('../../../services/produto-exportacao.service')
  .ProdutoExportacaoService as jest.Mock & {
  __mock: {
    obterExportacaoPorId: jest.Mock
    resolverIdsSelecionados: jest.Mock
    buscarProdutosComAtributos: jest.Mock
    transformarParaSiscomex: jest.Mock
    atualizarMetadadosArquivo: jest.Mock
  }
}
const produtoExportacaoServiceMock = ProdutoExportacaoServiceMock.__mock

describe('exportacaoProdutoJobHandler', () => {
  const heartbeat = jest.fn()
  let dateNowSpy: jest.SpyInstance<number, []>

  beforeEach(() => {
    jest.clearAllMocks()
    storageMock.upload.mockReset()
    storageMock.getSignedUrl.mockReset()
    ;(storageFactory as jest.Mock).mockReturnValue(storageMock)
    produtoExportacaoServiceMock.obterExportacaoPorId.mockReset()
    produtoExportacaoServiceMock.resolverIdsSelecionados.mockReset()
    produtoExportacaoServiceMock.buscarProdutosComAtributos.mockReset()
    produtoExportacaoServiceMock.transformarParaSiscomex.mockReset()
    produtoExportacaoServiceMock.atualizarMetadadosArquivo.mockReset()
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
  })

  afterEach(() => {
    dateNowSpy.mockRestore()
  })

  it('gera arquivo no storage e atualiza metadados da exportação', async () => {
    produtoExportacaoServiceMock.obterExportacaoPorId.mockResolvedValue({
      id: 55,
      superUserId: 99,
      arquivoNome: 'produtos.json',
    })
    produtoExportacaoServiceMock.resolverIdsSelecionados.mockResolvedValue([1, 2])
    produtoExportacaoServiceMock.buscarProdutosComAtributos.mockResolvedValue([{ id: 1 }])
    produtoExportacaoServiceMock.transformarParaSiscomex.mockReturnValue([{ id: 1 }])
    storageMock.upload.mockResolvedValue(undefined)

    await exportacaoProdutoJobHandler({
      job: { id: 123 } as any,
      payload: { exportacaoId: 55, superUserId: 99 },
      heartbeat,
    })

    expect(produtoExportacaoServiceMock.obterExportacaoPorId).toHaveBeenCalledWith(55)
    expect(produtoExportacaoServiceMock.resolverIdsSelecionados).toHaveBeenCalledWith(
      expect.objectContaining({ id: 55 }),
      99
    )
    expect(produtoExportacaoServiceMock.buscarProdutosComAtributos).toHaveBeenCalledWith([1, 2], 99)
    expect(produtoExportacaoServiceMock.transformarParaSiscomex).toHaveBeenCalledWith([{ id: 1 }])

    expect(storageFactory).toHaveBeenCalled()
    expect(storageMock.upload).toHaveBeenCalledWith(expect.any(Buffer), '99/exportacoes/123/1700000000000.json')

    expect(atualizarArquivoJob).toHaveBeenCalledWith(123, {
      nome: 'produtos.json',
      conteudoBase64: null,
      storagePath: '99/exportacoes/123/1700000000000.json',
      storageProvider: 's3',
      expiraEm: expect.any(Date),
    })

    expect(produtoExportacaoServiceMock.atualizarMetadadosArquivo).toHaveBeenCalledWith(55, {
      arquivoPath: '99/exportacoes/123/1700000000000.json',
      arquivoExpiraEm: expect.any(Date),
      arquivoTamanho: expect.any(Number),
      totalItens: 1,
    })

    expect(registerJobLog).toHaveBeenCalledWith(
      123,
      AsyncJobStatus.PROCESSANDO,
      expect.stringContaining('Exportação gerada com 1 item(ns)')
    )
    expect(heartbeat).toHaveBeenCalled()
  })

  it('lança erro quando exportação não é encontrada', async () => {
    produtoExportacaoServiceMock.obterExportacaoPorId.mockResolvedValue(null)

    await expect(
      exportacaoProdutoJobHandler({
        job: { id: 10 } as any,
        payload: { exportacaoId: 999, superUserId: 1 },
        heartbeat,
      })
    ).rejects.toThrow('Registro de exportação de produtos não encontrado.')
  })
})
