const fs = require('fs');
const path = require('path');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const fixture = JSON.parse(read('casos.json'));
const rows = read('respostas.jsonl').trim().split('\n').map(JSON.parse);
const flatten = attrs => attrs.flatMap(a => [a, ...flatten(a.subAtributos || [])]);
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const numeric = x => typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x.trim().replace(',', '.')) : NaN;
const text = x => String(x).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
const audit = {
  method: 'Análise secundária realizada após a execução, sem novas chamadas nem alteração do gabarito ou das respostas. Separa conteúdo de formato: ignora nós COMPOSTO (estruturais), trata null/undefined/string vazia como omissão e aceita array unitário em atributo de valor único. As duas últimas tolerâncias refletem normalizarValorSugerido/aplicarSugestoesIa da tela. Não é teste end-to-end do frontend. Mantidas em resultado.json as métricas estritas originais.',
  caveat: 'O caso 06 envia a hierarquia diretamente ao compactador do serviço; a tela atual coleta somente atributos não compostos em lista plana. Esse caso é um teste adicional do serviço e não reproduz a coleta da tela.',
  frontendReference: 'frontend/pages/produtos/[id].tsx:610-698',
  models: []
};
for (const model of ['gpt-6-luna', 'gpt-5.4-nano']) {
  const selected = rows.filter(r => r.requestedModel === model);
  const totals = { model, calls: selected.length, correctValues: 0, emittedValues: 0, expectedValues: 0, exactProducts: 0,
    divergenceTypes: { unsupportedValue: 0, scalarAsArray: 0, structuralNode: 0, nullInsteadOfOmission: 0, other: 0 }, cases: [] };
  for (const row of selected) {
    const c = fixture.casos.find(x => x.id === row.caseId);
    const attrs = flatten(c.request.atributos);
    const attrMap = new Map(attrs.map(a => [a.codigo, a]));
    const normalized = {};
    for (const [key, original] of Object.entries(row.output || {})) {
      const a = attrMap.get(key);
      if (a?.tipo === 'COMPOSTO') continue;
      if (original === null || original === undefined || original === '') continue;
      normalized[key] = !a?.multivalorado && Array.isArray(original) && original.length === 1 ? original[0] : original;
    }
    let correct = 0;
    const issues = [];
    for (const [key, value] of Object.entries(normalized)) {
      const a = attrMap.get(key);
      const expected = c.esperado[key];
      const match = own(c.esperado, key) && (Array.isArray(expected)
        ? Array.isArray(value) && value.length === expected.length && new Set(value).size === value.length && expected.every(v => value.includes(v))
        : c.numericos.includes(key) ? Number.isFinite(numeric(value)) && Math.abs(numeric(value) - expected) < 1e-6
        : a?.dominio ? value === expected : typeof value === 'string' && text(value) === text(expected));
      if (match) correct++;
      else issues.push({ atributo: key, esperado: own(c.esperado, key) ? expected : 'omitir', recebido: value });
    }
    for (const d of row.score?.details || []) {
      const a = attrMap.get(d.atributo);
      if (a?.tipo === 'COMPOSTO') totals.divergenceTypes.structuralNode++;
      else if (d.recebido === null && !own(c.esperado, d.atributo)) totals.divergenceTypes.nullInsteadOfOmission++;
      else if (!a?.multivalorado && Array.isArray(d.recebido) && d.recebido.length === 1 && d.recebido[0] === c.esperado[d.atributo]) totals.divergenceTypes.scalarAsArray++;
      else if (!own(c.esperado, d.atributo)) totals.divergenceTypes.unsupportedValue++;
      else totals.divergenceTypes.other++;
    }
    const expectedCount = Object.keys(c.esperado).length;
    const emittedCount = Object.keys(normalized).length;
    const exact = row.status === 'ok' && correct === expectedCount && emittedCount === expectedCount;
    totals.correctValues += correct;
    totals.emittedValues += emittedCount;
    totals.expectedValues += expectedCount;
    totals.exactProducts += Number(exact);
    totals.cases.push({ caseId: c.id, repetition: row.repetition, correct, emitted: emittedCount, expected: expectedCount, exact, issues });
  }
  totals.precision = totals.correctValues / totals.emittedValues;
  totals.recall = totals.correctValues / totals.expectedValues;
  totals.exactProductRate = totals.exactProducts / totals.calls;
  audit.models.push(totals);
}
fs.writeFileSync(path.join(__dirname, 'auditoria.json'), JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify(audit.models.map(({ cases, ...rest }) => rest), null, 2));
