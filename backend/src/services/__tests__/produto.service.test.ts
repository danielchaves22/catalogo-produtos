import { ProdutoService } from '../produto.service'
import { AtributoEstruturaDTO } from '../atributo-legacy.service'
import { catalogoPrisma } from '../../utils/prisma'

jest.mock('../../utils/prisma', () => ({
  catalogoPrisma: {
    produto: { findFirst: jest.fn() },
    $transaction: jest.fn()
  }
}))

describe('ProdutoService - atributos obrigatórios', () => {
  it('retorna verdadeiro quando todos obrigatórios preenchidos', () => {
    const service = new ProdutoService()
    const estrutura: AtributoEstruturaDTO[] = [
      { codigo: 'A', nome: 'A', tipo: 'TEXTO', obrigatorio: true, multivalorado: false, validacoes: {} },
      { codigo: 'B', nome: 'B', tipo: 'TEXTO', obrigatorio: true, multivalorado: false, validacoes: {} }
    ]
    const resultado = (service as any).todosObrigatoriosPreenchidos({ A: '1', B: '2' }, estrutura)
    expect(resultado).toBe(true)
  })

  it('retorna falso quando algum obrigatório não preenchido', () => {
    const service = new ProdutoService()
    const estrutura: AtributoEstruturaDTO[] = [
      { codigo: 'A', nome: 'A', tipo: 'TEXTO', obrigatorio: true, multivalorado: false, validacoes: {} },
      { codigo: 'B', nome: 'B', tipo: 'TEXTO', obrigatorio: true, multivalorado: false, validacoes: {} }
    ]
    const resultado = (service as any).todosObrigatoriosPreenchidos({ A: '1' }, estrutura)
    expect(resultado).toBe(false)
  })
})

describe('ProdutoService - atualização de status', () => {
  it('marca como PENDENTE quando faltam atributos obrigatórios', async () => {
    const service = new ProdutoService()
    const estrutura: AtributoEstruturaDTO[] = [
      { codigo: 'A', nome: 'A', tipo: 'TEXTO', obrigatorio: true, multivalorado: false, validacoes: {} }
    ]

    jest.spyOn(service as any, 'obterEstruturaAtributos').mockResolvedValue(estrutura)

    ;(catalogoPrisma.produto.findFirst as jest.Mock).mockResolvedValue({
      id: 1,
      status: 'APROVADO',
      ncmCodigo: '001',
      modalidade: '',
      atributos: [{ valoresJson: { A: '1' } }]
    })

    const updateSpy = jest.fn().mockResolvedValue({ count: 1 })
    ;(catalogoPrisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        produto: { updateMany: updateSpy, findFirst: jest.fn().mockResolvedValue({}) },
        produtoAtributos: { updateMany: jest.fn() },
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
