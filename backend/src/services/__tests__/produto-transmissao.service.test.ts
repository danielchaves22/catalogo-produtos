import {
  AsyncJobStatus,
  ProdutoTransmissaoItemOperacao,
  ProdutoTransmissaoItemStatus,
  ProdutoTransmissaoStatus,
} from '@prisma/client'
import { ProdutoTransmissaoService } from '../produto-transmissao.service'
import { createAsyncJob, registerJobLog } from '../../jobs/async-job.repository'
import { storageFactory } from '../storage.factory'

jest.mock('../../jobs/async-job.repository', () => ({
  createAsyncJob: jest.fn(),
  registerJobLog: jest.fn(),
}))

jest.mock('../storage.factory', () => {
  const storageMock = { upload: jest.fn(), getSignedUrl: undefined }
  const storageFactory = jest.fn(() => storageMock)
  ;(storageFactory as any).__mock = storageMock
  return { storageFactory }
})

type MockTransmissao = {
  id: number
  superUserId: number
  catalogoId: number
  usuarioCatalogoId: number | null
  asyncJobId: number | null
  modalidade: 'PRODUTOS'
  status: ProdutoTransmissaoStatus
  totalItens: number
  totalSucesso: number
  totalErro: number
  selecaoJson: number[]
  payloadEnvioPath: string | null
  payloadEnvioExpiraEm: Date | null
  payloadEnvioTamanho: number | null
  payloadEnvioProvider: string | null
  payloadRetornoPath: string | null
  payloadRetornoExpiraEm: Date | null
  payloadRetornoTamanho: number | null
  payloadRetornoProvider: string | null
  iniciadoEm: Date | null
  concluidoEm: Date | null
  criadoEm: Date
}

type MockItem = {
  id: number
  transmissaoId: number
  produtoId: number
  operacao: ProdutoTransmissaoItemOperacao
  status: ProdutoTransmissaoItemStatus
  mensagem: string | null
  retornoCodigo: string | null
  retornoVersao: number | null
  retornoSituacao: string | null
  criadoEm: Date
  atualizadoEm: Date
}

const state = {
  catalogos: new Map<number, any>(),
  itens: [] as MockItem[],
  nextItemId: 1,
  nextTransmissaoId: 1,
  produtos: new Map<number, any>(),
  transmissoes: [] as MockTransmissao[],
}

function resetState() {
  state.catalogos.clear()
  state.itens = []
  state.nextItemId = 1
  state.nextTransmissaoId = 1
  state.produtos.clear()
  state.transmissoes = []
}

function aplicarData(target: Record<string, any>, data: Record<string, any>) {
  Object.entries(data).forEach(([chave, valor]) => {
    target[chave] = valor
  })
  target.atualizadoEm = new Date()
}

function clonarItem(item: MockItem) {
  return { ...item }
}

function clonarTransmissao(transmissao: MockTransmissao) {
  return { ...transmissao }
}

function localizarTransmissao(id: number) {
  return state.transmissoes.find(item => item.id === id) ?? null
}

function localizarCatalogo(id: number) {
  return state.catalogos.get(id) ?? null
}

function localizarProduto(id: number) {
  return state.produtos.get(id) ?? null
}

function montarItensTransmissao(transmissaoId: number, includeProduto = false) {
  return state.itens
    .filter(item => item.transmissaoId === transmissaoId)
    .sort((a, b) => a.id - b.id)
    .map(item => ({
      ...clonarItem(item),
      ...(includeProduto
        ? {
            produto: localizarProduto(item.produtoId)
              ? {
                  id: item.produtoId,
                  codigo: localizarProduto(item.produtoId)?.codigo ?? null,
                  denominacao: localizarProduto(item.produtoId)?.denominacao ?? null,
                }
              : null,
          }
        : {}),
    }))
}

function selecionarCampos<T extends Record<string, any>>(origem: T, select?: Record<string, boolean>) {
  if (!select) {
    return origem
  }

  const parcial: Record<string, any> = {}
  Object.entries(select).forEach(([campo, ativo]) => {
    if (ativo) {
      parcial[campo] = origem[campo]
    }
  })

  return parcial
}

jest.mock('../../utils/prisma', () => {
  const catalogoPrisma: any = {
    produtoTransmissao: {
      create: jest.fn(async ({ data }) => {
        const transmissao: MockTransmissao = {
          id: state.nextTransmissaoId++,
          superUserId: data.superUserId,
          catalogoId: data.catalogoId,
          usuarioCatalogoId: data.usuarioCatalogoId ?? null,
          asyncJobId: data.asyncJobId ?? null,
          modalidade: data.modalidade,
          status: data.status,
          totalItens: data.totalItens,
          totalSucesso: data.totalSucesso ?? 0,
          totalErro: data.totalErro ?? 0,
          selecaoJson: data.selecaoJson ?? [],
          payloadEnvioPath: null,
          payloadEnvioExpiraEm: null,
          payloadEnvioTamanho: null,
          payloadEnvioProvider: null,
          payloadRetornoPath: null,
          payloadRetornoExpiraEm: null,
          payloadRetornoTamanho: null,
          payloadRetornoProvider: null,
          iniciadoEm: null,
          concluidoEm: null,
          criadoEm: new Date(),
        }
        state.transmissoes.push(transmissao)
        return clonarTransmissao(transmissao)
      }),
      findFirst: jest.fn(async ({ where, include }) => {
        const transmissao =
          state.transmissoes.find(item => {
            if (where?.id !== undefined && item.id !== where.id) return false
            if (where?.superUserId !== undefined && item.superUserId !== where.superUserId) return false
            if (where?.catalogoId !== undefined && item.catalogoId !== where.catalogoId) return false
            if (where?.status?.in && !where.status.in.includes(item.status)) return false
            return true
          }) ?? null

        if (!transmissao) return null

        return {
          ...clonarTransmissao(transmissao),
          ...(include?.catalogo ? { catalogo: localizarCatalogo(transmissao.catalogoId) } : {}),
          ...(include?.itens
            ? {
                itens: montarItensTransmissao(
                  transmissao.id,
                  Boolean(include?.itens?.include?.produto)
                ),
              }
            : {}),
        }
      }),
      findMany: jest.fn(async ({ where }) => {
        return state.transmissoes
          .filter(item => (where?.superUserId ? item.superUserId === where.superUserId : true))
          .sort((a, b) => b.id - a.id)
          .map(item => ({
            ...clonarTransmissao(item),
            catalogo: {
              id: item.catalogoId,
              nome: localizarCatalogo(item.catalogoId)?.nome ?? 'Catálogo',
              numero: localizarCatalogo(item.catalogoId)?.numero ?? null,
            },
          }))
      }),
      findUnique: jest.fn(async ({ where, include, select }) => {
        const transmissao = localizarTransmissao(where.id)
        if (!transmissao) return null

        if (select) {
          return selecionarCampos(clonarTransmissao(transmissao), select)
        }

        const resposta: Record<string, any> = clonarTransmissao(transmissao)
        if (include?.catalogo) {
          resposta.catalogo = localizarCatalogo(transmissao.catalogoId)
        }
        if (include?.itens) {
          resposta.itens = montarItensTransmissao(transmissao.id, Boolean(include.itens.include?.produto))
        }
        return resposta
      }),
      update: jest.fn(async ({ where, data }) => {
        const transmissao = localizarTransmissao(where.id)
        if (!transmissao) throw new Error('Transmissão não encontrada')
        aplicarData(transmissao as any, data)
        return clonarTransmissao(transmissao)
      }),
    },
    produtoTransmissaoItem: {
      count: jest.fn(async ({ where }) => {
        return state.itens.filter(item => {
          if (where?.transmissaoId !== undefined && item.transmissaoId !== where.transmissaoId) return false
          if (where?.status !== undefined && item.status !== where.status) return false
          return true
        }).length
      }),
      createMany: jest.fn(async ({ data }) => {
        data.forEach((item: any) => {
          state.itens.push({
            id: state.nextItemId++,
            transmissaoId: item.transmissaoId,
            produtoId: item.produtoId,
            operacao: item.operacao,
            status: item.status,
            mensagem: null,
            retornoCodigo: null,
            retornoVersao: null,
            retornoSituacao: null,
            criadoEm: new Date(),
            atualizadoEm: new Date(),
          })
        })
        return { count: data.length }
      }),
      findMany: jest.fn(async ({ where }) => {
        return montarItensTransmissao(where.transmissaoId, false)
      }),
      update: jest.fn(async ({ where, data }) => {
        const item = state.itens.find(registro => registro.id === where.id)
        if (!item) throw new Error('Item não encontrado')
        aplicarData(item as any, data)
        return clonarItem(item)
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const itens = state.itens.filter(item => {
          if (where?.transmissaoId !== undefined && item.transmissaoId !== where.transmissaoId) return false
          if (where?.id !== undefined && item.id !== where.id) return false
          if (where?.produtoId !== undefined && item.produtoId !== where.produtoId) return false
          if (where?.status?.in && !where.status.in.includes(item.status)) return false
          return true
        })
        itens.forEach(item => aplicarData(item as any, data))
        return { count: itens.length }
      }),
      delete: jest.fn(async ({ where }) => {
        const indice = state.itens.findIndex(item => item.id === where.id)
        if (indice < 0) throw new Error('Item nÃ£o encontrado')
        const [removido] = state.itens.splice(indice, 1)
        return clonarItem(removido)
      }),
    },
    $transaction: jest.fn(async (callback: any): Promise<any> => callback(catalogoPrisma)),
  }

  return { catalogoPrisma }
})

const { catalogoPrisma } = jest.requireMock('../../utils/prisma') as { catalogoPrisma: any }
const storageMock = (storageFactory as jest.Mock & { __mock: { upload: jest.Mock } }).__mock

function criarErroSiscomex(message: string, status?: number) {
  const erro = new Error(message) as Error & { siscomexDetalhes?: { status?: number } }
  erro.siscomexDetalhes = { status }
  return erro
}

describe('ProdutoTransmissaoService', () => {
  const exportacaoServiceMock = {
    buscarProdutosComAtributos: jest.fn(),
    transformarParaSiscomex: jest.fn(),
  }

  const produtoServiceMock = {
    marcarComoTransmitido: jest.fn(),
  }

  const certificadoServiceMock = {
    obterParaCatalogo: jest.fn(),
  }

  const catalogoServiceMock = {
    buscarPorId: jest.fn(),
  }

  const siscomexClientMock = {
    atualizarProduto: jest.fn(),
    incluirProduto: jest.fn(),
  }

  let service: ProdutoTransmissaoService

  beforeEach(() => {
    jest.clearAllMocks()
    resetState()
    state.catalogos.set(5, { id: 5, cpf_cnpj: '12.345.678/0001-99', nome: 'Catálogo Teste', numero: 900 })
    ;(createAsyncJob as jest.Mock).mockResolvedValue({ id: 700 })
    produtoServiceMock.marcarComoTransmitido.mockResolvedValue(undefined)
    catalogoServiceMock.buscarPorId.mockResolvedValue(localizarCatalogo(5))
    storageMock.upload.mockResolvedValue(undefined)
    service = new ProdutoTransmissaoService(
      exportacaoServiceMock as any,
      produtoServiceMock as any,
      certificadoServiceMock as any,
      catalogoServiceMock as any
    )
    jest.spyOn(service as any, 'obterClienteSiscomex').mockResolvedValue(siscomexClientMock as any)
    jest.spyOn(service as any, 'esperarComHeartbeat').mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('agenda transmissão mista criando itens com operações individuais', async () => {
    exportacaoServiceMock.buscarProdutosComAtributos.mockResolvedValue([
      { id: 1, status: 'APROVADO', situacao: 'RASCUNHO', codigo: null },
      { id: 2, status: 'APROVADO', situacao: 'ATIVADO', codigo: 'COD-2' },
    ])

    const resultado = await service.solicitarTransmissao([1, 2], 5, 99, null, { forcarAtualizacaoVersao: true })

    expect(resultado).toEqual({ transmissaoId: 1, jobId: 700 })
    expect(state.itens).toHaveLength(2)
    expect(state.itens.map(item => ({ produtoId: item.produtoId, operacao: item.operacao }))).toEqual([
      { produtoId: 1, operacao: ProdutoTransmissaoItemOperacao.INCLUSAO },
      { produtoId: 2, operacao: ProdutoTransmissaoItemOperacao.NOVA_VERSAO },
    ])
    expect(createAsyncJob).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'TRANSMISSAO_PRODUTO',
        payload: { transmissaoId: 1, superUserId: 99 },
      }),
      catalogoPrisma
    )
  })

  it('rejeita produto ativado sem código SISCOMEX válido', async () => {
    exportacaoServiceMock.buscarProdutosComAtributos.mockResolvedValue([
      { id: 2, status: 'APROVADO', situacao: 'ATIVADO', codigo: null },
    ])

    await expect(service.solicitarTransmissao([2], 5, 99)).rejects.toMatchObject({
      details: expect.arrayContaining([
        expect.objectContaining({
          field: 'produtos',
          message: expect.stringContaining('ATIVADO exigem código SISCOMEX válido'),
        }),
      ]),
    })
  })

  it('processa transmissão mista com inclusão e nova versão em sequência', async () => {
    state.produtos.set(1, { id: 1, codigo: null, denominacao: 'Produto 1' })
    state.produtos.set(2, { id: 2, codigo: 'COD-2', denominacao: 'Produto 2' })
    state.transmissoes.push({
      id: 1,
      superUserId: 99,
      catalogoId: 5,
      usuarioCatalogoId: null,
      asyncJobId: 700,
      modalidade: 'PRODUTOS',
      status: ProdutoTransmissaoStatus.EM_FILA,
      totalItens: 2,
      totalSucesso: 0,
      totalErro: 0,
      selecaoJson: [1, 2],
      payloadEnvioPath: null,
      payloadEnvioExpiraEm: null,
      payloadEnvioTamanho: null,
      payloadEnvioProvider: null,
      payloadRetornoPath: null,
      payloadRetornoExpiraEm: null,
      payloadRetornoTamanho: null,
      payloadRetornoProvider: null,
      iniciadoEm: null,
      concluidoEm: null,
      criadoEm: new Date(),
    })
    state.itens.push(
      {
        id: 11,
        transmissaoId: 1,
        produtoId: 1,
        operacao: ProdutoTransmissaoItemOperacao.INCLUSAO,
        status: ProdutoTransmissaoItemStatus.PENDENTE,
        mensagem: null,
        retornoCodigo: null,
        retornoVersao: null,
        retornoSituacao: null,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      },
      {
        id: 12,
        transmissaoId: 1,
        produtoId: 2,
        operacao: ProdutoTransmissaoItemOperacao.NOVA_VERSAO,
        status: ProdutoTransmissaoItemStatus.PENDENTE,
        mensagem: null,
        retornoCodigo: null,
        retornoVersao: null,
        retornoSituacao: null,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      }
    )
    exportacaoServiceMock.buscarProdutosComAtributos.mockResolvedValue([
      { id: 1, status: 'APROVADO', situacao: 'RASCUNHO', codigo: null },
      { id: 2, status: 'APROVADO', situacao: 'ATIVADO', codigo: 'COD-2' },
    ])
    exportacaoServiceMock.transformarParaSiscomex.mockReturnValue([
      { seq: 1, codigo: null, descricao: 'Produto 1', denominacao: 'Produto 1', modalidade: 'IMPORTACAO', ncm: '01010101', atributos: [], atributosMultivalorados: [], atributosCompostos: [], atributosCompostosMultivalorados: [], codigosInterno: [] },
      { seq: 2, codigo: 'COD-2', descricao: 'Produto 2', denominacao: 'Produto 2', modalidade: 'IMPORTACAO', ncm: '02020202', atributos: [], atributosMultivalorados: [], atributosCompostos: [], atributosCompostosMultivalorados: [], codigosInterno: [] },
    ])
    siscomexClientMock.incluirProduto.mockResolvedValue({ codigo: 'NOVO-1', versao: 1, situacao: 'ATIVADO' })
    siscomexClientMock.atualizarProduto.mockResolvedValue({ versao: 4, situacao: 'ATIVADO' })

    await service.processarTransmissaoJob(1, 99, jest.fn(), 700)

    expect(siscomexClientMock.incluirProduto).toHaveBeenCalledTimes(1)
    expect(siscomexClientMock.atualizarProduto).toHaveBeenCalledTimes(1)
    expect(produtoServiceMock.marcarComoTransmitido).toHaveBeenNthCalledWith(
      1,
      1,
      99,
      expect.objectContaining({ codigo: 'NOVO-1', versao: 1, atualizarCodigo: true })
    )
    expect(produtoServiceMock.marcarComoTransmitido).toHaveBeenNthCalledWith(
      2,
      2,
      99,
      expect.objectContaining({ codigo: 'COD-2', versao: 4, atualizarCodigo: false })
    )
    expect(state.itens.map(item => item.status)).toEqual([
      ProdutoTransmissaoItemStatus.SUCESSO,
      ProdutoTransmissaoItemStatus.SUCESSO,
    ])
    expect(localizarTransmissao(1)).toMatchObject({
      status: ProdutoTransmissaoStatus.CONCLUIDO,
      totalSucesso: 2,
      totalErro: 0,
    })
    expect(storageMock.upload).toHaveBeenCalledTimes(2)
  })

  it('faz retry em erro técnico e conclui com sucesso', async () => {
    state.produtos.set(1, { id: 1, codigo: null, denominacao: 'Produto 1' })
    state.transmissoes.push({
      id: 1,
      superUserId: 99,
      catalogoId: 5,
      usuarioCatalogoId: null,
      asyncJobId: 700,
      modalidade: 'PRODUTOS',
      status: ProdutoTransmissaoStatus.EM_FILA,
      totalItens: 1,
      totalSucesso: 0,
      totalErro: 0,
      selecaoJson: [1],
      payloadEnvioPath: null,
      payloadEnvioExpiraEm: null,
      payloadEnvioTamanho: null,
      payloadEnvioProvider: null,
      payloadRetornoPath: null,
      payloadRetornoExpiraEm: null,
      payloadRetornoTamanho: null,
      payloadRetornoProvider: null,
      iniciadoEm: null,
      concluidoEm: null,
      criadoEm: new Date(),
    })
    state.itens.push({
      id: 11,
      transmissaoId: 1,
      produtoId: 1,
      operacao: ProdutoTransmissaoItemOperacao.INCLUSAO,
      status: ProdutoTransmissaoItemStatus.PENDENTE,
      mensagem: null,
      retornoCodigo: null,
      retornoVersao: null,
      retornoSituacao: null,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    })
    exportacaoServiceMock.buscarProdutosComAtributos.mockResolvedValue([
      { id: 1, status: 'APROVADO', situacao: 'RASCUNHO', codigo: null },
    ])
    exportacaoServiceMock.transformarParaSiscomex.mockReturnValue([
      { seq: 1, codigo: null, descricao: 'Produto 1', denominacao: 'Produto 1', modalidade: 'IMPORTACAO', ncm: '01010101', atributos: [], atributosMultivalorados: [], atributosCompostos: [], atributosCompostosMultivalorados: [], codigosInterno: [] },
    ])
    siscomexClientMock.incluirProduto
      .mockRejectedValueOnce(criarErroSiscomex('timeout na chamada', 503))
      .mockResolvedValueOnce({ codigo: 'NOVO-1', versao: 1, situacao: 'ATIVADO' })

    await service.processarTransmissaoJob(1, 99, jest.fn(), 700)

    expect(siscomexClientMock.incluirProduto).toHaveBeenCalledTimes(2)
    expect(registerJobLog).toHaveBeenCalledWith(
      700,
      AsyncJobStatus.PROCESSANDO,
      expect.stringContaining('Retry do produto 1')
    )
    expect(localizarTransmissao(1)?.status).toBe(ProdutoTransmissaoStatus.CONCLUIDO)
  })

  it('interrompe a fila em erro persistente de autenticação e marca pendentes como erro', async () => {
    state.produtos.set(1, { id: 1, codigo: null, denominacao: 'Produto 1' })
    state.produtos.set(2, { id: 2, codigo: null, denominacao: 'Produto 2' })
    state.transmissoes.push({
      id: 1,
      superUserId: 99,
      catalogoId: 5,
      usuarioCatalogoId: null,
      asyncJobId: 700,
      modalidade: 'PRODUTOS',
      status: ProdutoTransmissaoStatus.EM_FILA,
      totalItens: 2,
      totalSucesso: 0,
      totalErro: 0,
      selecaoJson: [1, 2],
      payloadEnvioPath: null,
      payloadEnvioExpiraEm: null,
      payloadEnvioTamanho: null,
      payloadEnvioProvider: null,
      payloadRetornoPath: null,
      payloadRetornoExpiraEm: null,
      payloadRetornoTamanho: null,
      payloadRetornoProvider: null,
      iniciadoEm: null,
      concluidoEm: null,
      criadoEm: new Date(),
    })
    state.itens.push(
      {
        id: 11,
        transmissaoId: 1,
        produtoId: 1,
        operacao: ProdutoTransmissaoItemOperacao.INCLUSAO,
        status: ProdutoTransmissaoItemStatus.PENDENTE,
        mensagem: null,
        retornoCodigo: null,
        retornoVersao: null,
        retornoSituacao: null,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      },
      {
        id: 12,
        transmissaoId: 1,
        produtoId: 2,
        operacao: ProdutoTransmissaoItemOperacao.INCLUSAO,
        status: ProdutoTransmissaoItemStatus.PENDENTE,
        mensagem: null,
        retornoCodigo: null,
        retornoVersao: null,
        retornoSituacao: null,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      }
    )
    exportacaoServiceMock.buscarProdutosComAtributos.mockResolvedValue([
      { id: 1, status: 'APROVADO', situacao: 'RASCUNHO', codigo: null },
      { id: 2, status: 'APROVADO', situacao: 'RASCUNHO', codigo: null },
    ])
    exportacaoServiceMock.transformarParaSiscomex.mockReturnValue([
      { seq: 1, codigo: null, descricao: 'Produto 1', denominacao: 'Produto 1', modalidade: 'IMPORTACAO', ncm: '01010101', atributos: [], atributosMultivalorados: [], atributosCompostos: [], atributosCompostosMultivalorados: [], codigosInterno: [] },
      { seq: 2, codigo: null, descricao: 'Produto 2', denominacao: 'Produto 2', modalidade: 'IMPORTACAO', ncm: '02020202', atributos: [], atributosMultivalorados: [], atributosCompostos: [], atributosCompostosMultivalorados: [], codigosInterno: [] },
    ])
    siscomexClientMock.incluirProduto.mockRejectedValue(criarErroSiscomex('acesso negado', 403))

    await service.processarTransmissaoJob(1, 99, jest.fn(), 700)

    expect(siscomexClientMock.incluirProduto).toHaveBeenCalledTimes(1)
    expect(state.itens[0]).toMatchObject({
      status: ProdutoTransmissaoItemStatus.ERRO,
      mensagem: 'acesso negado',
    })
    expect(state.itens[1]).toMatchObject({
      status: ProdutoTransmissaoItemStatus.ERRO,
      mensagem: expect.stringContaining('Transmissão interrompida'),
    })
    expect(localizarTransmissao(1)).toMatchObject({
      status: ProdutoTransmissaoStatus.FALHO,
      totalSucesso: 0,
      totalErro: 2,
    })
  })

  it('prepara pre-transmissao sem criar job assincrono', async () => {
    exportacaoServiceMock.buscarProdutosComAtributos.mockResolvedValue([
      { id: 1, status: 'APROVADO', situacao: 'RASCUNHO', codigo: null },
      { id: 2, status: 'APROVADO', situacao: 'ATIVADO', codigo: 'COD-2' },
    ])

    const resultado = await service.prepararTransmissao([1, 2], 5, 99)

    expect(resultado).toEqual({ transmissaoId: 1 })
    expect(createAsyncJob).not.toHaveBeenCalled()
    expect(localizarTransmissao(1)).toMatchObject({
      status: ProdutoTransmissaoStatus.AGUARDANDO_CONFIRMACAO,
      totalItens: 2,
      totalSucesso: 0,
      totalErro: 0,
      selecaoJson: [1, 2],
    })
    expect(state.itens.map(item => ({ produtoId: item.produtoId, operacao: item.operacao }))).toEqual([
      { produtoId: 1, operacao: ProdutoTransmissaoItemOperacao.INCLUSAO },
      { produtoId: 2, operacao: ProdutoTransmissaoItemOperacao.NOVA_VERSAO },
    ])
  })

  it('inicia pre-transmissao persistida e cria job ao confirmar', async () => {
    exportacaoServiceMock.buscarProdutosComAtributos.mockResolvedValue([
      { id: 1, status: 'APROVADO', situacao: 'RASCUNHO', codigo: null },
      { id: 2, status: 'APROVADO', situacao: 'ATIVADO', codigo: 'COD-2' },
    ])

    const preparo = await service.prepararTransmissao([1, 2], 5, 99)
    ;(createAsyncJob as jest.Mock).mockClear()

    const resultado = await service.iniciarTransmissao(preparo.transmissaoId, 99)

    expect(resultado).toEqual({ transmissaoId: 1, jobId: 700 })
    expect(createAsyncJob).toHaveBeenCalledTimes(1)
    expect(localizarTransmissao(1)).toMatchObject({
      status: ProdutoTransmissaoStatus.EM_FILA,
      asyncJobId: 700,
      totalItens: 2,
      totalSucesso: 0,
      totalErro: 0,
      selecaoJson: [1, 2],
    })
    expect(state.itens.map(item => item.status)).toEqual([
      ProdutoTransmissaoItemStatus.PENDENTE,
      ProdutoTransmissaoItemStatus.PENDENTE,
    ])
  })

  it('remove item da pre-transmissao e recalcula totais', async () => {
    exportacaoServiceMock.buscarProdutosComAtributos.mockResolvedValue([
      { id: 1, status: 'APROVADO', situacao: 'RASCUNHO', codigo: null },
      { id: 2, status: 'APROVADO', situacao: 'ATIVADO', codigo: 'COD-2' },
    ])

    const preparo = await service.prepararTransmissao([1, 2], 5, 99)
    const itemId = state.itens[0]?.id

    const resultado = await service.removerItemPreTransmissao(preparo.transmissaoId, itemId, 99)

    expect(resultado).toEqual({ transmissaoId: 1, totalItens: 1 })
    expect(state.itens).toHaveLength(1)
    expect(localizarTransmissao(1)).toMatchObject({
      totalItens: 1,
      totalSucesso: 0,
      totalErro: 0,
      selecaoJson: [2],
    })
  })

  it('cancela pre-transmissao aguardando confirmacao', async () => {
    exportacaoServiceMock.buscarProdutosComAtributos.mockResolvedValue([
      { id: 1, status: 'APROVADO', situacao: 'RASCUNHO', codigo: null },
    ])

    const preparo = await service.prepararTransmissao([1], 5, 99)
    const resultado = await service.cancelarPreTransmissao(preparo.transmissaoId, 99)

    expect(resultado).toEqual({
      transmissaoId: 1,
      status: ProdutoTransmissaoStatus.CANCELADA,
    })
    expect(localizarTransmissao(1)).toMatchObject({
      status: ProdutoTransmissaoStatus.CANCELADA,
    })
    expect(localizarTransmissao(1)?.concluidoEm).toBeInstanceOf(Date)
  })

  it('permite criar mais de uma pre-transmissao aguardando confirmacao para o mesmo catalogo', async () => {
    state.transmissoes.push({
      id: 1,
      superUserId: 99,
      catalogoId: 5,
      usuarioCatalogoId: null,
      asyncJobId: null,
      modalidade: 'PRODUTOS',
      status: ProdutoTransmissaoStatus.AGUARDANDO_CONFIRMACAO,
      totalItens: 1,
      totalSucesso: 0,
      totalErro: 0,
      selecaoJson: [10],
      payloadEnvioPath: null,
      payloadEnvioExpiraEm: null,
      payloadEnvioTamanho: null,
      payloadEnvioProvider: null,
      payloadRetornoPath: null,
      payloadRetornoExpiraEm: null,
      payloadRetornoTamanho: null,
      payloadRetornoProvider: null,
      iniciadoEm: null,
      concluidoEm: null,
      criadoEm: new Date(),
    })
    state.nextTransmissaoId = 2
    exportacaoServiceMock.buscarProdutosComAtributos.mockResolvedValue([
      { id: 2, status: 'APROVADO', situacao: 'ATIVADO', codigo: 'COD-2' },
    ])

    const resultado = await service.prepararTransmissao([2], 5, 99)

    expect(resultado).toEqual({ transmissaoId: 2 })
    expect(state.transmissoes).toHaveLength(2)
    expect(localizarTransmissao(2)).toMatchObject({
      status: ProdutoTransmissaoStatus.AGUARDANDO_CONFIRMACAO,
      selecaoJson: [2],
    })
  })

  it('continua bloqueando nova preparacao quando ha transmissao em fila ou processando', async () => {
    state.transmissoes.push({
      id: 1,
      superUserId: 99,
      catalogoId: 5,
      usuarioCatalogoId: null,
      asyncJobId: 700,
      modalidade: 'PRODUTOS',
      status: ProdutoTransmissaoStatus.EM_FILA,
      totalItens: 1,
      totalSucesso: 0,
      totalErro: 0,
      selecaoJson: [10],
      payloadEnvioPath: null,
      payloadEnvioExpiraEm: null,
      payloadEnvioTamanho: null,
      payloadEnvioProvider: null,
      payloadRetornoPath: null,
      payloadRetornoExpiraEm: null,
      payloadRetornoTamanho: null,
      payloadRetornoProvider: null,
      iniciadoEm: null,
      concluidoEm: null,
      criadoEm: new Date(),
    })
    exportacaoServiceMock.buscarProdutosComAtributos.mockResolvedValue([
      { id: 2, status: 'APROVADO', situacao: 'RASCUNHO', codigo: null },
    ])

    await expect(service.prepararTransmissao([2], 5, 99)).rejects.toMatchObject({
      details: expect.arrayContaining([
        expect.objectContaining({
          field: 'catalogoId',
          message: expect.stringContaining('transmissão em andamento'),
        }),
      ]),
    })
  })
})
