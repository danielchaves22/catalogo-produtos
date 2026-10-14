const fs = require('fs');
const path = require('path');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const summary = JSON.parse(read('resultado.json'));
const audit = JSON.parse(read('auditoria.json'));
const fixtures = JSON.parse(read('casos.json'));
const responses = read('respostas.jsonl').trim().split('\n').filter(Boolean).map(JSON.parse);
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = (x, digits = 2) => x == null ? '—' : x.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = x => x == null ? '—' : number(x * 100, 1) + '%';
const sec = x => number(x / 1000, 3) + ' s';
const usd = x => 'US$ ' + number(x, 6);
const [luna, nano] = summary.models;
const cacheWrites = responses.reduce((n, r) => n + (r.usage?.prompt_tokens_details?.cache_write_tokens || 0), 0);
const pairMatches = fixtures.casos.every(c => [1, 2, 3].every(repetition => {
  const pair = responses.filter(r => r.caseId === c.id && r.repetition === repetition);
  return pair.length === 2 && pair[0].promptSha256 === pair[1].promptSha256;
}));
if (!summary.completed || !pairMatches) throw new Error('Comparação incompleta ou prompts divergentes.');
const tr = (label, fn) => `<tr><th scope="row">${label}</th>${summary.models.map(m => `<td>${fn(m)}</td>`).join('')}</tr>`;
const table = [
  tr('Requisições concluídas', m => `${m.successful}/${m.calls}`),
  tr('Precisão de conteúdo (análise secundária)', m => { const a = audit.models.find(x => x.model === m.model); return `${pct(a.precision)} (${a.correctValues}/${a.emittedValues})`; }),
  tr('Produtos corretos em conteúdo (análise secundária)', m => { const a = audit.models.find(x => x.model === m.model); return `${a.exactProducts}/${a.calls} (${pct(a.exactProductRate)})`; }),
  tr('Respostas inteiramente conformes ao gabarito bruto', m => `${m.exactProducts}/${m.calls} (${pct(m.exactProductRate)})`),
  tr('Precisão de valor e formato (critério estrito)', m => `${pct(m.precision)} (${m.tp}/${m.tp + m.fp})`),
  tr('Cobertura dos valores esperados', m => `${pct(m.recall)} (${m.tp}/${m.expectedFields})`),
  tr('Decisões corretas de preencher ou omitir', m => `${m.correctFields}/${m.totalFields} (${pct(m.fieldAccuracy)})`),
  tr('Preenchimentos sem evidência', m => m.unnecessary),
  tr('Atributos com valores fora do domínio', m => m.invalidDomains),
  tr('Tempo mediano', m => sec(m.latency.medianMs)),
  tr('Tempo médio', m => sec(m.latency.meanMs)),
  tr('Percentil 95 de tempo', m => sec(m.latency.p95Ms)),
  tr('Tokens de entrada / saída', m => `${m.tokens.input.toLocaleString('pt-BR')} / ${m.tokens.output.toLocaleString('pt-BR')}`),
  tr('Tokens de raciocínio / cache lido', m => `${m.tokens.reasoning} / ${m.tokens.cached}`),
  tr('Custo estimado desta execução', m => usd(m.estimatedCostUsdCacheReads)),
  tr('Projeção por 1.000 chamadas semelhantes', m => usd(m.estimatedCostUsdCacheReads / m.calls * 1000))
].join('');
const caseRows = fixtures.casos.map(c => {
  const modelCases = summary.models.map(m => m.cases.find(x => x.id === c.id));
  return `<tr><th scope="row">${esc(c.id + ' — ' + c.nome)}</th>${modelCases.map(x => `<td>${x.exact}/${x.calls}; ${sec(x.medianMs)}</td>`).join('')}</tr>`;
}).join('');
const details = fixtures.casos.map(c => `<details><summary>${esc(c.id + ' — ' + c.nome)}</summary><p>${esc(c.request.descricao)}</p>
<p><strong>Gabarito (demais atributos devem ser omitidos)</strong></p><pre>${esc(JSON.stringify(c.esperado, null, 2))}</pre>
${summary.models.map(m => `<h3>${esc(m.model)}</h3>${responses.filter(r => r.caseId === c.id && r.requestedModel === m.model).map(r => `<p>Repetição ${r.repetition}: ${sec(r.latencyMs)}; ${r.score?.exact ? 'correto' : 'divergente'}</p><pre>${esc(r.content || JSON.stringify(r.error))}</pre>${r.score?.details.length ? `<pre>${esc(JSON.stringify(r.score.details, null, 2))}</pre>` : ''}`).join('')}`).join('')}</details>`).join('');
const localTime = d => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Comparativo de modelos — sugestão de atributos</title>
<style>body{font:16px/1.5 system-ui,sans-serif;color:#182633;background:#f5f7fa;margin:0}main{max-width:1100px;margin:auto;padding:32px}h1{font-size:30px;line-height:1.2}h2{margin-top:32px}p,li{max-width:95ch}table{border-collapse:collapse;width:100%;background:white;margin:20px 0;font-size:14px}th,td{padding:11px 14px;border:1px solid #dbe2ea;text-align:left}thead th{background:#19394c;color:white}tbody th{font-weight:500;width:48%}.box{border-left:4px solid #127f75;background:#e9f5f1;padding:14px 18px}details{background:white;border:1px solid #dbe2ea;border-radius:6px;padding:12px 16px;margin:10px 0}summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;word-break:break-word;background:#f1f4f8;padding:12px;border-radius:4px;font-size:13px}a{color:#006e9e}.scroll{overflow-x:auto}.muted{color:#526475}code{font-size:14px}</style>
<main><h1>GPT-6 Luna × GPT-5.4 Nano</h1><p class="muted">Sugestão de atributos · ${localTime(summary.startedAt)} a ${localTime(summary.finishedAt)} · America/Sao_Paulo</p>
<p class="box">16 produtos fictícios, 3 repetições por modelo, 96 chamadas reais à API. Gabarito definido e gravado antes da execução. Modelo configurado: <strong>${esc(summary.configuredModel)}</strong>. Arquivo .env preservado: <strong>${summary.envUnchanged ? 'sim' : 'não'}</strong>; serviço preservado: <strong>${summary.sourceUnchanged ? 'sim' : 'não'}</strong>; gabarito preservado: <strong>${summary.fixturesUnchanged ? 'sim' : 'não'}</strong>.</p>
<h2>Resultados medidos</h2><div class="scroll"><table><thead><tr><th>Métrica</th><th>GPT-6 Luna</th><th>GPT-5.4 Nano</th></tr></thead><tbody>${table}</tbody></table></div>
<p>O Nano teve tempo mediano ${number((1 - nano.latency.medianMs / luna.latency.medianMs) * 100, 1)}% menor nesta execução. O Luna teve custo estimado ${number((1 - luna.estimatedCostUsdCacheReads / nano.estimatedCostUsdCacheReads) * 100, 1)}% menor. Esses percentuais descrevem esta amostra e este ambiente de rede.</p>
<h2>Método e limites</h2><ul>
<li>Mesmas descrições, domínios, instruções e formato JSON da aplicação. As funções de compactação e construção do prompt foram carregadas diretamente do serviço TypeScript atual. Igualdade dos prompts dos 48 pares confirmada por SHA-256.</li>
<li>Chamadas sequenciais, sem retries; ordem dos casos embaralhada com semente fixa e ordem dos modelos alternada por par. Parâmetros iguais: temperature 0.2, reasoning_effort none, max_completion_tokens 800, response_format json_object, service_tier default e timeout ${summary.parameters.timeoutMs} ms. O modelo foi escolhido somente no payload do teste; não houve mudança de configuração.</li>
<li>Precisão = sugestões de atributos corretas / sugestões emitidas. Cobertura = valores esperados recuperados / valores esperados. Produto correto exige todos os valores esperados e nenhuma sugestão extra. Arrays foram avaliados como conjuntos, sem aceitar duplicatas; números aceitam string ou número e vírgula decimal. Códigos de domínio são exatos.</li>
<li>${esc(audit.method)}</li>
<li>${esc(audit.caveat)}</li>
<li>Tempo mede a chamada HTTP completa, incluindo rede, fila e geração. O p95 usa a posição de teto de 95% na lista ordenada. Não é medição isolada do tempo de processamento do modelo nem teste de concorrência.</li>
<li>Os 16 produtos têm 53 valores esperados por rodada; repetições não equivalem a produtos independentes. Amostra pequena e fictícia, com códigos ilustrativos, sem NCM nem base oficial do SISCOMEX. Não demonstra precisão em catálogos reais, domínios extensos ou descrições longas/ruidosas.</li>
<li>Custos são estimativas pelos tokens retornados e preços Standard consultados em 14/10/2026: Luna US$ 0,10/0,50 e Nano US$ 0,20/1,25 por milhão de tokens de entrada/saída. Cache lido: ${luna.tokens.cached + nano.tokens.cached}; cache escrito reportado: ${cacheWrites}; raciocínio: ${luna.tokens.reasoning + nano.tokens.reasoning}. Sem conversão cambial ou tributos; não é leitura da fatura. <a href="https://developers.openai.com/api/docs/models/gpt-6-luna">Preço Luna</a> · <a href="https://developers.openai.com/api/docs/models/gpt-5.4-nano">Preço Nano</a>.</li>
<li>Modelos retornados pela API: ${esc([...new Set(responses.map(r => r.returnedModel).filter(Boolean))].join(', '))}.</li>
</ul><h2>Por produto</h2><p>Acertos completos / repetições; tempo mediano.</p><div class="scroll"><table><thead><tr><th>Produto</th><th>Luna</th><th>Nano</th></tr></thead><tbody>${caseRows}</tbody></table></div>
<h2>Gabaritos e respostas integrais</h2>${details}
<h2>Arquivos de evidência</h2><p><a href="casos.json">Casos e gabaritos</a> · <a href="manifesto.json">Manifesto e parâmetros</a> · <a href="respostas.jsonl">Respostas e tokens</a> · <a href="resultado.json">Métricas estritas</a> · <a href="auditoria.json">Análise secundária de conteúdo</a> · <a href="executar.cjs">Executor</a></p>
<p class="muted">SHA-256 do serviço: ${summary.sourceSha256}<br>SHA-256 do gabarito: ${summary.fixturesSha256}</p></main></html>`;
fs.writeFileSync(path.join(__dirname, 'relatorio.html'), html);
console.log(JSON.stringify({ promptsIdenticos: pairMatches, cacheWrites, arquivo: path.join(__dirname, 'relatorio.html') }));
