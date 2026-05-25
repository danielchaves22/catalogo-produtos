import { ProdutoResumoService } from '../produto-resumo.service'
import { catalogoPrisma } from '../../utils/prisma'

jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: {
    produto: { findUnique: jest.fn(), findMany: jest.fn() },
    produtoResumoDashboard: { upsert: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
  }
}))

describe('ProdutoResumoService', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('considera somente os atributos da versao ativa ao recalcular o resumo', async () => {
    const atributoService = {
      buscarEstruturaPorVersao: jest.fn().mockResolvedValue({
        estrutura: [
          {
            codigo: 'ATT_14545',
            nome: 'Categoria regulatoria - Anvisa',
            tipo: 'LISTA_ESTATICA',
            obrigatorio: true,
            multivalorado: false,
            validacoes: {},
          }
        ]
      })
    }

    ;(catalogoPrisma.produto.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      catalogoId: 9,
      versaoAtributoId: 586,
      atributos: [
        {
          id: 10,
          atributoVersaoId: 586,
          atributo: { codigo: 'ATT_14545', multivalorado: false },
          valores: [],
        },
        {
          id: 11,
          atributoVersaoId: 704,
          atributo: { codigo: 'ATT_14545', multivalorado: false },
          valores: [{ valorJson: 'PREENCHIDO' }],
        },
      ],
    })

    const service = new ProdutoResumoService(atributoService as any)
    const resumo = await service.recalcularResumoProduto(1)

    expect(resumo).toEqual({
      atributosTotal: 1,
      obrigatoriosPendentes: 1,
      validosTransmissao: 0,
    })
    expect(catalogoPrisma.produtoResumoDashboard.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          obrigatoriosPendentes: 1,
        }),
        create: expect.objectContaining({
          obrigatoriosPendentes: 1,
        }),
      })
    )
  })
})
