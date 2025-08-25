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
      expect.objectContaining({ data: expect.objectContaining({ catalogoId: 1 }) })
    )
  })

  it('usa superUserId ao remover', async () => {
    ;(catalogoPrisma.operadorEstrangeiro.update as jest.Mock).mockResolvedValue({})
    await service.remover(2, 1)
    expect(catalogoPrisma.operadorEstrangeiro.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2 } })
    )
  })
})
