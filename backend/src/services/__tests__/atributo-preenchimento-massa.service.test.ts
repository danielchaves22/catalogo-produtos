import { AtributoPreenchimentoMassaService } from '../atributo-preenchimento-massa.service'
import { ProdutoResumoService } from '../produto-resumo.service'
import { catalogoPrisma } from '../../utils/prisma'

jest.mock('../../jobs/async-job.repository', () => ({
  createAsyncJob: jest.fn(),
}))

jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: {
    produto: { findMany: jest.fn() },
    atributoPreenchimentoMassa: { update: jest.fn() },
    $transaction: jest.fn(),
  }
}))

describe('AtributoPreenchimentoMassaService', () => {
  const service = new AtributoPreenchimentoMassaService()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('remove vinculos antigos do mesmo codigo antes de gravar a versao atual', async () => {
    const tx = {
      produto: { update: jest.fn().mockResolvedValue({}) },
      produtoAtributo: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    }

    ;(catalogoPrisma.produto.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 10, status: 'AJUSTAR_ESTRUTURA' }])
      .mockResolvedValueOnce([
        {
          id: 10,
          denominacao: 'Produto 10',
          catalogo: null,
          codigosInternos: [],
        }
      ])

    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => callback(tx))
    ;(catalogoPrisma.atributoPreenchimentoMassa.update as jest.Mock).mockResolvedValue({
      id: 1,
      superUserId: 99,
      ncmCodigo: '12345678',
      modalidade: 'IMPORTACAO',
      modoAtribuicao: 'SELECIONADOS',
      catalogoIdsJson: [],
      catalogosJson: [],
      valoresJson: { ATT_14545: 'ATUAL' },
      estruturaSnapshotJson: [],
      produtosExcecaoJson: [],
      produtosSelecionadosJson: [],
      produtosImpactados: 1,
      produtosImpactadosDetalhesJson: [],
      criadoEm: new Date(),
      criadoPor: null,
      asyncJob: null,
    })

    jest.spyOn(ProdutoResumoService.prototype, 'recalcularResumoProduto').mockResolvedValue({
      atributosTotal: 1,
      obrigatoriosPendentes: 0,
      validosTransmissao: 1,
    })

    await service.processarJob({
      registroId: 1,
      superUserId: 99,
      solicitanteNome: null,
      ncmCodigo: '12345678',
      modalidade: 'IMPORTACAO',
      modoAtribuicao: 'SELECIONADOS',
      catalogoIds: [],
      catalogosDetalhes: [],
      valoresAtributos: { ATT_14545: 'ATUAL' },
      atributosParaAtualizar: [
        {
          atributoId: 9306,
          codigo: 'ATT_14545',
          valores: ['ATUAL'],
        }
      ],
      estruturaVersaoId: 704,
      estruturaVersaoNumero: 4,
      estruturaSnapshot: [],
      produtosExcecaoIds: [],
      produtosExcecaoDetalhes: [],
      produtosSelecionadosIds: [10],
      produtosSelecionadosDetalhes: [],
    })

    expect(tx.produtoAtributo.deleteMany).toHaveBeenCalledWith({
      where: {
        produtoId: 10,
        atributo: { codigo: 'ATT_14545' }
      }
    })
    expect(tx.produtoAtributo.create).toHaveBeenCalledWith({
      data: {
        produtoId: 10,
        atributoId: 9306,
        atributoVersaoId: 704,
        valores: {
          create: [{ valorJson: 'ATUAL', ordem: 0 }]
        }
      }
    })
  })
})
