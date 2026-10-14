const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');
const { performance } = require('perf_hooks');

const root = path.resolve(__dirname, '../../..');
const backend = path.join(root, 'backend');
const req = createRequire(path.join(backend, 'package.json'));
req('dotenv').config({ path: path.join(backend, '.env') });
req('ts-node').register({ transpileOnly: true, project: path.join(backend, 'tsconfig.json') });
const { IaSugestaoAtributosService } = req(path.join(backend, 'src/services/ia-sugestao-atributos.service.ts'));
const service = new IaSugestaoAtributosService();
const envOriginal = fs.readFileSync(path.join(backend, '.env'));
const modelOriginal = process.env.OPENAI_MODEL;
const sourcePath = path.join(backend, 'src/services/ia-sugestao-atributos.service.ts');
const hash = input => crypto.createHash('sha256').update(input).digest('hex');
const sourceOriginal = fs.readFileSync(sourcePath);
const fixtureBuffer = fs.readFileSync(path.join(__dirname, 'casos.json'));
const fixture = JSON.parse(fixtureBuffer);
const models = ['gpt-6-luna', 'gpt-5.4-nano'];
const prices = {
  'gpt-6-luna': { input: 0.10, cachedInput: 0.01, output: 0.50 },
  'gpt-5.4-nano': { input: 0.20, cachedInput: 0.02, output: 1.25 }
};
const repetitions = 3;
const resultsPath = path.join(__dirname, 'respostas.jsonl');
const rows = [];
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const flatten = attrs => attrs.flatMap(a => [a, ...flatten(a.subAtributos || [])]);
const normalizeText = x => String(x).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
const canonicalNumber = x => typeof x === 'number' ? x :
  typeof x === 'string' && x.trim() ? Number(x.trim().replace(',', '.')) : NaN;

function equal(c, key, value, expected) {
  const attr = flatten(c.request.atributos).find(a => a.codigo === key);
  if (Array.isArray(expected)) {
    return Array.isArray(value) && value.length === expected.length &&
      new Set(value).size === value.length && expected.every(item => value.includes(item));
  }
  if (c.numericos.includes(key)) return Number.isFinite(canonicalNumber(value)) && Math.abs(canonicalNumber(value) - expected) < 1e-6;
  if (attr.dominio) return value === expected;
  return typeof value === 'string' && normalizeText(value) === normalizeText(expected);
}

function score(c, output) {
  const attrs = flatten(c.request.atributos);
  const known = new Map(attrs.map(a => [a.codigo, a]));
  const details = [];
  let tp = 0, fp = 0, fn = 0, correctFields = 0, invalidDomains = 0, unnecessary = 0;
  for (const a of attrs) {
    const expected = own(c.esperado, a.codigo);
    const present = own(output, a.codigo);
    const correct = expected ? present && equal(c, a.codigo, output[a.codigo], c.esperado[a.codigo]) : !present;
    if (correct) correctFields++;
    if (expected && correct) tp++;
    if (expected && !correct) {
      fn++;
      details.push({ atributo: a.codigo, tipo: present ? 'valor_incorreto' : 'omissao', esperado: c.esperado[a.codigo], recebido: present ? output[a.codigo] : null });
    }
    if (present && !correct) {
      fp++;
      if (!expected) {
        unnecessary++;
        details.push({ atributo: a.codigo, tipo: 'preenchimento_sem_evidencia', esperado: 'omitir', recebido: output[a.codigo] });
      }
    }
    if (present && a.dominio) {
      const allowed = new Set(a.dominio.map(d => d.codigo));
      const values = Array.isArray(output[a.codigo]) ? output[a.codigo] : [output[a.codigo]];
      if (values.some(v => !allowed.has(v))) invalidDomains++;
    }
  }
  for (const key of Object.keys(output)) if (!known.has(key)) {
    fp++;
    unnecessary++;
    details.push({ atributo: key, tipo: 'atributo_inexistente', recebido: output[key] });
  }
  return { tp, fp, fn, correctFields, totalFields: attrs.length, expectedFields: Object.keys(c.esperado).length,
    unnecessary, invalidDomains, exact: fp === 0 && fn === 0, details };
}

function assertFixtures() {
  for (const c of fixture.casos) {
    const attrs = flatten(c.request.atributos);
    if (new Set(attrs.map(a => a.codigo)).size !== attrs.length) throw new Error(`Código repetido: ${c.id}`);
    if (Object.keys(c.esperado).some(k => !attrs.find(a => a.codigo === k))) throw new Error(`Gabarito sem atributo: ${c.id}`);
    const s = score(c, c.esperado);
    if (!s.exact || s.invalidDomains || s.correctFields !== s.totalFields) throw new Error(`Gabarito inválido: ${c.id}`);
    if (service.compactarDescricao(c.request.descricao) !== c.request.descricao) throw new Error(`Descrição seria alterada ou truncada: ${c.id}`);
  }
  const first = fixture.casos[0];
  if (score(first, {}).fn !== 3 || score(first, { ...first.esperado, MARCA: 'Inventada' }).unnecessary !== 1) throw new Error('Falha na verificação do avaliador.');
}

let seed = 20261014;
function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const quantile = (xs, p) => {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  if (p === .5 && sorted.length % 2 === 0) return (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
};
const sum = xs => xs.reduce((a, b) => a + b, 0);
const ratio = (a, b) => b ? a / b : null;
function summarize(model) {
  const selected = rows.filter(r => r.requestedModel === model);
  const good = selected.filter(r => r.status === 'ok');
  const totals = {};
  for (const key of ['tp', 'fp', 'fn', 'correctFields', 'totalFields', 'expectedFields', 'unnecessary', 'invalidDomains']) totals[key] = sum(good.map(r => r.score[key]));
  const latency = good.map(r => r.latencyMs);
  const cases = fixture.casos.map(c => {
    const rr = good.filter(r => r.caseId === c.id);
    return { id: c.id, nome: c.nome, categoria: c.categoria, calls: rr.length, exact: rr.filter(r => r.score.exact).length,
      medianMs: quantile(rr.map(r => r.latencyMs), .5),
      issues: rr.filter(r => r.score.details.length).map(r => ({ repetition: r.repetition, details: r.score.details })) };
  });
  return { model, calls: selected.length, successful: good.length, failures: selected.filter(r => r.status !== 'ok').map(r => ({ caseId: r.caseId, repetition: r.repetition, error: r.error })),
    exactProducts: good.filter(r => r.score.exact).length, exactProductRate: ratio(good.filter(r => r.score.exact).length, selected.length),
    ...totals, precision: ratio(totals.tp, totals.tp + totals.fp), recall: ratio(totals.tp, totals.tp + totals.fn),
    fieldAccuracy: ratio(totals.correctFields, totals.totalFields),
    latency: { meanMs: ratio(sum(latency), latency.length), medianMs: quantile(latency, .5), p95Ms: quantile(latency, .95), minMs: latency.length ? Math.min(...latency) : null, maxMs: latency.length ? Math.max(...latency) : null },
    tokens: { input: sum(selected.map(r => r.usage?.prompt_tokens || 0)), output: sum(selected.map(r => r.usage?.completion_tokens || 0)), cached: sum(selected.map(r => r.usage?.prompt_tokens_details?.cached_tokens || 0)), reasoning: sum(selected.map(r => r.usage?.completion_tokens_details?.reasoning_tokens || 0)) },
    estimatedCostUsdNoCache: sum(selected.map(r => r.estimatedCostUsdNoCache || 0)),
    estimatedCostUsdCacheReads: sum(selected.map(r => r.estimatedCostUsdCacheReads || 0)),
    cases };
}

function redact(message) {
  return String(message).split(process.env.OPENAI_API_KEY || 'unused-secret-marker').join('[REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]').slice(0, 600);
}

async function main() {
  assertFixtures();
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY ausente.');
  fs.writeFileSync(resultsPath, '', { flag: 'wx' });
  const manifest = {
    startedAt: new Date().toISOString(), timezone: 'America/Sao_Paulo', configuredModel: modelOriginal,
    sourceSha256: hash(sourceOriginal), fixturesSha256: hash(fixtureBuffer), cases: fixture.casos.length, repetitions,
    expectedCalls: fixture.casos.length * repetitions * models.length, models, pricesPerMillion: prices,
    sources: models.map(model => `https://developers.openai.com/api/docs/models/${model}`),
    method: 'Mesmo prompt gerado pelas funções do serviço atual, mesmas descrições/domínios e parâmetros. Gabarito não enviado à API. Chamadas sequenciais sem retries; ordem dos casos embaralhada com semente fixa e ordem dos modelos alternada por par. Modelo informado apenas no payload de cada requisição.',
    parameters: { temperature: 0.2, reasoning_effort: 'none', max_completion_tokens: 800, response_format: { type: 'json_object' }, service_tier: 'default', timeoutMs: service.cliente.defaults.timeout },
    costMethod: 'Estimativas pelos tokens reportados e tarifas Standard: custo sem cache e custo com desconto de leituras de cache. Não é leitura de fatura; eventual escrita de cache não discriminada não está incluída.'
  };
  fs.writeFileSync(path.join(__dirname, 'manifesto.json'), JSON.stringify(manifest, null, 2) + '\n');
  let aborted = false;
  for (let repetition = 1; repetition <= repetitions && !aborted; repetition++) {
    const ordered = shuffle(fixture.casos);
    for (let index = 0; index < ordered.length && !aborted; index++) {
      const c = ordered[index];
      const messages = service.montarPrompt({
        descricao: service.compactarDescricao(c.request.descricao),
        atributos: service.compactarAtributos(c.request.atributos),
        ncm: c.request.ncm, modalidade: c.request.modalidade
      });
      const pair = (index + repetition) % 2 ? models : [...models].reverse();
      for (const model of pair) {
        const record = { sequence: rows.length + 1, repetition, caseId: c.id, caseName: c.nome, requestedModel: model, startedAt: new Date().toISOString(), promptSha256: hash(JSON.stringify(messages)) };
        const start = performance.now();
        try {
          const response = await service.cliente.post('/chat/completions', {
            model, messages, temperature: .2, reasoning_effort: 'none', max_completion_tokens: 800,
            response_format: { type: 'json_object' }, service_tier: 'default'
          });
          record.latencyMs = Math.round(performance.now() - start);
          record.responseId = response.data.id;
          record.returnedModel = response.data.model;
          record.serviceTier = response.data.service_tier;
          record.usage = response.data.usage;
          record.finishReason = response.data.choices?.[0]?.finish_reason;
          record.content = response.data.choices?.[0]?.message?.content;
          const rate = prices[model];
          record.estimatedCostUsdNoCache = ((record.usage?.prompt_tokens || 0) * rate.input + (record.usage?.completion_tokens || 0) * rate.output) / 1e6;
          const cached = record.usage?.prompt_tokens_details?.cached_tokens || 0;
          record.estimatedCostUsdCacheReads = record.estimatedCostUsdNoCache - cached * (rate.input - rate.cachedInput) / 1e6;
          if (record.finishReason !== 'stop') throw new Error(`finish_reason=${record.finishReason}`);
          const output = JSON.parse(record.content);
          if (!output || typeof output !== 'object' || Array.isArray(output)) throw new Error('Resposta não é objeto JSON.');
          record.output = output;
          record.score = score(c, output);
          record.status = 'ok';
        } catch (error) {
          record.latencyMs ??= Math.round(performance.now() - start);
          record.status = 'error';
          record.error = { httpStatus: error.response?.status, code: error.response?.data?.error?.code || error.code,
            message: redact(error.response?.data?.error?.message || error.message) };
          if ([400, 401, 403, 404, 429].includes(error.response?.status)) aborted = true;
        }
        rows.push(record);
        fs.appendFileSync(resultsPath, JSON.stringify(record) + '\n');
        console.log(JSON.stringify({ progress: `${rows.length}/${manifest.expectedCalls}`, model, caso: c.id, repetition, status: record.status, exact: record.score?.exact, latencyMs: record.latencyMs, error: record.error }));
        if (aborted) break;
      }
    }
  }
  const envUnchanged = envOriginal.equals(fs.readFileSync(path.join(backend, '.env')));
  const sourceUnchanged = sourceOriginal.equals(fs.readFileSync(sourcePath));
  const fixturesUnchanged = fixtureBuffer.equals(fs.readFileSync(path.join(__dirname, 'casos.json')));
  const summary = { ...manifest, finishedAt: new Date().toISOString(), completed: !aborted && rows.length === manifest.expectedCalls,
    envUnchanged, sourceUnchanged, fixturesUnchanged, models: models.map(summarize) };
  fs.writeFileSync(path.join(__dirname, 'resultado.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ completed: summary.completed, envUnchanged, sourceUnchanged, fixturesUnchanged,
    models: summary.models.map(({ cases, ...rest }) => rest) }));
  if (!summary.completed || !envUnchanged || !sourceUnchanged || !fixturesUnchanged) process.exitCode = 1;
}
main().catch(error => { console.error(redact(error.message)); process.exitCode = 1; });
