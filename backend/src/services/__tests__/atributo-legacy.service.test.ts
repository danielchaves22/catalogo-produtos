import { AtributoLegacyService } from '../atributo-legacy.service'
import { legacyPrisma } from '../../utils/prisma'

jest.mock('../../utils/prisma', () => ({
  legacyPrisma: { $queryRaw: jest.fn() }
}))

const mockedPrisma = legacyPrisma as jest.Mocked<typeof legacyPrisma>

describe('AtributoLegacyService', () => {
  it('deve ignorar condicao invalida sem lancar erro', async () => {
    mockedPrisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          condicionante_codigo: '001',
          codigo: '002',
          nome_apresentacao: 'Teste',
          forma_preenchimento: 'TEXTO',
          obrigatorio: 1,
          multivalorado: 0,
          tamanho_maximo: null,
          casas_decimais: null,
          mascara: null,
          orientacao_preenchimento: null,
          descricao_condicao: 'desc',
          condicao: '{invalid',
          dominio_codigo: null,
          dominio_descricao: null
        }
      ])

    const service = new AtributoLegacyService()
    const resultado = await service.buscarEstrutura('1234')

    expect(resultado.estrutura[0].condicao).toBeUndefined()
  })
})
