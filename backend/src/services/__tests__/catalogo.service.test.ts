import { CatalogoService } from '../catalogo.service'
import { catalogoPrisma } from '../../utils/prisma'
import { CatalogoStatus } from '@prisma/client'

jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: {
    catalogo: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn()
    }
  }
}))

describe('CatalogoService - CPF/CNPJ duplicado', () => {
  const service = new CatalogoService()

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('não permite criar catálogo com CPF/CNPJ já existente', async () => {
    ;(catalogoPrisma.catalogo.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 1 })

    await expect(
      service.criar({ nome: 'Teste', cpf_cnpj: '12345678901', status: CatalogoStatus.ATIVO }, 1)
    ).rejects.toThrow('Já existe um catálogo com este CPF/CNPJ')
  })

  it('não permite atualizar catálogo com CPF/CNPJ já existente', async () => {
    ;(catalogoPrisma.catalogo.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 2 })

    await expect(
      service.atualizar(1, { nome: 'Teste', cpf_cnpj: '12345678901', status: CatalogoStatus.ATIVO }, 1)
    ).rejects.toThrow('Já existe um catálogo com este CPF/CNPJ')
    expect(catalogoPrisma.catalogo.updateMany).not.toHaveBeenCalled()
  })
})
