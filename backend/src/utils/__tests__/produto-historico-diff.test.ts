import {
  gerarDeltaHistoricoProduto,
  gerarResumoDelta,
  normalizarProdutoParaHistorico,
} from '../produto-historico-diff';

describe('produto-historico-diff', () => {
  it('deve ordenar arrays escalares na normalização', () => {
    const normalizado = normalizarProdutoParaHistorico({ codigosInternos: ['B', 'A'] });
    expect(normalizado).toEqual({ codigosInternos: ['A', 'B'] });
  });

  it('deve gerar alteração de campo simples', () => {
    const delta = gerarDeltaHistoricoProduto(
      { denominacao: 'Produto antigo' },
      { denominacao: 'Produto novo' }
    );

    expect(delta.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'denominacao', op: 'replace', before: 'Produto antigo', after: 'Produto novo' })
      ])
    );
  });

  it('deve gerar resumo de criação na versão 1', () => {
    const delta = gerarDeltaHistoricoProduto(null, { denominacao: 'Produto novo' });
    expect(gerarResumoDelta(delta, 1)).toBe('Produto criado no SISCOMEX.');
  });
});
