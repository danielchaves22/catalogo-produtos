const VERSAO_SISCOMEX_MAX_LENGTH = 8;
const VERSAO_SISCOMEX_PATTERN = /^\d+(?:\.\d+)?$/;

export type ProdutoHistoricoTipoEvento = 'CRIACAO' | 'ATUALIZACAO' | 'RETIFICACAO';

export function normalizarVersaoSiscomex(valor: unknown): string | null {
  if (valor === null || valor === undefined) {
    return null;
  }

  const texto = String(valor).trim();
  if (!texto || texto.length > VERSAO_SISCOMEX_MAX_LENGTH || !VERSAO_SISCOMEX_PATTERN.test(texto)) {
    return null;
  }

  return texto;
}

export function compararVersoesSiscomex(a: string | null | undefined, b: string | null | undefined) {
  const partesA = normalizarPartesVersao(a);
  const partesB = normalizarPartesVersao(b);
  const tamanho = Math.max(partesA.length, partesB.length);

  for (let indice = 0; indice < tamanho; indice += 1) {
    const valorA = partesA[indice] ?? 0;
    const valorB = partesB[indice] ?? 0;
    if (valorA !== valorB) {
      return valorA - valorB;
    }
  }

  return String(a ?? '').localeCompare(String(b ?? ''));
}

export function resolverTipoEventoHistoricoSiscomex(
  versao: string,
  tipoEvento?: ProdutoHistoricoTipoEvento
): ProdutoHistoricoTipoEvento {
  if (tipoEvento) {
    return tipoEvento;
  }

  const partes = normalizarPartesVersao(versao);
  const principal = partes[0] ?? 0;
  const retificacao = partes[1] ?? 0;

  if (retificacao > 0) {
    return 'RETIFICACAO';
  }

  return principal <= 1 ? 'CRIACAO' : 'ATUALIZACAO';
}

function normalizarPartesVersao(versao: string | null | undefined) {
  const normalizada = normalizarVersaoSiscomex(versao);
  if (!normalizada) {
    return [];
  }

  return normalizada.split('.').map(parte => Number(parte));
}
