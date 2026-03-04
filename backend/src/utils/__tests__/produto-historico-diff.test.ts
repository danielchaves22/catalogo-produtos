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

  it('deve preservar mudanças quando snapshot anterior é nulo', () => {
    const delta = gerarDeltaHistoricoProduto(null, {
      denominacao: 'Produto novo',
      descricao: 'Descrição nova'
    });

    expect(delta.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'denominacao', op: 'add', after: 'Produto novo' }),
        expect.objectContaining({ path: 'descricao', op: 'add', after: 'Descrição nova' })
      ])
    );
  });

  it('deve priorizar resumo de criação mesmo sem mudanças na versão 1', () => {
    const deltaSemMudancas = gerarDeltaHistoricoProduto({ codigo: '1' }, { codigo: '1' });
    expect(gerarResumoDelta(deltaSemMudancas, 1)).toBe('Produto criado no SISCOMEX.');
  });
});
