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

  it('buscarSugestoes deve retornar lista do legado', async () => {
    mockedLegacy.$queryRaw.mockResolvedValueOnce([
      { codigo: '12345678', descricao: 'Teste 1' },
      { codigo: '12349999', descricao: 'Teste 2' }
    ])

    const service = new NcmLegacyService()
    const resultado = await service.buscarSugestoes('1234')

    expect(mockedLegacy.$queryRaw).toHaveBeenCalledTimes(1)
    expect(resultado).toEqual([
      { codigo: '12345678', descricao: 'Teste 1' },
      { codigo: '12349999', descricao: 'Teste 2' }
    ])
  })

  it('buscarSugestoes deve retornar lista vazia quando não houver dados', async () => {
    mockedLegacy.$queryRaw.mockResolvedValueOnce([])

    const service = new NcmLegacyService()
    const resultado = await service.buscarSugestoes('9876')

    expect(resultado).toEqual([])
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

