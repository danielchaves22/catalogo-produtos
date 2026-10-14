const fs = require('fs');
const path = require('path');
const resultPath = path.join(__dirname, 'resultado.json');
const summary = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
const rows = fs.readFileSync(path.join(__dirname, 'respostas.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
};
for (const model of summary.models) {
  const successful = rows.filter(r => r.requestedModel === model.model && r.status === 'ok');
  model.latency.medianMs = median(successful.map(r => r.latencyMs));
  for (const c of model.cases) c.medianMs = median(successful.filter(r => r.caseId === c.id).map(r => r.latencyMs));
}
summary.latencyMethod = 'Mediana aritmética dos dois elementos centrais para amostras pares; p95 pelo método nearest rank. Consolidação offline, sem repetir chamadas.';
fs.writeFileSync(resultPath, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary.models.map(m => ({ model: m.model, latency: m.latency, cost: m.estimatedCostUsdCacheReads, per1000: m.estimatedCostUsdCacheReads / m.calls * 1000 })), null, 2));
