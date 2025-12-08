import { createHash } from 'crypto';
import { AsyncJobStatus } from '@prisma/client';
import { AsyncJobHandler } from '../async-job.worker';
import { AtributoEstruturaDTO, AtributoLegacyService } from '../../services/atributo-legacy.service';
import { catalogoPrisma } from '../../utils/prisma';
import { atualizarArquivoJob, registerJobLog } from '../async-job.repository';

export interface VerificacaoAtributosPayload {
  superUserId: number;
  usuarioId: number;
}

export interface ResultadoVerificacao {
  ncmCodigo: string;
  modalidade: string;
  versaoId: number;
  versaoNumero: number;
  hashAtual: string;
  hashLegado: string;
  divergente: boolean;
  totais: {
    atributos: number;
    dominios: number;
  };
}

const atributoLegacyService = new AtributoLegacyService();

function normalizarValor(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(normalizarValor);
  }

  if (valor && typeof valor === 'object') {
    const entradasOrdenadas = Object.entries(valor as Record<string, unknown>)
      .sort(([chaveA], [chaveB]) => chaveA.localeCompare(chaveB));

    return entradasOrdenadas.reduce<Record<string, unknown>>((acc, [chave, val]) => {
      acc[chave] = normalizarValor(val);
      return acc;
    }, {});
  }

  return valor ?? null;
}

function normalizarAtributo(atributo: AtributoEstruturaDTO): AtributoEstruturaDTO {
  const dominioOrdenado = [...(atributo.dominio ?? [])].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const subAtributosOrdenados = [...(atributo.subAtributos ?? [])]
    .map(sub => normalizarAtributo(sub))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  const validacoesOrdenadas = normalizarValor(atributo.validacoes ?? {});
  const condicaoOrdenada = normalizarValor(atributo.condicao ?? null);

  return {
    ...atributo,
    validacoes: validacoesOrdenadas as Record<string, unknown>,
    condicao: condicaoOrdenada ?? undefined,
    dominio: dominioOrdenado,
    subAtributos: subAtributosOrdenados,
  };
}

function gerarHashEstrutura(estrutura: AtributoEstruturaDTO[]): string {
  const estruturaNormalizada = estrutura
    .map(normalizarAtributo)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  const json = JSON.stringify(estruturaNormalizada);
  return createHash('sha256').update(json).digest('hex');
}

function contarEstrutura(estrutura: AtributoEstruturaDTO[]): { atributos: number; dominios: number } {
  let atributos = 0;
  let dominios = 0;

  const percorrer = (lista: AtributoEstruturaDTO[]) => {
    for (const attr of lista) {
      atributos += 1;
      dominios += attr.dominio?.length ?? 0;
      if (attr.subAtributos?.length) {
        percorrer(attr.subAtributos);
      }
    }
  };

  percorrer(estrutura);
  return { atributos, dominios };
}

export const verificacaoAtributosNcmHandler: AsyncJobHandler<VerificacaoAtributosPayload> = async ({
  job,
  payload,
  heartbeat,
}) => {
  if (!payload?.superUserId || !payload?.usuarioId) {
    throw new Error('Payload da verificação de atributos inválido.');
  }

  const versoes = await catalogoPrisma.atributoVersao.findMany({
    orderBy: [
      { ncmCodigo: 'asc' },
      { modalidade: 'asc' },
      { versao: 'desc' },
    ],
    distinct: ['ncmCodigo', 'modalidade'],
  });

  await registerJobLog(
    job.id,
    AsyncJobStatus.PROCESSANDO,
    `Iniciando verificação de ${versoes.length} combinação(ões) de NCM/modalidade.`
  );

  const resultados: ResultadoVerificacao[] = [];

  for (const versao of versoes) {
    await heartbeat();

    const modalidade = versao.modalidade ?? 'IMPORTACAO';
    const estruturaAtual = await atributoLegacyService.buscarEstruturaPorVersao(versao.id);

    if (!estruturaAtual) {
      await registerJobLog(
        job.id,
        AsyncJobStatus.PROCESSANDO,
        `Estrutura local não encontrada para ${versao.ncmCodigo} (${modalidade}).`
      );
      continue;
    }

    const estruturaLegada = await atributoLegacyService.buscarEstruturaLegadaAtual(
      versao.ncmCodigo,
      modalidade
    );

    const hashAtual = gerarHashEstrutura(estruturaAtual.estrutura);
    const hashLegado = gerarHashEstrutura(estruturaLegada);
    const totais = contarEstrutura(estruturaAtual.estrutura);

    resultados.push({
      ncmCodigo: versao.ncmCodigo,
      modalidade,
      versaoId: versao.id,
      versaoNumero: versao.versao,
      hashAtual,
      hashLegado,
      divergente: hashAtual !== hashLegado,
      totais,
    });
  }

  const divergentes = resultados.filter(item => item.divergente).length;
  const conteudo = JSON.stringify(resultados, null, 2);
  const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await atualizarArquivoJob(job.id, {
    nome: `verificacao-atributos-${job.id}.json`,
    conteudoBase64: Buffer.from(conteudo, 'utf8').toString('base64'),
    expiraEm,
  });

  await registerJobLog(
    job.id,
    AsyncJobStatus.PROCESSANDO,
    `Verificação concluída com ${divergentes} divergência(s) em ${resultados.length} combinação(ões).`
  );
};
