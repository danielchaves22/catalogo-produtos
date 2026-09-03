import { AtributoPreenchimentoMassaService } from '../atributo-preenchimento-massa.service'
import { ProdutoResumoService } from '../produto-resumo.service'
import { catalogoPrisma } from '../../utils/prisma'

jest.mock('../../jobs/async-job.repository', () => ({
  createAsyncJob: jest.fn(),
}))

jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: {
    produto: { findMany: jest.fn() },
    atributoPreenchimentoMassa: { count: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  }
}))

describe('AtributoPreenchimentoMassaService', () => {
  const service = new AtributoPreenchimentoMassaService()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('lista historico paginado sem carregar os jsons pesados do detalhe', async () => {
    const criadoEm = new Date('2026-09-02T12:00:00.000Z')

    ;(catalogoPrisma.atributoPreenchimentoMassa.count as jest.Mock).mockResolvedValue(35)
    ;(catalogoPrisma.atributoPreenchimentoMassa.findMany as jest.Mock).mockResolvedValue([
      {
        id: 7,
        superUserId: 99,
        ncmCodigo: '12345678',
        modalidade: 'IMPORTACAO',
        modoAtribuicao: 'SELECIONADOS',
        catalogoIdsJson: [3],
        catalogosJson: [{ id: 3, nome: 'Catalogo teste', numero: 10, cpf_cnpj: '12345678000190' }],
        produtosImpactados: 12,
        criadoEm,
        criadoPor: 'Usuario',
        asyncJob: { id: 20, status: 'CONCLUIDO', finalizadoEm: criadoEm },
      }
    ])

    const resultado = await service.listar(99, { page: 2, pageSize: 10 })

    expect(catalogoPrisma.atributoPreenchimentoMassa.count).toHaveBeenCalledWith({
      where: { superUserId: 99 }
    })
    expect(catalogoPrisma.atributoPreenchimentoMassa.findMany).toHaveBeenCalledWith({
      where: { superUserId: 99 },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
      select: expect.objectContaining({
        id: true,
        superUserId: true,
        catalogosJson: true,
        produtosImpactados: true,
        asyncJob: { select: { id: true, status: true, finalizadoEm: true } }
      })
    })
    expect((catalogoPrisma.atributoPreenchimentoMassa.findMany as jest.Mock).mock.calls[0][0].select).not.toHaveProperty('valoresJson')
    expect((catalogoPrisma.atributoPreenchimentoMassa.findMany as jest.Mock).mock.calls[0][0].select).not.toHaveProperty('estruturaSnapshotJson')
    expect((catalogoPrisma.atributoPreenchimentoMassa.findMany as jest.Mock).mock.calls[0][0].select).not.toHaveProperty('produtosImpactadosDetalhesJson')
    expect(resultado).toEqual({
      items: [
        expect.objectContaining({
          id: 7,
          catalogoIds: [3],
          produtosImpactados: 12,
          valoresAtributos: {},
          estruturaSnapshot: null,
          produtosImpactadosDetalhes: [],
          jobId: 20,
          jobStatus: 'CONCLUIDO',
        })
      ],
      total: 35,
      page: 2,
      pageSize: 10,
    })
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
