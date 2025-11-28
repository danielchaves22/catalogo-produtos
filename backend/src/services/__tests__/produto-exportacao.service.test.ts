import { ProdutoExportacaoService } from '../produto-exportacao.service'
import { ProdutoService } from '../produto.service'
import { createAsyncJob } from '../../jobs/async-job.repository'
import { AsyncJobTipo } from '@prisma/client'

jest.mock('../../jobs/async-job.repository', () => ({
  createAsyncJob: jest.fn(),
}))

jest.mock('../../utils/prisma', () => {
  const catalogoPrisma = {
    produtoExportacao: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    usuarioCatalogo: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  }

  return { catalogoPrisma }
})

const { catalogoPrisma: mockCatalogoPrisma } = jest.requireMock('../../utils/prisma') as {
  catalogoPrisma: any
}

describe('ProdutoExportacaoService', () => {
  let service: ProdutoExportacaoService

  beforeEach(() => {
    jest.clearAllMocks()
    mockCatalogoPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockCatalogoPrisma))
    mockCatalogoPrisma.produtoExportacao.create.mockResolvedValue({ id: 10 })
    mockCatalogoPrisma.produtoExportacao.update.mockResolvedValue(undefined)
    mockCatalogoPrisma.usuarioCatalogo.findFirst.mockResolvedValue({ id: 50 })
    ;(createAsyncJob as jest.Mock).mockResolvedValue({ id: 99 })
    jest.spyOn(ProdutoService.prototype, 'resolverSelecaoProdutos').mockResolvedValue([1, 2, 3])
    service = new ProdutoExportacaoService()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('agenda exportação criando registro e job assíncrono', async () => {
    const resultado = await service.solicitarExportacao(
      {
        todosFiltrados: false,
        idsSelecionados: [1, 2],
        idsDeselecionados: [],
      },
      7,
      { id: 123 } as any
    )

    expect(ProdutoService.prototype.resolverSelecaoProdutos).toHaveBeenCalledWith(
      expect.objectContaining({ todosFiltrados: false, idsSelecionados: [1, 2], idsDeselecionados: [] }),
      7,
      expect.any(Object)
    )
    expect(mockCatalogoPrisma.produtoExportacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          superUserId: 7,
          usuarioCatalogoId: 50,
          todosFiltrados: false,
          idsSelecionadosJson: [1, 2],
        }),
      })
    )
    expect(createAsyncJob).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'EXPORTACAO_PRODUTO',
        payload: { exportacaoId: 10, superUserId: 7 },
        arquivo: { nome: expect.stringContaining('produtos-siscomex-') },
      }),
      mockCatalogoPrisma
    )
    expect(mockCatalogoPrisma.produtoExportacao.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { asyncJobId: 99 },
    })
    expect(resultado).toEqual({ exportacaoId: 10, jobId: 99 })
  })

  it('permite configurar o tipo e o prefixo do arquivo ao agendar exportação', async () => {
    mockCatalogoPrisma.produtoExportacao.create.mockResolvedValue({ id: 15 })

    await service.solicitarExportacao(
      { todosFiltrados: true, idsDeselecionados: [], idsSelecionados: [], filtros: undefined },
      3,
      { id: 999 } as any,
      { tipo: AsyncJobTipo.EXPORTACAO_FABRICANTE, arquivoNomePrefixo: 'fabricantes-siscomex' }
    )

    expect(createAsyncJob).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: AsyncJobTipo.EXPORTACAO_FABRICANTE,
        payload: { exportacaoId: 15, superUserId: 3 },
        arquivo: { nome: expect.stringContaining('fabricantes-siscomex-') },
      }),
      mockCatalogoPrisma
    )
  })

  it('transforma atributos em estrutura SISCOMEX', () => {
    const produtos = [
      {
        id: 1,
        codigo: 'PRD-1',
        versao: 2,
        status: 'APROVADO',
        situacao: 'APROVADO',
        descricao: 'Produto 1',
        denominacao: 'Denominação 1',
        modalidade: 'EXPORTACAO',
        ncmCodigo: '01010101',
        catalogo: { cpf_cnpj: '12.345.678/0001-90' },
        atributos: [
          {
            atributo: {
              codigo: 'ATT_1',
              multivalorado: false,
              parentCodigo: null,
              condicionanteCodigo: null,
            },
            valores: [{ valorJson: 'A', ordem: 0 }],
          },
          {
            atributo: {
              codigo: 'ATT_MULTI',
              multivalorado: true,
              parentCodigo: null,
              condicionanteCodigo: null,
            },
            valores: [
              { valorJson: 'V1', ordem: 0 },
              { valorJson: 'V2', ordem: 1 },
            ],
          },
          {
            atributo: {
              codigo: 'ATT_FILHO',
              multivalorado: false,
              parentCodigo: 'ATT_PAI',
              condicionanteCodigo: null,
              parent: { codigo: 'ATT_PAI', multivalorado: false },
            },
            valores: [{ valorJson: 'C1', ordem: 0 }],
          },
          {
            atributo: {
              codigo: 'ATT_FILHO_MULTI',
              multivalorado: false,
              parentCodigo: 'ATT_PAI_MULTI',
              condicionanteCodigo: null,
              parent: { codigo: 'ATT_PAI_MULTI', multivalorado: true },
            },
            valores: [
              { valorJson: 'G1', ordem: 0 },
              { valorJson: 'G2', ordem: 1 },
            ],
          },
        ],
        codigosInternos: [{ codigo: 'SKU-1' }],
      },
      {
        id: 5,
        codigo: null,
        versao: null,
        status: 'RASCUNHO',
        situacao: 'RASCUNHO',
        descricao: 'Produto 2',
        denominacao: 'Denominação 2',
        modalidade: null,
        ncmCodigo: '02020202',
        catalogo: { cpf_cnpj: null },
        atributos: [],
        codigosInternos: [],
      },
    ] as any

    const resultado = service.transformarParaSiscomex(produtos)

    expect(resultado).toEqual([
      {
        seq: 1,
        codigo: 'PRD-1',
        descricao: 'Produto 1',
        denominacao: 'Denominação 1',
        modalidade: 'EXPORTACAO',
        ncm: '01010101',
        cpfCnpjRaiz: '12345678',
        situacao: 'Ativado',
        versao: '2',
        atributos: [{ atributo: 'ATT_1', valor: 'A' }],
        atributosMultivalorados: [{ atributo: 'ATT_MULTI', valores: ['V1', 'V2'] }],
        atributosCompostos: [{ atributo: 'ATT_PAI', valores: [{ atributo: 'ATT_FILHO', valor: 'C1' }] }],
        atributosCompostosMultivalorados: [
          {
            atributo: 'ATT_PAI_MULTI',
            valores: [
              [{ atributo: 'ATT_FILHO_MULTI', valor: 'G1' }],
              [{ atributo: 'ATT_FILHO_MULTI', valor: 'G2' }],
            ],
          },
        ],
        codigosInterno: ['SKU-1'],
      },
      {
        seq: 5,
        codigo: null,
        descricao: 'Produto 2',
        denominacao: 'Denominação 2',
        modalidade: null,
        ncm: '02020202',
        cpfCnpjRaiz: null,
        situacao: 'Ativado',
        versao: '',
        atributos: [],
        atributosMultivalorados: [],
        atributosCompostos: [],
        atributosCompostosMultivalorados: [],
        codigosInterno: [],
      },
    ])
  })

  it('exporta atributo condicional no mesmo nível quando condição e valor são atendidos', () => {
    const produtos = [
      {
        id: 2,
        codigo: 'PRD-2',
        versao: 1,
        status: 'APROVADO',
        situacao: 'APROVADO',
        descricao: 'Produto condicional',
        denominacao: 'Produto condicional',
        modalidade: 'EXPORTACAO',
        ncmCodigo: '03030303',
        catalogo: { cpf_cnpj: '98.765.432/0001-10' },
        atributos: [
          {
            atributo: {
              codigo: 'ATT_BASE',
              multivalorado: false,
              parentCodigo: null,
              condicionanteCodigo: null,
            },
            valores: [{ valorJson: 'SIM', ordem: 0 }],
          },
          {
            atributo: {
              codigo: 'ATT_COND',
              multivalorado: false,
              parentCodigo: 'ATT_BASE',
              condicionanteCodigo: 'ATT_BASE',
              parent: null,
            },
            valores: [{ valorJson: 'CONDICIONAL', ordem: 0 }],
          },
        ],
        codigosInternos: [{ codigo: 'SKU-2' }],
      },
    ] as any

    const resultado = service.transformarParaSiscomex(produtos)

    expect(resultado[0].atributos).toEqual([
      { atributo: 'ATT_BASE', valor: 'SIM' },
      { atributo: 'ATT_COND', valor: 'CONDICIONAL' },
    ])
    expect(resultado[0].atributosCompostos).toEqual([])
    expect(resultado[0].atributosCompostosMultivalorados).toEqual([])
  })

  it('ignora atributo condicional quando condição ou valor não estão preenchidos', () => {
    const produtos = [
      {
        id: 3,
        codigo: 'PRD-3',
        versao: 1,
        status: 'APROVADO',
        situacao: 'APROVADO',
        descricao: 'Produto condicional vazio',
        denominacao: 'Produto condicional vazio',
        modalidade: 'EXPORTACAO',
        ncmCodigo: '04040404',
        catalogo: { cpf_cnpj: '11.222.333/0001-44' },
        atributos: [
          {
            atributo: {
              codigo: 'ATT_BASE',
              multivalorado: false,
              parentCodigo: null,
              condicionanteCodigo: null,
            },
            valores: [],
          },
          {
            atributo: {
              codigo: 'ATT_COND',
              multivalorado: false,
              parentCodigo: 'ATT_BASE',
              condicionanteCodigo: 'ATT_BASE',
              parent: null,
            },
            valores: [{ valorJson: '', ordem: 0 }],
          },
        ],
        codigosInternos: [{ codigo: 'SKU-3' }],
      },
    ] as any

    const resultado = service.transformarParaSiscomex(produtos)

    expect(resultado[0].atributos).toEqual([])
    expect(resultado[0].atributosCompostos).toEqual([])
    expect(resultado[0].atributosCompostosMultivalorados).toEqual([])
  })
})
