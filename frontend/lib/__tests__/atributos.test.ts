// frontend/lib/__tests__/atributos.test.ts
import assert from 'node:assert/strict';
import {
  algumValorIgual,
  algumValorSatisfazCondicao,
  isValorPreenchido,
  normalizarValoresMultivalorados,
} from '../atributos.ts';

const condicaoIgualB = { operador: '==', valor: 'B' };
const condicaoMaiorQue5 = { operador: '>', valor: '5' };

const casos = [
  {
    descricao: 'identifica valores preenchidos em strings e arrays',
    exec: () => {
      assert.equal(isValorPreenchido(undefined), false);
      assert.equal(isValorPreenchido(''), false);
      assert.equal(isValorPreenchido(['', '   ']), false);
      assert.equal(isValorPreenchido('valor'), true);
      assert.equal(isValorPreenchido(['', 'A']), true);
    }
  },
  {
    descricao: 'normaliza valores multivalorados para arrays de strings',
    exec: () => {
      assert.deepEqual(normalizarValoresMultivalorados(undefined), []);
      assert.deepEqual(normalizarValoresMultivalorados('A'), ['A']);
      assert.deepEqual(normalizarValoresMultivalorados(['A', 'B']), ['A', 'B']);
      assert.deepEqual(normalizarValoresMultivalorados(['', 'C']), ['C']);
    }
  },
  {
    descricao: 'avalia condições considerando qualquer valor da coleção',
    exec: () => {
      assert.equal(algumValorSatisfazCondicao(condicaoIgualB, ['A', 'B']), true);
      assert.equal(algumValorSatisfazCondicao(condicaoIgualB, ['A', 'C']), false);
      assert.equal(algumValorSatisfazCondicao(condicaoMaiorQue5, ['3', '6']), true);
      assert.equal(algumValorSatisfazCondicao(condicaoMaiorQue5, []), false);
    }
  },
  {
    descricao: 'verifica igualdade considerando múltiplos valores',
    exec: () => {
      assert.equal(algumValorIgual(['A', 'B'], 'B'), true);
      assert.equal(algumValorIgual(['A', 'B'], 'C'), false);
      assert.equal(algumValorIgual('A', 'A'), true);
      assert.equal(algumValorIgual(undefined, 'A'), false);
    }
  }
];

casos.forEach(({ descricao, exec }) => {
  try {
    exec();
    console.log(`✔ ${descricao}`);
  } catch (error) {
    console.error(`✖ ${descricao}`);
    throw error;
  }
});

console.log('Todos os testes utilitários de atributos passaram.');
