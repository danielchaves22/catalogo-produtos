import { ProdutoService } from '../produto.service'
import { AtributoEstruturaDTO } from '../atributo-legacy.service'

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
