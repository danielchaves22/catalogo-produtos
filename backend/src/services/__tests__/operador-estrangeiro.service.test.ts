import { OperadorEstrangeiroService } from '../operador-estrangeiro.service'
import { catalogoPrisma } from '../../utils/prisma'
import { OperadorEstrangeiroStatus } from '@prisma/client'

jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: {
    operadorEstrangeiro: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    catalogo: {
      findMany: jest.fn()
    },
    pais: {
      findMany: jest.fn()
    }
  }
}))

describe('OperadorEstrangeiroService - superUserId', () => {
  const service = new OperadorEstrangeiroService()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('filtra por superUserId ao listar', async () => {
    ;(catalogoPrisma.operadorEstrangeiro.findMany as jest.Mock).mockResolvedValue([])
    await service.listarTodos(undefined, 1)
    expect(catalogoPrisma.operadorEstrangeiro.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { catalogo: { superUserId: 1 } } })
    )
  })

  it('inclui catalogoId ao criar', async () => {
    ;(catalogoPrisma.operadorEstrangeiro.create as jest.Mock).mockResolvedValue({})
    await service.criar({
      catalogoId: 1,
      paisCodigo: 'BR',
      nome: 'Teste',
      situacao: OperadorEstrangeiroStatus.ATIVADO,
      superUserId: 1
    })
    expect(catalogoPrisma.operadorEstrangeiro.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ catalogoId: 1, numero: 0 }) })
    )
  })

  it('usa superUserId ao remover', async () => {
    ;(catalogoPrisma.operadorEstrangeiro.findFirst as jest.Mock).mockResolvedValue({ id: 2 })
    ;(catalogoPrisma.operadorEstrangeiro.update as jest.Mock).mockResolvedValue({})
    await service.remover(2, 1)
    expect(catalogoPrisma.operadorEstrangeiro.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2 } })
    )
  })

  it('retorna XX como primeiro pais na listagem de paises', async () => {
    ;(catalogoPrisma.pais.findMany as jest.Mock).mockResolvedValue([
      { codigo: 'BR', sigla: 'BR', nome: 'Brasil' },
      { codigo: 'XX', sigla: 'XX', nome: 'A DESIGNAR' },
      { codigo: 'AR', sigla: 'AR', nome: 'Argentina' }
    ])

    const paises = await service.listarPaises()

    expect(paises[0].codigo).toBe('XX')
    expect(paises.map(p => p.codigo)).toEqual(['XX', 'AR', 'BR'])
  })
})
