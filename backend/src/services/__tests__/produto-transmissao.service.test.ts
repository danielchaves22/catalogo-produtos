import {
  AsyncJobStatus,
  ProdutoTransmissaoBlocoStatus,
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
  origemTipo?: 'MANUAL' | 'AJUSTE_ESTRUTURA'
  origemContextoJson?: Record<string, any> | null
  enfileiradaEm?: Date | null
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
  blocoId?: number | null
  produtoId: number
  ordemExecucao?: number | null
  operacao: ProdutoTransmissaoItemOperacao
  status: ProdutoTransmissaoItemStatus
  mensagem: string | null
  retornoCodigo: string | null
  retornoVersao: number | null
  retornoSituacao: string | null
  criadoEm: Date
  atualizadoEm: Date
}

type MockBloco = {
  id: number
  transmissaoId: number
  ordem: number
  status: ProdutoTransmissaoBlocoStatus
  totalItens: number
  totalSucesso: number
  totalErro: number
  mensagem: string | null
  iniciadoEm: Date | null
  concluidoEm: Date | null
  criadoEm: Date
  atualizadoEm: Date
}

const state = {
  blocos: [] as MockBloco[],
  catalogos: new Map<number, any>(),
  itens: [] as MockItem[],
  nextBlocoId: 1,
  nextItemId: 1,
  nextTransmissaoId: 1,
  produtos: new Map<number, any>(),
  transmissoes: [] as MockTransmissao[],
}

function resetState() {
  state.blocos = []
  state.catalogos.clear()
  state.itens = []
  state.nextBlocoId = 1
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

function clonarBloco(bloco: MockBloco) {
  return { ...bloco }
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

function localizarBloco(id: number) {
  return state.blocos.find(item => item.id === id) ?? null
}

function montarItensTransmissao(transmissaoId: number, includeProduto = false) {
  return state.itens
    .filter(item => item.transmissaoId === transmissaoId)
    .sort((a, b) => {
      const ordemA = a.ordemExecucao ?? a.id
      const ordemB = b.ordemExecucao ?? b.id
      return ordemA - ordemB
    })
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

function montarBlocosTransmissao(transmissaoId: number) {
  return state.blocos
    .filter(bloco => bloco.transmissaoId === transmissaoId)
    .sort((a, b) => a.ordem - b.ordem)
    .map(clonarBloco)
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
          origemTipo: data.origemTipo ?? 'MANUAL',
          origemContextoJson: data.origemContextoJson ?? null,
          enfileiradaEm: data.enfileiradaEm ?? null,
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
          ...(include?.blocos ? { blocos: montarBlocosTransmissao(transmissao.id) } : {}),
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
            blocos: montarBlocosTransmissao(item.id),
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
        if (include?.blocos) {
          resposta.blocos = montarBlocosTransmissao(transmissao.id)
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
            blocoId: item.blocoId ?? null,
            produtoId: item.produtoId,
            ordemExecucao: item.ordemExecucao ?? null,
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
      findMany: jest.fn(async ({ where, select }) => {
        const itens = state.itens
          .filter(item => {
            if (where?.transmissaoId !== undefined && item.transmissaoId !== where.transmissaoId) return false
            if (where?.blocoId !== undefined && item.blocoId !== where.blocoId) return false
            if (where?.status !== undefined && item.status !== where.status) return false
            return true
          })
          .sort((a, b) => {
            const ordemA = a.ordemExecucao ?? a.id
            const ordemB = b.ordemExecucao ?? b.id
            return ordemA - ordemB
          })
          .map(item => clonarItem(item))

        if (!select) {
          return itens
        }

        return itens.map(item => selecionarCampos(item as any, select))
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
          if (where?.id?.in && !where.id.in.includes(item.id)) return false
          if (where?.produtoId !== undefined && item.produtoId !== where.produtoId) return false
          if (where?.status?.in && !where.status.in.includes(item.status)) return false
          if (where?.status !== undefined && item.status !== where.status) return false
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
    produtoTransmissaoBloco: {
      create: jest.fn(async ({ data }) => {
        const bloco: MockBloco = {
          id: state.nextBlocoId++,
          transmissaoId: data.transmissaoId,
          ordem: data.ordem,
          status: data.status,
          totalItens: data.totalItens ?? 0,
          totalSucesso: data.totalSucesso ?? 0,
          totalErro: data.totalErro ?? 0,
          mensagem: data.mensagem ?? null,
          iniciadoEm: data.iniciadoEm ?? null,
          concluidoEm: data.concluidoEm ?? null,
          criadoEm: new Date(),
          atualizadoEm: new Date(),
        }
        state.blocos.push(bloco)
        return clonarBloco(bloco)
      }),
      deleteMany: jest.fn(async ({ where }) => {
        const anteriores = state.blocos.length
        state.blocos = state.blocos.filter(bloco => bloco.transmissaoId !== where.transmissaoId)
        state.itens.forEach(item => {
          if (item.transmissaoId === where.transmissaoId) {
            item.blocoId = null
          }
        })
        return { count: anteriores - state.blocos.length }
      }),
      findMany: jest.fn(async ({ where, select }) => {
        const blocos = state.blocos
          .filter(bloco => {
            if (where?.transmissaoId !== undefined && bloco.transmissaoId !== where.transmissaoId) return false
            if (where?.status !== undefined && bloco.status !== where.status) return false
            return true
          })
          .sort((a, b) => a.ordem - b.ordem)
          .map(bloco => clonarBloco(bloco))

        if (!select) {
          return blocos
        }

        return blocos.map(bloco => selecionarCampos(bloco as any, select))
      }),
      update: jest.fn(async ({ where, data }) => {
        const bloco = localizarBloco(where.id)
        if (!bloco) throw new Error('Bloco não encontrado')
        aplicarData(bloco as any, data)
        return clonarBloco(bloco)
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const blocos = state.blocos.filter(bloco => {
          if (where?.transmissaoId !== undefined && bloco.transmissaoId !== where.transmissaoId) return false
          if (where?.status !== undefined && bloco.status !== where.status) return false
          return true
        })
        blocos.forEach(bloco => aplicarData(bloco as any, data))
        return { count: blocos.length }
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

    expect(resultado).toEqual({ transmissaoId: 1, jobId: 700, posicaoFilaCatalogo: 1 })
    expect(state.itens).toHaveLength(2)
    expect(state.blocos).toHaveLength(1)
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
    state.blocos.push({
      id: 1,
      transmissaoId: 1,
      ordem: 1,
      status: ProdutoTransmissaoBlocoStatus.PENDENTE,
      totalItens: 2,
      totalSucesso: 0,
      totalErro: 0,
      mensagem: null,
      iniciadoEm: null,
      concluidoEm: null,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    })
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
        blocoId: 1,
        produtoId: 1,
        ordemExecucao: 1,
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
        blocoId: 1,
        produtoId: 2,
        ordemExecucao: 2,
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
    expect(siscomexClientMock.incluirProduto).toHaveBeenCalledWith('12345678', {
      descricao: 'Produto 1',
      denominacao: 'Produto 1',
      modalidade: 'IMPORTACAO',
      ncm: '01010101',
      atributos: [],
      atributosMultivalorados: [],
      atributosCompostos: [],
      atributosCompostosMultivalorados: [],
      codigosInterno: [],
    })
    expect(siscomexClientMock.atualizarProduto).toHaveBeenCalledWith('12345678', 'COD-2', {
      descricao: 'Produto 2',
      denominacao: 'Produto 2',
      modalidade: 'IMPORTACAO',
      ncm: '02020202',
      atributos: [],
      atributosMultivalorados: [],
      atributosCompostos: [],
      atributosCompostosMultivalorados: [],
      codigosInterno: [],
    })
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
    state.blocos.push({
      id: 1,
      transmissaoId: 1,
      ordem: 1,
      status: ProdutoTransmissaoBlocoStatus.PENDENTE,
      totalItens: 1,
      totalSucesso: 0,
      totalErro: 0,
      mensagem: null,
      iniciadoEm: null,
      concluidoEm: null,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    })
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
      blocoId: 1,
      produtoId: 1,
      ordemExecucao: 1,
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

  it('interrompe a fila em erro persistente de autenticação preservando os itens pendentes para retomada', async () => {
    state.produtos.set(1, { id: 1, codigo: null, denominacao: 'Produto 1' })
    state.produtos.set(2, { id: 2, codigo: null, denominacao: 'Produto 2' })
    state.blocos.push({
      id: 1,
      transmissaoId: 1,
      ordem: 1,
      status: ProdutoTransmissaoBlocoStatus.PENDENTE,
      totalItens: 2,
      totalSucesso: 0,
      totalErro: 0,
      mensagem: null,
      iniciadoEm: null,
      concluidoEm: null,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    })
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
        blocoId: 1,
        produtoId: 1,
        ordemExecucao: 1,
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
        blocoId: 1,
        produtoId: 2,
        ordemExecucao: 2,
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
      status: ProdutoTransmissaoItemStatus.PENDENTE,
      mensagem: 'acesso negado',
    })
    expect(state.itens[1]).toMatchObject({
      status: ProdutoTransmissaoItemStatus.PENDENTE,
    })
    expect(localizarTransmissao(1)).toMatchObject({
      status: ProdutoTransmissaoStatus.INTERROMPIDA,
      totalSucesso: 0,
      totalErro: 0,
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

    expect(resultado).toEqual({ transmissaoId: 1, jobId: 700, posicaoFilaCatalogo: 1 })
    expect(createAsyncJob).toHaveBeenCalledTimes(1)
    expect(state.blocos).toHaveLength(1)
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

  it('permite nova pre-transmissao mesmo quando já existe outra em fila', async () => {
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
    state.nextTransmissaoId = 2
    exportacaoServiceMock.buscarProdutosComAtributos.mockResolvedValue([
      { id: 2, status: 'APROVADO', situacao: 'RASCUNHO', codigo: null },
    ])

    await expect(service.prepararTransmissao([2], 5, 99)).resolves.toEqual({ transmissaoId: 2 })
  })
})
