import { catalogoPrisma } from '../../utils/prisma'
import { ProdutoInativacaoService } from '../produto-inativacao.service'

jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: {
    produto: {
      findFirst: jest.fn(),
    },
  },
}))

function criarErroSiscomex(message: string, status?: number) {
  const erro = new Error(message) as Error & { siscomexDetalhes?: { status?: number } }
  erro.siscomexDetalhes = { status }
  return erro
}

describe('ProdutoInativacaoService', () => {
  const catalogoServiceMock = {
    buscarPorId: jest.fn(),
  }

  const certificadoServiceMock = {
    obterParaCatalogo: jest.fn(),
  }

  const produtoServiceMock = {
    marcarComoTransmitido: jest.fn(),
  }

  const siscomexClientMock = {
    desativarProduto: jest.fn(),
    consultarProdutos: jest.fn(),
  }

  function criarService() {
    const service = new ProdutoInativacaoService(
      catalogoServiceMock as any,
      certificadoServiceMock as any,
      produtoServiceMock as any
    )

    jest.spyOn(service as any, 'obterClienteSiscomex').mockResolvedValue(siscomexClientMock as any)
    return service
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(catalogoPrisma.produto.findFirst as jest.Mock).mockResolvedValue({
      id: 1,
      codigo: '999',
      catalogoId: 10,
      situacao: 'ATIVADO',
      versao: 4,
    })
    catalogoServiceMock.buscarPorId.mockResolvedValue({
      id: 10,
      cpf_cnpj: '12.345.678/0001-99',
    })
    produtoServiceMock.marcarComoTransmitido.mockResolvedValue({ id: 1, situacao: 'DESATIVADO' })
    siscomexClientMock.desativarProduto.mockResolvedValue({ situacao: 'DESATIVADO', versao: 5 })
    siscomexClientMock.consultarProdutos.mockResolvedValue([])
  })

  it('inativa produto com sucesso direto na resposta do SISCOMEX', async () => {
    const service = criarService()

    const resultado = await service.inativarProduto(1, 99)

    expect(resultado.reconciliado).toBe(false)
    expect(produtoServiceMock.marcarComoTransmitido).toHaveBeenCalledWith(
      1,
      99,
      expect.objectContaining({
        situacao: 'DESATIVADO',
        versao: 5,
        atualizarCodigo: false,
      })
    )
  })

  it('mantem estado local inalterado quando SISCOMEX retorna erro funcional 422', async () => {
    const service = criarService()
    siscomexClientMock.desativarProduto.mockRejectedValue(
      criarErroSiscomex('Dados invalidos', 422)
    )

    await expect(service.inativarProduto(1, 99)).rejects.toMatchObject({
      status: 400,
      codigo: 'VALIDACAO_SISCOMEX',
    })
    expect(produtoServiceMock.marcarComoTransmitido).not.toHaveBeenCalled()
  })

  it('reconcilia e sincroniza local quando erro tecnico ocorre mas SISCOMEX confirma desativacao', async () => {
    const service = criarService()
    siscomexClientMock.desativarProduto.mockRejectedValue(
      criarErroSiscomex('timeout na chamada', 504)
    )
    siscomexClientMock.consultarProdutos.mockResolvedValue([
      { codigo: '999', situacao: 'DESATIVADO', versao: 7 },
    ])

    const resultado = await service.inativarProduto(1, 99)

    expect(resultado.reconciliado).toBe(true)
    expect(produtoServiceMock.marcarComoTransmitido).toHaveBeenCalledWith(
      1,
      99,
      expect.objectContaining({
        situacao: 'DESATIVADO',
        versao: 7,
      })
    )
  })

  it('retorna erro retryavel quando erro tecnico ocorre e reconcilacao nao confirma', async () => {
    const service = criarService()
    siscomexClientMock.desativarProduto.mockRejectedValue(
      criarErroSiscomex('erro de rede', 503)
    )
    siscomexClientMock.consultarProdutos.mockResolvedValue([
      { codigo: '999', situacao: 'ATIVADO', versao: 6 },
    ])

    await expect(service.inativarProduto(1, 99)).rejects.toMatchObject({
      status: 503,
      codigo: 'INTEGRACAO_RETRYAVEL',
      retryable: true,
    })
    expect(produtoServiceMock.marcarComoTransmitido).not.toHaveBeenCalled()
  })

  it('retorna erro de integracao para falha de autenticacao/permissao upstream', async () => {
    const service = criarService()
    siscomexClientMock.desativarProduto.mockRejectedValue(
      criarErroSiscomex('acesso negado', 403)
    )

    await expect(service.inativarProduto(1, 99)).rejects.toMatchObject({
      status: 502,
      codigo: 'INTEGRACAO',
      retryable: false,
    })
  })

  it('retorna erro de negocio quando produto ja esta desativado localmente', async () => {
    const service = criarService()
    ;(catalogoPrisma.produto.findFirst as jest.Mock).mockResolvedValue({
      id: 1,
      codigo: '999',
      catalogoId: 10,
      situacao: 'DESATIVADO',
      versao: 9,
    })

    await expect(service.inativarProduto(1, 99)).rejects.toMatchObject({
      name: 'ProdutoInativacaoError',
      status: 400,
      codigo: 'NEGOCIO',
    })
    expect(siscomexClientMock.desativarProduto).not.toHaveBeenCalled()
    expect(produtoServiceMock.marcarComoTransmitido).not.toHaveBeenCalled()
  })
})
