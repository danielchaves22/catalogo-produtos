import { obterResumoDashboardService } from '../dashboard.service'
import { catalogoPrisma } from '../../utils/prisma'

const garantirResumosMock = jest.fn()

jest.mock('../produto-resumo.service', () => ({
  ProdutoResumoService: jest.fn().mockImplementation(() => ({
    garantirResumos: garantirResumosMock
  }))
}))

jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: {
    catalogo: { count: jest.fn() },
    produto: { count: jest.fn() },
    $queryRaw: jest.fn(),
    produtoResumoDashboard: { aggregate: jest.fn(), count: jest.fn() }
  }
}))

describe('obterResumoDashboardService', () => {
  const prismaMock = catalogoPrisma as unknown as {
    catalogo: { count: jest.Mock }
    produto: { count: jest.Mock }
    $queryRaw: jest.Mock
    produtoResumoDashboard: { aggregate: jest.Mock; count: jest.Mock }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.catalogo.count.mockReset()
    prismaMock.produto.count.mockReset()
    prismaMock.$queryRaw.mockReset()
    prismaMock.produtoResumoDashboard.aggregate.mockReset()
    prismaMock.produtoResumoDashboard.count.mockReset()
    garantirResumosMock.mockReset()
  })

  it('retorna resumo utilizando agregados materializados', async () => {
    prismaMock.catalogo.count.mockResolvedValue(2)
    prismaMock.produto.count.mockResolvedValue(5)
    prismaMock.produtoResumoDashboard.count.mockResolvedValue(5)
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        { status: 'PENDENTE', total: 2 },
        { status: 'APROVADO', total: 1 }
      ])
      .mockResolvedValueOnce([
        { status: 'TRANSMITIDO', total: 1 }
      ])

    prismaMock.produtoResumoDashboard.aggregate.mockResolvedValue({
      _sum: {
        atributosTotal: 120,
        obrigatoriosPendentes: 15,
        validosTransmissao: 105
      }
    })

    const resumo = await obterResumoDashboardService(10)

    expect(resumo.catalogos.total).toBe(2)
    expect(resumo.produtos.total).toBe(5)
    expect(resumo.produtos.porStatus).toEqual([
      { status: 'PENDENTE', total: 2 },
      { status: 'APROVADO', total: 1 },
      { status: 'PROCESSANDO', total: 0 },
      { status: 'TRANSMITIDO', total: 0 },
      { status: 'ERRO', total: 0 }
    ])
    expect(resumo.catalogos.porStatus).toEqual([
      { status: 'PENDENTE', total: 0 },
      { status: 'APROVADO', total: 0 },
      { status: 'PROCESSANDO', total: 0 },
      { status: 'TRANSMITIDO', total: 1 },
      { status: 'ERRO', total: 0 }
    ])
    expect(resumo.atributos).toEqual({
      total: 120,
      obrigatoriosPendentes: 15,
      validosTransmissao: 105
    })
    expect(garantirResumosMock).not.toHaveBeenCalled()
  })

  it('filtra agregados pelo catálogo informado', async () => {
    prismaMock.catalogo.count.mockResolvedValue(1)
    prismaMock.produto.count.mockResolvedValue(1)
    prismaMock.$queryRaw.mockResolvedValue([])
    prismaMock.produtoResumoDashboard.count.mockResolvedValue(1)
    prismaMock.produtoResumoDashboard.aggregate.mockResolvedValue({ _sum: {} })

    await obterResumoDashboardService(7, 33)

    expect(prismaMock.produtoResumoDashboard.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          catalogo: { superUserId: 7 },
          catalogoId: 33
        })
      })
    )
  })

  it('recalcula resumos faltantes antes de agregar', async () => {
    prismaMock.catalogo.count.mockResolvedValue(1)
    prismaMock.produto.count.mockResolvedValue(3)
    prismaMock.produtoResumoDashboard.count.mockResolvedValue(1)
    prismaMock.$queryRaw.mockResolvedValue([])
    prismaMock.produtoResumoDashboard.aggregate.mockResolvedValue({
      _sum: {
        atributosTotal: 10,
        obrigatoriosPendentes: 4,
        validosTransmissao: 6
      }
    })

    await obterResumoDashboardService(5)

    expect(garantirResumosMock).toHaveBeenCalledWith(5, undefined)
    expect(prismaMock.produtoResumoDashboard.aggregate).toHaveBeenCalled()
  })
})
