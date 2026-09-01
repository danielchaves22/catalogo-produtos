import { AtributoLegacyService } from '../atributo-legacy.service'
import { catalogoPrisma, legacyPrisma } from '../../utils/prisma'

jest.mock('../../utils/prisma', () => ({
  legacyPrisma: { $queryRaw: jest.fn() },
  catalogoPrisma: {
    atributoVersao: { findFirst: jest.fn(), create: jest.fn() },
    atributo: { findMany: jest.fn(), create: jest.fn() },
    atributoDominio: { createMany: jest.fn() },
    $transaction: jest.fn()
  }
}))

const mockedLegacy = legacyPrisma as jest.Mocked<typeof legacyPrisma>
const mockedCatalogo = catalogoPrisma as any

describe('AtributoLegacyService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedCatalogo.$transaction.mockImplementation(async (cb: any) =>
      cb({
        atributoVersao: mockedCatalogo.atributoVersao,
        atributo: mockedCatalogo.atributo,
        atributoDominio: mockedCatalogo.atributoDominio
      })
    )
  })

  it('deve ignorar condicao invalida sem lancar erro', async () => {
    mockedLegacy.$queryRaw
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
    const resultado = await (service as any).carregarEstruturaLegacy('1234', 'IMPORTACAO')

    expect(resultado[0].condicao).toBeUndefined()
  })

  it('reutiliza versao local quando a estrutura do legado nao mudou', async () => {
    mockedCatalogo.atributoVersao.findFirst.mockResolvedValue({ id: 10, versao: 3 })
    mockedCatalogo.atributo.findMany.mockResolvedValue([
      {
        id: 101,
        codigo: 'ATT_TESTE',
        nome: 'Teste',
        tipo: 'TEXTO',
        obrigatorio: true,
        multivalorado: false,
        orientacaoPreenchimento: 'Orientacao',
        validacoesJson: { tamanho_maximo: 10 },
        descricaoCondicao: null,
        condicaoJson: null,
        parentCodigo: null,
        condicionanteCodigo: null,
        parentId: null,
        dominio: [{ codigo: '1', descricao: 'Sim', ordem: 0 }]
      }
    ])
    mockedLegacy.$queryRaw
      .mockResolvedValueOnce([
        {
          codigo: 'ATT_TESTE',
          nome_apresentacao: 'Teste',
          forma_preenchimento: 'TEXTO',
          obrigatorio: 1,
          multivalorado: 0,
          tamanho_maximo: 10,
          casas_decimais: null,
          mascara: null,
          orientacao_preenchimento: 'Orientacao',
          parent_codigo: null,
          dominio_codigo: '1',
          dominio_descricao: 'Sim'
        }
      ])
      .mockResolvedValueOnce([])

    const service = new AtributoLegacyService()
    const sincronizarSpy = jest.spyOn(service, 'sincronizarEstrutura')

    const resultado = await service.buscarEstruturaAtualizada('12345678', 'IMPORTACAO')

    expect(resultado).toMatchObject({ versaoId: 10, versaoNumero: 3 })
    expect(sincronizarSpy).not.toHaveBeenCalled()
  })

  it('sincroniza nova versao quando a estrutura do legado diverge', async () => {
    mockedCatalogo.atributoVersao.findFirst.mockResolvedValue({ id: 10, versao: 3 })
    mockedCatalogo.atributo.findMany.mockResolvedValue([
      {
        id: 101,
        codigo: 'ATT_TESTE',
        nome: 'Teste',
        tipo: 'TEXTO',
        obrigatorio: true,
        multivalorado: false,
        orientacaoPreenchimento: null,
        validacoesJson: {},
        descricaoCondicao: null,
        condicaoJson: null,
        parentCodigo: null,
        condicionanteCodigo: null,
        parentId: null,
        dominio: [{ codigo: '1', descricao: 'Sim', ordem: 0 }]
      }
    ])
    mockedLegacy.$queryRaw
      .mockResolvedValueOnce([
        {
          codigo: 'ATT_TESTE',
          nome_apresentacao: 'Teste',
          forma_preenchimento: 'TEXTO',
          obrigatorio: 1,
          multivalorado: 0,
          tamanho_maximo: null,
          casas_decimais: null,
          mascara: null,
          orientacao_preenchimento: null,
          parent_codigo: null,
          dominio_codigo: '2',
          dominio_descricao: 'Nao'
        }
      ])
      .mockResolvedValueOnce([])

    const service = new AtributoLegacyService()
    const estruturaAtualizada = { versaoId: 11, versaoNumero: 4, estrutura: [] }
    const sincronizarSpy = jest
      .spyOn(service, 'sincronizarEstrutura')
      .mockResolvedValue(estruturaAtualizada)

    const resultado = await service.buscarEstruturaAtualizada('12345678', 'IMPORTACAO')

    expect(sincronizarSpy).toHaveBeenCalledWith(
      '12345678',
      'IMPORTACAO',
      expect.any(Array)
    )
    expect(resultado).toBe(estruturaAtualizada)
  })
})
