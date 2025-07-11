import { NcmLegacyService } from '../ncm-legacy.service'
import { legacyPrisma, catalogoPrisma } from '../../utils/prisma'

jest.mock('../../utils/prisma', () => ({
  legacyPrisma: { $queryRaw: jest.fn() },
  catalogoPrisma: { ncmCache: { upsert: jest.fn(), findUnique: jest.fn() } }
}))

const mockedLegacy = legacyPrisma as jest.Mocked<typeof legacyPrisma>
const mockedCatalogo = catalogoPrisma as any

describe('NcmLegacyService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('buscarNcm deve retornar informacoes do legado', async () => {
    mockedLegacy.$queryRaw.mockResolvedValueOnce([
      { descricao: 'Produto Teste', unidade_medida: 'KG' }
    ])

    const service = new NcmLegacyService()
    const resultado = await service.buscarNcm('12345678')

    expect(resultado).toEqual({ descricao: 'Produto Teste', unidadeMedida: 'KG' })
  })

  it('sincronizarNcm deve gravar no cache', async () => {
    mockedLegacy.$queryRaw.mockResolvedValueOnce([
      { descricao: 'Produto Teste', unidade_medida: 'KG' }
    ])
    mockedCatalogo.ncmCache.upsert.mockResolvedValueOnce({} as any)

    const service = new NcmLegacyService()
    const resultado = await service.sincronizarNcm('12345678')

    expect(mockedCatalogo.ncmCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { codigo: '12345678' },
        create: expect.objectContaining({
          codigo: '12345678',
          descricao: 'Produto Teste',
          unidadeMedida: 'KG',
          dataUltimaSincronizacao: expect.any(Date)
        }),
        update: expect.objectContaining({
          descricao: 'Produto Teste',
          unidadeMedida: 'KG',
          dataUltimaSincronizacao: expect.any(Date)
        })
      })
    )

    expect(resultado).toEqual({ descricao: 'Produto Teste', unidadeMedida: 'KG' })
  })
})

