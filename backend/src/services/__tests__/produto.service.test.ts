import { ProdutoService } from '../produto.service'
import { AtributoEstruturaDTO } from '../atributo-legacy.service'
import { catalogoPrisma } from '../../utils/prisma'
import { createAsyncJob } from '../../jobs/async-job.repository'

const produtoResumoServiceMock = {
  recalcularResumoProduto: jest.fn(),
  salvarResumoProduto: jest.fn(),
  removerResumoProduto: jest.fn()
}

function criarService() {
  return new ProdutoService(undefined, produtoResumoServiceMock as any)
}

beforeEach(() => {
  jest.clearAllMocks()
  produtoResumoServiceMock.recalcularResumoProduto.mockClear()
  produtoResumoServiceMock.salvarResumoProduto.mockClear()
  produtoResumoServiceMock.removerResumoProduto.mockClear()
})

jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: {
    produto: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    catalogo: { findFirst: jest.fn() },
    atributoVersao: { findMany: jest.fn() },
    asyncJob: { findFirst: jest.fn() },
    $transaction: jest.fn()
  }
}))

jest.mock('../../jobs/async-job.repository', () => ({
  createAsyncJob: jest.fn()
}))

describe('ProdutoService - atributos obrigatórios', () => {
  it('retorna verdadeiro quando todos obrigatórios preenchidos', () => {
    const service = criarService()
    const estrutura: AtributoEstruturaDTO[] = [
      { codigo: 'A', nome: 'A', tipo: 'TEXTO', obrigatorio: true, multivalorado: false, validacoes: {} },
      { codigo: 'B', nome: 'B', tipo: 'TEXTO', obrigatorio: true, multivalorado: false, validacoes: {} }
    ]
    const resultado = (service as any).todosObrigatoriosPreenchidos({ A: '1', B: '2' }, estrutura)
    expect(resultado).toBe(true)
  })

  it('retorna falso quando algum obrigatório não preenchido', () => {
    const service = criarService()
    const estrutura: AtributoEstruturaDTO[] = [
      { codigo: 'A', nome: 'A', tipo: 'TEXTO', obrigatorio: true, multivalorado: false, validacoes: {} },
      { codigo: 'B', nome: 'B', tipo: 'TEXTO', obrigatorio: true, multivalorado: false, validacoes: {} }
    ]
    const resultado = (service as any).todosObrigatoriosPreenchidos({ A: '1' }, estrutura)
    expect(resultado).toBe(false)
  })
})

describe('ProdutoService - criaÃ§Ã£o otimizada', () => {
  it('cria produto com atributos em nested create sem abrir transaction extra', async () => {
    const service = criarService()

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue({
      versaoId: 5,
      versaoNumero: 2,
      estrutura: [
        {
          id: 11,
          codigo: 'ATT_TESTE',
          nome: 'Teste',
          tipo: 'TEXTO',
          obrigatorio: false,
          multivalorado: false,
          validacoes: {}
        }
      ]
    })
    jest.spyOn(service, 'buscarPorId').mockResolvedValue({ id: 123 } as any)

    ;(catalogoPrisma.catalogo.findFirst as jest.Mock).mockResolvedValue({ id: 9 })
    ;(catalogoPrisma.produto.create as jest.Mock).mockResolvedValue({
      id: 123,
      codigo: 'SIS123',
      ncmCodigo: '12345678',
      modalidade: 'IMPORTACAO',
      denominacao: 'Produto teste',
      descricao: 'Produto teste',
      status: 'APROVADO',
      situacao: 'ATIVADO',
      catalogoId: 9
    })

    await service.criar(
      {
        codigo: 'SIS123',
        ncmCodigo: '12345678',
        modalidade: 'IMPORTACAO',
        catalogoId: 9,
        denominacao: 'Produto teste',
        descricao: 'Produto teste',
        valoresAtributos: { ATT_TESTE: 'VALOR' },
        codigosInternos: ['INT-1']
      },
      77
    )

    expect(catalogoPrisma.$transaction).not.toHaveBeenCalled()
    expect(catalogoPrisma.produto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APROVADO',
          situacao: undefined,
          codigosInternos: {
            create: [{ codigo: 'INT-1' }]
          },
          atributos: {
            create: [
              expect.objectContaining({
                atributo: { connect: { id: 11 } },
                versao: { connect: { id: 5 } },
                valores: {
                  create: [{ valorJson: 'VALOR', ordem: 0 }]
                }
              })
            ]
          }
        })
      })
    )
    expect(service.buscarPorId).toHaveBeenCalledWith(123, 77)
  })

  it('permite sobrescrever o status inicial para produtos importados do SISCOMEX', async () => {
    const service = criarService()

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue({
      versaoId: 5,
      versaoNumero: 2,
      estrutura: []
    })
    jest.spyOn(service, 'buscarPorId').mockResolvedValue({ id: 456 } as any)

    ;(catalogoPrisma.catalogo.findFirst as jest.Mock).mockResolvedValue({ id: 9 })
    ;(catalogoPrisma.produto.create as jest.Mock).mockResolvedValue({
      id: 456,
      codigo: 'SIS456',
      ncmCodigo: '12345678',
      modalidade: 'IMPORTACAO',
      denominacao: 'Produto SISCOMEX',
      descricao: 'Produto SISCOMEX',
      status: 'TRANSMITIDO',
      situacao: 'ATIVADO',
      catalogoId: 9
    })

    await service.criar(
      {
        codigo: 'SIS456',
        ncmCodigo: '12345678',
        modalidade: 'IMPORTACAO',
        catalogoId: 9,
        denominacao: 'Produto SISCOMEX',
        descricao: 'Produto SISCOMEX',
        status: 'TRANSMITIDO'
      },
      77
    )

    expect(catalogoPrisma.produto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'TRANSMITIDO' })
      })
    )
  })
})

describe('ProdutoService - clonagem', () => {
  const estruturaObrigatoria: AtributoEstruturaDTO[] = [
    {
      id: 11,
      codigo: 'ATT_OBR',
      nome: 'Obrigatorio',
      tipo: 'TEXTO',
      obrigatorio: true,
      multivalorado: false,
      validacoes: {}
    }
  ]

  function produtoOriginal(overrides: Record<string, any> = {}) {
    return {
      id: 1,
      codigo: 'SIS-1',
      versao: 7,
      status: 'TRANSMITIDO',
      situacao: 'DESATIVADO',
      ncmCodigo: '12345678',
      modalidade: 'IMPORTACAO',
      denominacao: 'Produto original',
      descricao: 'Descricao original',
      numero: 1,
      catalogoId: 9,
      versaoEstruturaAtributos: 2,
      versaoAtributoId: null,
      criadoPor: 'usuario',
      atributos: [
        {
          atributo: { codigo: 'ATT_OBR', multivalorado: false },
          valores: [{ valorJson: 'VALOR', ordem: 0 }]
        }
      ],
      codigosInternos: [],
      operadoresEstrangeiros: [],
      ...overrides
    }
  }

  function prepararClonagem(service: ProdutoService, original: Record<string, any>) {
    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue({
      versaoId: 5,
      versaoNumero: 2,
      estrutura: estruturaObrigatoria
    })
    jest.spyOn(service, 'buscarPorId').mockResolvedValue({ id: 999 } as any)

    ;(catalogoPrisma.produto.findFirst as jest.Mock).mockResolvedValue(original)
    ;(catalogoPrisma.catalogo.findFirst as jest.Mock).mockResolvedValue({ id: 9 })

    const produtoCreate = jest.fn().mockResolvedValue({ id: 999 })
    const produtoAtributoCreate = jest.fn().mockResolvedValue({})
    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        produto: { create: produtoCreate },
        produtoAtributo: { create: produtoAtributoCreate }
      })
    )

    return { produtoCreate, produtoAtributoCreate }
  }

  it('cria clone como rascunho aprovado quando obrigatorios estao preenchidos', async () => {
    const service = criarService()
    const { produtoCreate, produtoAtributoCreate } = prepararClonagem(
      service,
      produtoOriginal()
    )

    await service.clonar(
      1,
      { catalogoId: 9, denominacao: 'Produto clonado', codigosInternos: [' SKU-1 '] },
      77
    )

    expect(produtoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          codigo: null,
          versao: 1,
          status: 'APROVADO',
          situacao: 'RASCUNHO',
          denominacao: 'Produto clonado',
          codigosInternos: {
            create: [{ codigo: 'SKU-1' }]
          }
        })
      })
    )
    expect(produtoAtributoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          produtoId: 999,
          atributoId: 11,
          atributoVersaoId: 5,
          valores: {
            create: [{ valorJson: 'VALOR', ordem: 0 }]
          }
        })
      })
    )
  })

  it('cria clone como rascunho pendente quando faltam obrigatorios', async () => {
    const service = criarService()
    const { produtoCreate, produtoAtributoCreate } = prepararClonagem(
      service,
      produtoOriginal({ atributos: [] })
    )

    await service.clonar(1, { catalogoId: 9, denominacao: 'Produto clonado' }, 77)

    expect(produtoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          versao: 1,
          status: 'PENDENTE',
          situacao: 'RASCUNHO'
        })
      })
    )
    expect(produtoAtributoCreate).not.toHaveBeenCalled()
  })
})

describe('ProdutoService - detalhe do produto', () => {
  it('preserva o catalogo do operador estrangeiro no payload de edicao', async () => {
    const service = criarService()

    ;(catalogoPrisma.produto.findFirst as jest.Mock).mockResolvedValue({
      id: 123,
      numero: 10,
      versaoAtributoId: null,
      versaoEstruturaAtributos: null,
      catalogo: {
        id: 5,
        numero: 900,
        nome: 'Catálogo Teste',
        cpf_cnpj: '12.345.678/0001-99',
        ambiente: 'PRODUCAO',
      },
      atributos: [],
      codigosInternos: [],
      operadoresEstrangeiros: [
        {
          id: 1,
          paisCodigo: 'AR',
          conhecido: true,
          operadorEstrangeiroId: 77,
          pais: { nome: 'Argentina' },
          operadorEstrangeiro: {
            id: 77,
            nome: 'Fornecedor AR',
            tin: null,
            catalogo: {
              id: 5,
              cpf_cnpj: '12.345.678/0001-99',
              nome: 'Catálogo Teste',
              ambiente: 'PRODUCAO',
            },
          },
        },
      ],
    })

    const produto = await service.buscarPorId(123, 99)

    expect(produto?.operadoresEstrangeiros).toEqual([
      expect.objectContaining({
        operadorEstrangeiro: expect.objectContaining({
          id: 77,
          catalogo: expect.objectContaining({
            cpf_cnpj: '12.345.678/0001-99',
          }),
        }),
      }),
    ])
  })
})

describe('ProdutoService - atributos multivalorados', () => {
  it('considera arrays vazios como não preenchidos', () => {
    const service = criarService()
    const estrutura: AtributoEstruturaDTO[] = [
      {
        codigo: 'M',
        nome: 'Multi',
        tipo: 'LISTA_ESTATICA',
        obrigatorio: true,
        multivalorado: true,
        validacoes: {},
        dominio: [
          { codigo: '1', descricao: 'Um' },
          { codigo: '2', descricao: 'Dois' }
        ]
      }
    ]

    expect((service as any).todosObrigatoriosPreenchidos({ M: ['1'] }, estrutura)).toBe(true)
    expect((service as any).todosObrigatoriosPreenchidos({ M: [] }, estrutura)).toBe(false)
  })

  it('avalia condições com qualquer valor selecionado', () => {
    const service = criarService()
    const estrutura: AtributoEstruturaDTO[] = [
      {
        codigo: 'M',
        nome: 'Multi',
        tipo: 'LISTA_ESTATICA',
        obrigatorio: true,
        multivalorado: true,
        validacoes: {},
        dominio: [
          { codigo: '1', descricao: 'Um' },
          { codigo: '2', descricao: 'Dois' }
        ]
      },
      {
        codigo: 'D',
        nome: 'Dependente',
        tipo: 'TEXTO',
        obrigatorio: true,
        multivalorado: false,
        validacoes: {},
        parentCodigo: 'M',
        condicao: { operador: '==', valor: '2' }
      }
    ]

    expect((service as any).todosObrigatoriosPreenchidos({ M: ['1', '2'], D: 'ok' }, estrutura)).toBe(true)
    expect((service as any).todosObrigatoriosPreenchidos({ M: ['1', '2'] }, estrutura)).toBe(false)
    expect((service as any).todosObrigatoriosPreenchidos({ M: ['1'] }, estrutura)).toBe(true)
  })

  it('valida cada item do array contra o domínio', () => {
    const service = criarService()
    const estrutura: AtributoEstruturaDTO[] = [
      {
        codigo: 'M',
        nome: 'Multi',
        tipo: 'LISTA_ESTATICA',
        obrigatorio: true,
        multivalorado: true,
        validacoes: {},
        dominio: [
          { codigo: '1', descricao: 'Um' },
          { codigo: '2', descricao: 'Dois' }
        ]
      }
    ]

    expect((service as any).validarValores({ M: ['1', '2'] }, estrutura)).toEqual({})
    expect((service as any).validarValores({ M: ['1', '3'] }, estrutura)).toEqual({ M: 'Valor fora do domínio' })
  })
})

describe('ProdutoService - atualização de status', () => {
  it('marca como PENDENTE quando faltam atributos obrigatórios', async () => {
    const service = criarService()
    const estrutura: AtributoEstruturaDTO[] = [
      { codigo: 'A', nome: 'A', tipo: 'TEXTO', obrigatorio: true, multivalorado: false, validacoes: {} }
    ]

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue({
      versaoId: 1,
      versaoNumero: 1,
      estrutura,
    })
    jest.spyOn(service, 'buscarPorId').mockResolvedValue({} as any)

    ;(catalogoPrisma.produto.findFirst as jest.Mock).mockResolvedValue({
      id: 1,
      status: 'APROVADO',
      ncmCodigo: '001',
      modalidade: '',
      atributos: [
        {
          atributo: { codigo: 'A', multivalorado: false },
          valores: [{ valorJson: '1', ordem: 0 }]
        }
      ],
      versaoAtributoId: 1
    })

    const updateSpy = jest.fn().mockResolvedValue({ count: 1 })
    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        produto: { updateMany: updateSpy, findFirst: jest.fn().mockResolvedValue({}) },
        produtoAtributo: { deleteMany: jest.fn(), create: jest.fn() },
        produtoAtributoValor: { createMany: jest.fn() },
        codigoInternoProduto: { deleteMany: jest.fn(), createMany: jest.fn() },
        operadorEstrangeiroProduto: { deleteMany: jest.fn(), createMany: jest.fn() }
      })
    )

    await service.atualizar(1, { valoresAtributos: {} }, 1)

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDENTE' })
      })
    )
  })
  it('marca como APROVADO quando produto em AJUSTAR_ESTRUTURA passa a ter obrigatorios completos', async () => {
    const service = criarService()
    const estrutura: AtributoEstruturaDTO[] = [
      { codigo: 'A', nome: 'A', tipo: 'TEXTO', obrigatorio: true, multivalorado: false, validacoes: {} }
    ]

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue({
      versaoId: 1,
      versaoNumero: 1,
      estrutura,
    })
    jest.spyOn(service, 'buscarPorId').mockResolvedValue({} as any)

    ;(catalogoPrisma.produto.findFirst as jest.Mock).mockResolvedValue({
      id: 1,
      status: 'AJUSTAR_ESTRUTURA',
      situacao: 'RASCUNHO',
      catalogoId: 1,
      ncmCodigo: '001',
      modalidade: '',
      atributos: [],
      codigosInternos: [],
      operadoresEstrangeiros: [],
      versaoAtributoId: 1
    })

    const updateSpy = jest.fn().mockResolvedValue({ count: 1 })
    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        produto: { updateMany: updateSpy, findFirst: jest.fn().mockResolvedValue({}) },
        produtoAtributo: { deleteMany: jest.fn(), create: jest.fn() },
        produtoAtributoValor: { createMany: jest.fn() },
        codigoInternoProduto: { deleteMany: jest.fn(), createMany: jest.fn() },
        operadorEstrangeiroProduto: { deleteMany: jest.fn(), createMany: jest.fn() }
      })
    )

    await service.atualizar(1, { valoresAtributos: { A: '1' } }, 1)

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APROVADO' })
      })
    )
  })
})

describe('ProdutoService - solicitacao de ajuste assincrono', () => {
  it('cria um novo job para ajuste por catalogo quando nao ha processo ativo equivalente', async () => {
    const service = criarService()

    ;(catalogoPrisma.produto.findFirst as jest.Mock).mockResolvedValue({ id: 10 })
    ;(catalogoPrisma.asyncJob.findFirst as jest.Mock).mockResolvedValue(null)
    ;(createAsyncJob as jest.Mock).mockResolvedValue({ id: 321, status: 'PENDENTE' })

    const resultado = await service.solicitarAjusteEstruturaCatalogo(
      { ncmCodigo: '12345678', modalidade: '', catalogoId: 7 },
      99
    )

    expect(createAsyncJob).toHaveBeenCalledWith({
      tipo: 'AJUSTE_ESTRUTURA_CATALOGO',
      payload: {
        superUserId: 99,
        catalogoId: 7,
        ncmCodigo: '12345678',
        modalidade: '',
      },
      prioridade: 1,
    })
    expect(resultado).toEqual({
      jobId: 321,
      reutilizado: false,
      status: 'PENDENTE',
    })
  })

  it('reutiliza job ativo equivalente para evitar duplicidade na fila', async () => {
    const service = criarService()

    ;(catalogoPrisma.produto.findFirst as jest.Mock).mockResolvedValue({ id: 10 })
    ;(catalogoPrisma.asyncJob.findFirst as jest.Mock).mockResolvedValue({
      id: 654,
      status: 'PROCESSANDO',
    })

    const resultado = await service.solicitarAjusteEstruturaCatalogo(
      { ncmCodigo: '12345678', modalidade: '', catalogoId: 7 },
      99
    )

    expect(createAsyncJob).not.toHaveBeenCalled()
    expect(resultado).toEqual({
      jobId: 654,
      reutilizado: true,
      status: 'PROCESSANDO',
    })
  })
})

describe('ProdutoService - correcao de status de ajuste de estrutura', () => {
  it('enfileira o job administrativo de correcao quando existem produtos candidatos', async () => {
    const service = criarService()

    ;(catalogoPrisma.produto.count as jest.Mock).mockResolvedValue(2)
    ;(createAsyncJob as jest.Mock).mockResolvedValue({ id: 777, status: 'PENDENTE' })

    const resultado = await service.solicitarCorrecaoStatusAjusteEstrutura(
      { produtoIds: [10, 11, 10] },
      99
    )

    expect(createAsyncJob).toHaveBeenCalledWith({
      tipo: 'CORRECAO_STATUS_AJUSTE_ESTRUTURA',
      payload: {
        superUserId: 99,
        quantidadeInicialAjustarEstrutura: 2,
        produtoIds: [10, 11],
      },
      prioridade: 1,
    })
    expect(resultado).toEqual({
      jobId: 777,
      status: 'PENDENTE',
    })
  })

  it('restaura para TRANSMITIDO e sincroniza a versao quando nao ha impacto real', async () => {
    const service = criarService()

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue({
      versaoId: 2,
      versaoNumero: 2,
      estrutura: [
        {
          id: 22,
          codigo: 'A',
          nome: 'Atributo A',
          tipo: 'TEXTO',
          obrigatorio: false,
          multivalorado: false,
          validacoes: {},
        },
      ],
    })
    jest.spyOn(service as any, 'buscarEstruturaPorVersaoComCache').mockResolvedValue({
      versaoId: 1,
      versaoNumero: 1,
      estrutura: [
        {
          id: 11,
          codigo: 'A',
          nome: 'Atributo A',
          tipo: 'TEXTO',
          obrigatorio: false,
          multivalorado: false,
          validacoes: {},
        },
      ],
    })
    jest.spyOn(service as any, 'diagnosticarImpactoAjusteEstrutura').mockReturnValue({
      impactado: false,
      valoresProjetados: { A: 'VALOR' },
      resumoProjetado: {
        atributosTotal: 1,
        obrigatoriosPendentes: 0,
        validosTransmissao: 1,
      },
    })

    ;(catalogoPrisma.produto.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 10 }])
      .mockResolvedValueOnce([
        {
          id: 10,
          catalogoId: 7,
          status: 'AJUSTAR_ESTRUTURA',
          situacao: 'ATIVADO',
          codigo: 'SIS123',
          ncmCodigo: '12345678',
          modalidade: 'IMPORTACAO',
          versaoAtributoId: 1,
          versaoEstruturaAtributos: 1,
          atributos: [],
        },
      ])

    const deleteManySpy = jest.fn().mockResolvedValue({ count: 0 })
    const createSpy = jest.fn().mockResolvedValue({})
    const updateSpy = jest.fn().mockResolvedValue({})
    produtoResumoServiceMock.salvarResumoProduto.mockResolvedValue(undefined)

    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        produto: { update: updateSpy },
        produtoAtributo: { deleteMany: deleteManySpy, create: createSpy },
      })
    )

    const resultado = await service.corrigirStatusAjusteEstruturaProdutos({}, 99)

    expect(deleteManySpy).toHaveBeenCalledWith({ where: { produtoId: 10 } })
    expect(createSpy).toHaveBeenCalledWith({
      data: {
        produtoId: 10,
        atributoId: 22,
        atributoVersaoId: 2,
        valores: {
          create: [{ valorJson: 'VALOR', ordem: 0 }],
        },
      },
    })
    expect(updateSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 10 },
        data: {
          versaoAtributoId: 2,
          versaoEstruturaAtributos: 2,
        },
      })
    )
    expect(updateSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 10 },
        data: { status: 'TRANSMITIDO' },
      })
    )
    expect(resultado).toEqual({
      totalAnalisados: 1,
      mantidosAjuste: 0,
      restauradosPendente: 0,
      restauradosAprovado: 0,
      restauradosTransmitido: 1,
      sincronizadosVersao: 1,
    })
  })

  it('mantem AJUSTAR_ESTRUTURA quando a ultima mudanca realmente impacta o produto', async () => {
    const service = criarService()

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue({
      versaoId: 2,
      versaoNumero: 2,
      estrutura: [],
    })
    jest.spyOn(service as any, 'buscarEstruturaPorVersaoComCache').mockResolvedValue({
      versaoId: 1,
      versaoNumero: 1,
      estrutura: [],
    })
    jest.spyOn(service as any, 'diagnosticarImpactoAjusteEstrutura').mockReturnValue({
      impactado: true,
      valoresProjetados: {},
      resumoProjetado: {
        atributosTotal: 0,
        obrigatoriosPendentes: 1,
        validosTransmissao: 0,
      },
    })

    ;(catalogoPrisma.produto.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 10 }])
      .mockResolvedValueOnce([
        {
          id: 10,
          catalogoId: 7,
          status: 'AJUSTAR_ESTRUTURA',
          situacao: 'RASCUNHO',
          codigo: null,
          ncmCodigo: '12345678',
          modalidade: 'IMPORTACAO',
          versaoAtributoId: 1,
          versaoEstruturaAtributos: 1,
          atributos: [],
        },
      ])

    const resultado = await service.corrigirStatusAjusteEstruturaProdutos({}, 99)

    expect(catalogoPrisma.$transaction).not.toHaveBeenCalled()
    expect(resultado).toEqual({
      totalAnalisados: 1,
      mantidosAjuste: 1,
      restauradosPendente: 0,
      restauradosAprovado: 0,
      restauradosTransmitido: 0,
      sincronizadosVersao: 0,
    })
  })
})

describe('ProdutoService - ajuste de estrutura', () => {
  it('promove para APROVADO quando nao ha obrigatorios pendentes apos ajustar', async () => {
    const service = criarService()

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue({
      versaoId: 7,
      versaoNumero: 3,
      estrutura: []
    })
    produtoResumoServiceMock.recalcularResumoProduto.mockResolvedValue({
      atributosTotal: 0,
      obrigatoriosPendentes: 0,
      validosTransmissao: 0
    })

    ;(catalogoPrisma.produto.findMany as jest.Mock).mockResolvedValue([
      {
        id: 10,
        status: 'AJUSTAR_ESTRUTURA',
        ncmCodigo: '12345678',
        modalidade: '',
        denominacao: 'Produto teste',
        atributos: []
      }
    ])

    const updateSpy = jest.fn().mockResolvedValue({})
    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        produto: { update: updateSpy },
        produtoAtributo: { deleteMany: jest.fn(), create: jest.fn() }
      })
    )

    const resultado = await service.ajustarEstruturaCatalogo(
      { ncmCodigo: '12345678', modalidade: '', catalogoId: 1 },
      99
    )

    expect(resultado).toEqual({
      ajustados: 1,
      transmissaoGerada: null,
      produtosElegiveis: 0,
      produtosIncluidos: 0,
      produtosIgnoradosDuplicidade: 0,
    })
    expect(updateSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: { status: 'APROVADO' }
      })
    )
  })

  it('emite heartbeat durante o ajuste quando executado por job assincrono', async () => {
    const service = criarService()
    const heartbeat = jest.fn().mockResolvedValue(undefined)

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue({
      versaoId: 7,
      versaoNumero: 3,
      estrutura: []
    })
    produtoResumoServiceMock.recalcularResumoProduto.mockResolvedValue({
      atributosTotal: 0,
      obrigatoriosPendentes: 0,
      validosTransmissao: 0
    })

    ;(catalogoPrisma.produto.findMany as jest.Mock).mockResolvedValue([
      {
        id: 10,
        status: 'AJUSTAR_ESTRUTURA',
        situacao: 'RASCUNHO',
        ncmCodigo: '12345678',
        modalidade: '',
        denominacao: 'Produto teste',
        atributos: []
      }
    ])

    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        produto: { update: jest.fn().mockResolvedValue({}) },
        produtoAtributo: { deleteMany: jest.fn(), create: jest.fn() }
      })
    )

    await service.ajustarEstruturaCatalogo(
      { ncmCodigo: '12345678', modalidade: '', catalogoId: 1 },
      99,
      { onHeartbeat: heartbeat }
    )

    expect(heartbeat).toHaveBeenCalledTimes(2)
  })

  it('mantem PENDENTE quando ainda faltam obrigatorios apos ajustar', async () => {
    const service = criarService()

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue({
      versaoId: 7,
      versaoNumero: 3,
      estrutura: [
        {
          id: 70,
          codigo: 'ATT_OBRIGATORIO',
          nome: 'Obrigatorio',
          tipo: 'TEXTO',
          obrigatorio: true,
          multivalorado: false,
          validacoes: {}
        }
      ]
    })

    ;(catalogoPrisma.produto.findMany as jest.Mock).mockResolvedValue([
      {
        id: 11,
        status: 'AJUSTAR_ESTRUTURA',
        ncmCodigo: '12345678',
        modalidade: '',
        denominacao: 'Produto pendente',
        atributos: []
      }
    ])

    const updateSpy = jest.fn().mockResolvedValue({})
    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        produto: { update: updateSpy },
        produtoAtributo: { deleteMany: jest.fn(), create: jest.fn() }
      })
    )

    await service.ajustarEstruturaCatalogo(
      { ncmCodigo: '12345678', modalidade: '', catalogoId: 1 },
      99
    )

    expect(updateSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: { status: 'PENDENTE' }
      })
    )
  })

  it('reaproveita os valores da versao ativa ao reconstruir atributos no ajuste', async () => {
    const service = criarService()
    const estruturaInfo = {
      versaoId: 704,
      versaoNumero: 4,
      estrutura: [
        {
          id: 9306,
          codigo: 'ATT_14545',
          nome: 'Categoria regulatÃ³ria - Anvisa',
          tipo: 'LISTA_ESTATICA',
          obrigatorio: true,
          multivalorado: false,
          validacoes: {}
        }
      ]
    }

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue(estruturaInfo)
    const salvarValoresSpy = jest.spyOn(service as any, 'salvarValoresProduto').mockResolvedValue(undefined)
    produtoResumoServiceMock.recalcularResumoProduto.mockResolvedValue({
      atributosTotal: 1,
      obrigatoriosPendentes: 0,
      validosTransmissao: 1
    })

    ;(catalogoPrisma.produto.findMany as jest.Mock).mockResolvedValue([
      {
        id: 12,
        status: 'AJUSTAR_ESTRUTURA',
        versaoAtributoId: 586,
        ncmCodigo: '12345678',
        modalidade: '',
        denominacao: 'Produto legado',
        atributos: [
          {
            id: 100,
            atributoVersaoId: 586,
            atributo: { codigo: 'ATT_14545', multivalorado: false },
            valores: [{ valorJson: 'VALOR_ATIVO', ordem: 0 }]
          },
          {
            id: 101,
            atributoVersaoId: 704,
            atributo: { codigo: 'ATT_14545', multivalorado: false },
            valores: [{ valorJson: 'VALOR_LEGADO_DUPLICADO', ordem: 0 }]
          }
        ]
      }
    ])

    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        produto: { update: jest.fn().mockResolvedValue({}) },
        produtoAtributo: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }), create: jest.fn() }
      })
    )

    await service.ajustarEstruturaCatalogo(
      { ncmCodigo: '12345678', modalidade: '', catalogoId: 1 },
      99
    )

    expect(salvarValoresSpy).toHaveBeenCalledWith(
      expect.anything(),
      12,
      estruturaInfo,
      { ATT_14545: 'VALOR_ATIVO' }
    )
  })

  it('busca produtos com modalidade nula quando o ajuste chega com modalidade vazia', async () => {
    const service = criarService()

    ;(catalogoPrisma.produto.findMany as jest.Mock).mockResolvedValue([])

    await expect(
      service.ajustarEstruturaCatalogo(
        { ncmCodigo: '12345678', modalidade: '', catalogoId: 1 },
        99
      )
    ).rejects.toThrow('Nenhum produto pendente encontrado para o catálogo informado.')

    expect(catalogoPrisma.produto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ modalidade: null }, { modalidade: '' }]
        })
      })
    )
  })

  it('cria pre-transmissao automatica para produtos ativados que voltam a APROVADO', async () => {
    const service = criarService()

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue({
      versaoId: 7,
      versaoNumero: 3,
      estrutura: []
    })
    produtoResumoServiceMock.recalcularResumoProduto.mockResolvedValue({
      atributosTotal: 0,
      obrigatoriosPendentes: 0,
      validosTransmissao: 0
    })

    ;(catalogoPrisma.produto.findMany as jest.Mock).mockResolvedValue([
      {
        id: 21,
        status: 'AJUSTAR_ESTRUTURA',
        situacao: 'ATIVADO',
        ncmCodigo: '12345678',
        modalidade: 'IMPORTACAO',
        denominacao: 'Produto pronto para retransmissao',
        atributos: []
      }
    ])

    const updateSpy = jest.fn().mockResolvedValue({})
    const transmissaoCreateSpy = jest.fn().mockResolvedValue({ id: 501 })
    const transmissaoItemCreateManySpy = jest.fn().mockResolvedValue({ count: 1 })

    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        produto: { update: updateSpy },
        produtoAtributo: { deleteMany: jest.fn(), create: jest.fn() },
        produtoTransmissao: { create: transmissaoCreateSpy },
        produtoTransmissaoItem: {
          findMany: jest.fn().mockResolvedValue([]),
          createMany: transmissaoItemCreateManySpy,
        }
      })
    )

    const resultado = await service.ajustarEstruturaCatalogo(
      { ncmCodigo: '12345678', modalidade: 'IMPORTACAO', catalogoId: 1 },
      99
    )

    expect(resultado).toEqual({
      ajustados: 1,
      transmissaoGerada: { id: 501, totalItens: 1 },
      produtosElegiveis: 1,
      produtosIncluidos: 1,
      produtosIgnoradosDuplicidade: 0,
    })
    expect(transmissaoCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          superUserId: 99,
          catalogoId: 1,
          status: 'AGUARDANDO_CONFIRMACAO',
          origemTipo: 'AJUSTE_ESTRUTURA',
          modalidade: 'PRODUTOS',
          totalItens: 1,
          selecaoJson: [21],
          origemContextoJson: expect.objectContaining({
            ncmCodigo: '12345678',
            modalidade: 'IMPORTACAO',
            catalogoId: 1,
            produtoIdsElegiveis: [21],
            produtoIdsIgnoradosDuplicidade: [],
          }),
        })
      })
    )
    expect(transmissaoItemCreateManySpy).toHaveBeenCalledWith({
      data: [
        {
          transmissaoId: 501,
          produtoId: 21,
          operacao: 'NOVA_VERSAO',
          status: 'PENDENTE',
        }
      ]
    })
  })

  it('nao cria pre-transmissao automatica para produto em rascunho apos o ajuste', async () => {
    const service = criarService()

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue({
      versaoId: 7,
      versaoNumero: 3,
      estrutura: []
    })
    produtoResumoServiceMock.recalcularResumoProduto.mockResolvedValue({
      atributosTotal: 0,
      obrigatoriosPendentes: 0,
      validosTransmissao: 0
    })

    ;(catalogoPrisma.produto.findMany as jest.Mock).mockResolvedValue([
      {
        id: 22,
        status: 'AJUSTAR_ESTRUTURA',
        situacao: 'RASCUNHO',
        ncmCodigo: '12345678',
        modalidade: '',
        denominacao: 'Produto em rascunho',
        atributos: []
      }
    ])

    const transmissaoCreateSpy = jest.fn().mockResolvedValue({ id: 999 })

    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        produto: { update: jest.fn().mockResolvedValue({}) },
        produtoAtributo: { deleteMany: jest.fn(), create: jest.fn() },
        produtoTransmissao: { create: transmissaoCreateSpy },
        produtoTransmissaoItem: {
          findMany: jest.fn().mockResolvedValue([]),
          createMany: jest.fn().mockResolvedValue({ count: 0 }),
        }
      })
    )

    const resultado = await service.ajustarEstruturaCatalogo(
      { ncmCodigo: '12345678', modalidade: '', catalogoId: 1 },
      99
    )

    expect(resultado).toEqual({
      ajustados: 1,
      transmissaoGerada: null,
      produtosElegiveis: 0,
      produtosIncluidos: 0,
      produtosIgnoradosDuplicidade: 0,
    })
    expect(transmissaoCreateSpy).not.toHaveBeenCalled()
  })

  it('ignora produtos ja pendentes em outra pre-transmissao do mesmo catalogo', async () => {
    const service = criarService()

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue({
      versaoId: 7,
      versaoNumero: 3,
      estrutura: []
    })
    produtoResumoServiceMock.recalcularResumoProduto.mockResolvedValue({
      atributosTotal: 0,
      obrigatoriosPendentes: 0,
      validosTransmissao: 0
    })

    ;(catalogoPrisma.produto.findMany as jest.Mock).mockResolvedValue([
      {
        id: 31,
        status: 'AJUSTAR_ESTRUTURA',
        situacao: 'ATIVADO',
        ncmCodigo: '12345678',
        modalidade: '',
        denominacao: 'Produto 31',
        atributos: []
      },
      {
        id: 32,
        status: 'AJUSTAR_ESTRUTURA',
        situacao: 'ATIVADO',
        ncmCodigo: '12345678',
        modalidade: '',
        denominacao: 'Produto 32',
        atributos: []
      }
    ])

    const transmissaoCreateSpy = jest.fn().mockResolvedValue({ id: 601 })
    const transmissaoItemCreateManySpy = jest.fn().mockResolvedValue({ count: 1 })

    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        produto: { update: jest.fn().mockResolvedValue({}) },
        produtoAtributo: { deleteMany: jest.fn(), create: jest.fn() },
        produtoTransmissao: { create: transmissaoCreateSpy },
        produtoTransmissaoItem: {
          findMany: jest.fn().mockResolvedValue([{ produtoId: 31 }]),
          createMany: transmissaoItemCreateManySpy,
        }
      })
    )

    const resultado = await service.ajustarEstruturaCatalogo(
      { ncmCodigo: '12345678', modalidade: '', catalogoId: 1 },
      99
    )

    expect(resultado).toEqual({
      ajustados: 2,
      transmissaoGerada: { id: 601, totalItens: 1 },
      produtosElegiveis: 2,
      produtosIncluidos: 1,
      produtosIgnoradosDuplicidade: 1,
    })
    expect(transmissaoCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          selecaoJson: [32],
          origemContextoJson: expect.objectContaining({
            produtoIdsElegiveis: [31, 32],
            produtoIdsIgnoradosDuplicidade: [31],
          }),
        })
      })
    )
    expect(transmissaoItemCreateManySpy).toHaveBeenCalledWith({
      data: [
        {
          transmissaoId: 601,
          produtoId: 32,
          operacao: 'NOVA_VERSAO',
          status: 'PENDENTE',
        }
      ]
    })
  })

  it('nao cria transmissao quando todos os elegiveis ja estao em outra pre-transmissao', async () => {
    const service = criarService()

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue({
      versaoId: 7,
      versaoNumero: 3,
      estrutura: []
    })
    produtoResumoServiceMock.recalcularResumoProduto.mockResolvedValue({
      atributosTotal: 0,
      obrigatoriosPendentes: 0,
      validosTransmissao: 0
    })

    ;(catalogoPrisma.produto.findMany as jest.Mock).mockResolvedValue([
      {
        id: 41,
        status: 'AJUSTAR_ESTRUTURA',
        situacao: 'ATIVADO',
        ncmCodigo: '12345678',
        modalidade: '',
        denominacao: 'Produto duplicado',
        atributos: []
      }
    ])

    const transmissaoCreateSpy = jest.fn().mockResolvedValue({ id: 701 })

    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        produto: { update: jest.fn().mockResolvedValue({}) },
        produtoAtributo: { deleteMany: jest.fn(), create: jest.fn() },
        produtoTransmissao: { create: transmissaoCreateSpy },
        produtoTransmissaoItem: {
          findMany: jest.fn().mockResolvedValue([{ produtoId: 41 }]),
          createMany: jest.fn().mockResolvedValue({ count: 0 }),
        }
      })
    )

    const resultado = await service.ajustarEstruturaCatalogo(
      { ncmCodigo: '12345678', modalidade: '', catalogoId: 1 },
      99
    )

    expect(resultado).toEqual({
      ajustados: 1,
      transmissaoGerada: null,
      produtosElegiveis: 1,
      produtosIncluidos: 0,
      produtosIgnoradosDuplicidade: 1,
    })
    expect(transmissaoCreateSpy).not.toHaveBeenCalled()
  })
})

describe('ProdutoService - saneamento de pendencias de ajuste de estrutura', () => {
  it('normaliza automaticamente produtos ja alinhados com a versao vigente', async () => {
    const service = criarService()

    ;(catalogoPrisma.produto.findMany as jest.Mock).mockResolvedValue([
      {
        id: 81,
        denominacao: 'Produto alinhado',
        ncmCodigo: '12345678',
        modalidade: 'IMPORTACAO',
        catalogoId: 3,
        versaoEstruturaAtributos: 5,
        versaoAtributoId: 77,
        catalogo: { nome: 'Catalogo 3' }
      }
    ])
    ;(catalogoPrisma.atributoVersao.findMany as jest.Mock).mockResolvedValue([
      {
        id: 77,
        ncmCodigo: '12345678',
        modalidade: 'IMPORTACAO',
        versao: 5
      }
    ])

    produtoResumoServiceMock.recalcularResumoProduto.mockResolvedValue({
      atributosTotal: 0,
      obrigatoriosPendentes: 0,
      validosTransmissao: 0
    })

    const updateSpy = jest.fn().mockResolvedValue({})
    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        produto: { update: updateSpy }
      })
    )

    const total = await service.contarPendenciasAjusteEstrutura(99)

    expect(total).toBe(0)
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 81 },
      data: { status: 'APROVADO' }
    })
  })

  it('mantem a pendencia quando o produto ainda esta em versao anterior', async () => {
    const service = criarService()
    const resultadosSemDivergencia = Buffer.from(
      JSON.stringify([
        {
          ncmCodigo: '12345678',
          modalidade: 'IMPORTACAO',
          divergente: false
        }
      ]),
      'utf8'
    ).toString('base64')

    ;(catalogoPrisma.produto.findMany as jest.Mock).mockResolvedValue([
      {
        id: 82,
        denominacao: 'Produto pendente',
        ncmCodigo: '12345678',
        modalidade: 'IMPORTACAO',
        catalogoId: 3,
        versaoEstruturaAtributos: 4,
        versaoAtributoId: 70,
        catalogo: { nome: 'Catalogo 3' }
      }
    ])
    ;(catalogoPrisma.atributoVersao.findMany as jest.Mock).mockResolvedValue([
      {
        id: 77,
        ncmCodigo: '12345678',
        modalidade: 'IMPORTACAO',
        versao: 5
      }
    ])
    ;(catalogoPrisma.asyncJob.findFirst as jest.Mock).mockResolvedValue({
      arquivo: { conteudoBase64: resultadosSemDivergencia }
    })

    const resultado = await service.listarPendenciasAjusteEstruturaDetalhadas(99)

    expect(catalogoPrisma.$transaction).not.toHaveBeenCalled()
    expect(resultado).toEqual({
      itens: [
        {
          ncmCodigo: '12345678',
          modalidade: 'IMPORTACAO',
          diferencas: undefined,
          catalogos: [
            {
              catalogoId: 3,
              catalogoNome: 'Catalogo 3',
              produtos: [{ id: 82, denominacao: 'Produto pendente' }]
            }
          ]
        }
      ],
      totalProdutos: 1
    })
  })
})

describe('ProdutoService - cache da estrutura de atributos', () => {
  beforeEach(() => {
    ProdutoService.limparCacheEstrutura()
  })

  it('reutiliza estrutura já carregada para a mesma combinação', async () => {
    const estruturaMock = { versaoId: 1, versaoNumero: 1, estrutura: [] } as any
    const buscarEstrutura = jest.fn().mockResolvedValue(estruturaMock)
    const service = new ProdutoService({ buscarEstrutura } as any)

    const primeira = await (service as any).obterEstruturaAtributos('12345678', 'IMPORTACAO')
    const segunda = await (service as any).obterEstruturaAtributos('12345678', 'IMPORTACAO')

    expect(buscarEstrutura).toHaveBeenCalledTimes(1)
    expect(segunda).toBe(primeira)
  })

  it('limpa cache ao invalidar combinação sincronizada novamente', async () => {
    const estruturaInicial = { versaoId: 1, versaoNumero: 1, estrutura: [] } as any
    const estruturaAtualizada = { versaoId: 2, versaoNumero: 2, estrutura: [] } as any
    const buscarEstrutura = jest
      .fn()
      .mockResolvedValueOnce(estruturaInicial)
      .mockResolvedValueOnce(estruturaAtualizada)
    const service = new ProdutoService({ buscarEstrutura } as any)

    await (service as any).obterEstruturaAtributos('12345678', 'IMPORTACAO')
    ;(ProdutoService as any).invalidarEstruturaCache('12345678', 'IMPORTACAO')
    const aposInvalidacao = await (service as any).obterEstruturaAtributos('12345678', 'IMPORTACAO')

    expect(buscarEstrutura).toHaveBeenCalledTimes(2)
    expect(aposInvalidacao).toBe(estruturaAtualizada)
  })
})

describe('ProdutoService - bloqueio de alteracao para produto desativado', () => {
  it('impede atualizacao quando situacao local e DESATIVADO', async () => {
    const service = criarService()

    ;(catalogoPrisma.produto.findFirst as jest.Mock).mockResolvedValue({
      id: 1,
      situacao: 'DESATIVADO',
      ncmCodigo: '12345678',
      catalogoId: 1,
      modalidade: 'IMPORTACAO',
      atributos: [],
      codigosInternos: [],
      operadoresEstrangeiros: [],
    })

    await expect(service.atualizar(1, { denominacao: 'Teste' }, 1)).rejects.toThrow(
      'Produto desativado nao pode ser alterado'
    )
  })
})

describe('ProdutoService - exclusao com elegibilidade', () => {
  it('remove produto rascunho sem codigo SISCOMEX', async () => {
    const service = criarService()

    const tx = {
      produto: {
        findFirst: jest.fn().mockResolvedValue({ id: 10, codigo: null, situacao: 'RASCUNHO' }),
        delete: jest.fn().mockResolvedValue({}),
      },
      produtoAtributo: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    }

    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => callback(tx))

    await service.remover(10, 1)

    expect(tx.produto.delete).toHaveBeenCalledWith({ where: { id: 10 } })
    expect(produtoResumoServiceMock.removerResumoProduto).toHaveBeenCalledWith(10, tx)
  })

  it('bloqueia exclusao individual de produto transmitido', async () => {
    const service = criarService()

    const tx = {
      produto: {
        findFirst: jest.fn().mockResolvedValue({ id: 11, codigo: 'ABC123', situacao: 'ATIVADO' }),
        delete: jest.fn().mockResolvedValue({}),
      },
      produtoAtributo: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    }

    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => callback(tx))

    await expect(service.remover(11, 1)).rejects.toThrow(
      'Produto transmitido nao pode ser excluido. Utilize a inativacao no SISCOMEX.'
    )
    expect(tx.produto.delete).not.toHaveBeenCalled()
  })

  it('remove somente elegiveis em exclusao em massa mista e retorna bloqueados', async () => {
    const service = criarService()

    ;(catalogoPrisma.produto.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }])
      .mockResolvedValueOnce([
        { id: 1, codigo: null, situacao: 'RASCUNHO' },
        { id: 2, codigo: 'COD-2', situacao: 'ATIVADO' },
        { id: 3, codigo: null, situacao: 'ATIVADO' },
      ])

    const tx = {
      produtoAtributo: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      codigoInternoProduto: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      operadorEstrangeiroProduto: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      produto: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    }

    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => callback(tx))

    const resultado = await service.removerEmMassa(
      {
        todosFiltrados: false,
        idsSelecionados: [1, 2, 3],
      },
      1
    )

    expect(resultado).toEqual({
      removidos: 2,
      bloqueados: [
        {
          id: 2,
          motivo: 'Produto transmitido nao pode ser excluido. Utilize a inativacao no SISCOMEX.',
        },
      ],
      totalSolicitado: 3,
    })
    expect(tx.produto.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [1, 3] } } })
  })

  it('retorna erro quando nenhum produto da selecao e elegivel', async () => {
    const service = criarService()

    ;(catalogoPrisma.produto.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 20 }])
      .mockResolvedValueOnce([{ id: 20, codigo: 'COD-20', situacao: 'ATIVADO' }])

    await expect(
      service.removerEmMassa(
        {
          todosFiltrados: false,
          idsSelecionados: [20],
        },
        1
      )
    ).rejects.toThrow('Nenhum produto elegivel para exclusao na selecao informada.')
  })
})
