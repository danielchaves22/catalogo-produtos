import { CatalogoService } from '../catalogo.service'
import { catalogoPrisma } from '../../utils/prisma'
import { CatalogoStatus } from '@prisma/client'

jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: {
    catalogo: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn()
    },
    $transaction: jest.fn(),
  }
}))

describe('CatalogoService', () => {
  const service = new CatalogoService()

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('nao permite criar catalogo com CPF/CNPJ ja existente', async () => {
    ;(catalogoPrisma.catalogo.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 1 })

    await expect(
      service.criar({ nome: 'Teste', cpf_cnpj: '12345678901', status: CatalogoStatus.ATIVO }, 1)
    ).rejects.toThrow('CPF/CNPJ')
  })

  it('nao permite atualizar catalogo com CPF/CNPJ ja existente', async () => {
    ;(catalogoPrisma.catalogo.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 2 })

    await expect(
      service.atualizar(1, { nome: 'Teste', cpf_cnpj: '12345678901', status: CatalogoStatus.ATIVO }, 1)
    ).rejects.toThrow('CPF/CNPJ')
    expect(catalogoPrisma.catalogo.updateMany).not.toHaveBeenCalled()
  })

  it('clona somente os atributos da versao ativa quando ha duplicidade por codigo', async () => {
    ;(catalogoPrisma.catalogo.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 1,
        status: CatalogoStatus.ATIVO,
        operadoresEstrangeiros: [],
        produtos: [
          {
            id: 20,
            versao: 1,
            status: 'APROVADO',
            situacao: 'RASCUNHO',
            ncmCodigo: '12345678',
            modalidade: 'IMPORTACAO',
            denominacao: 'Produto legado',
            descricao: 'Descricao',
            versaoEstruturaAtributos: 4,
            versaoAtributoId: 704,
            criadoPor: null,
            codigosInternos: [],
            operadoresEstrangeiros: [],
            atributos: [
              {
                id: 100,
                atributoId: 7834,
                atributoVersaoId: 586,
                validadoEm: null,
                errosValidacao: null,
                atributo: { codigo: 'ATT_14545' },
                valores: [{ valorJson: 'ANTIGO', ordem: 0 }],
              },
              {
                id: 101,
                atributoId: 9306,
                atributoVersaoId: 704,
                validadoEm: null,
                errosValidacao: null,
                atributo: { codigo: 'ATT_14545' },
                valores: [{ valorJson: 'ATUAL', ordem: 0 }],
              },
            ],
          }
        ],
      })

    const tx = {
      catalogo: { create: jest.fn().mockResolvedValue({ id: 99 }) },
      operadorEstrangeiro: { create: jest.fn() },
      produto: { create: jest.fn().mockResolvedValue({ id: 200 }) },
      produtoAtributo: { create: jest.fn().mockResolvedValue({ id: 300 }) },
      produtoAtributoValor: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    }

    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => callback(tx))

    await service.clonar(1, 'Catalogo clone', '12345678000199', 50)

    expect(tx.produtoAtributo.create).toHaveBeenCalledTimes(1)
    expect(tx.produtoAtributo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        produtoId: 200,
        atributoId: 9306,
        atributoVersaoId: 704,
      })
    })
    expect(tx.produtoAtributoValor.createMany).toHaveBeenCalledWith({
      data: [
        {
          produtoAtributoId: 300,
          valorJson: 'ATUAL',
          ordem: 0,
        },
      ]
    })
  })
})
