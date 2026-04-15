import { ProdutoService } from '../produto.service'
import { AtributoEstruturaDTO } from '../atributo-legacy.service'
import { catalogoPrisma } from '../../utils/prisma'

const produtoResumoServiceMock = {
  recalcularResumoProduto: jest.fn(),
  removerResumoProduto: jest.fn()
}

function criarService() {
  return new ProdutoService(undefined, produtoResumoServiceMock as any)
}

beforeEach(() => {
  jest.clearAllMocks()
  produtoResumoServiceMock.recalcularResumoProduto.mockClear()
  produtoResumoServiceMock.removerResumoProduto.mockClear()
})

jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: {
    produto: { findFirst: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn()
  }
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
