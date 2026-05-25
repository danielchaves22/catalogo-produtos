import { normalizarAtributosProdutoPorVersao } from '../produto-atributo-normalizacao'
import { logger } from '../logger'

describe('normalizarAtributosProdutoPorVersao', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('mantem o atributo da versao ativa quando ha duplicidade por codigo', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger)

    const resultado = normalizarAtributosProdutoPorVersao(
      [
        {
          id: 1,
          atributoVersaoId: 586,
          atributo: { codigo: 'ATT_14545' },
        },
        {
          id: 2,
          atributoVersaoId: 704,
          atributo: { codigo: 'ATT_14545' },
        },
      ],
      {
        produtoId: 25627,
        versaoAtributoId: 586,
        origem: 'teste',
      }
    )

    expect(resultado).toHaveLength(1)
    expect(resultado[0].id).toBe(1)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('usa fallback para a maior versao e registra warning quando a versao ativa nao existe', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger)

    const resultado = normalizarAtributosProdutoPorVersao(
      [
        {
          id: 1,
          atributoVersaoId: 586,
          atributo: { codigo: 'ATT_14545' },
        },
        {
          id: 2,
          atributoVersaoId: 704,
          atributo: { codigo: 'ATT_14545' },
        },
      ],
      {
        produtoId: 25627,
        versaoAtributoId: 800,
        origem: 'teste',
      }
    )

    expect(resultado).toHaveLength(1)
    expect(resultado[0].id).toBe(2)
    expect(warnSpy).toHaveBeenCalledWith(
      'Duplicidade de atributo no produto sem correspondencia com a versao ativa',
      expect.objectContaining({
        produtoId: 25627,
        codigo: 'ATT_14545',
        versaoAtributoAtiva: 800,
        versaoSelecionada: 704,
      })
    )
  })
})
