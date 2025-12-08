import { AsyncJobStatus, AsyncJobTipo, Prisma } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';
import { createAsyncJob, listAsyncJobs } from '../jobs/async-job.repository';
import { ResultadoVerificacao, VerificacaoAtributosPayload } from '../jobs/handlers/verificacao-atributos-ncm.handler';

interface DetalheVerificacaoJob {
  id: number;
  status: AsyncJobStatus;
  criadoEm: Date;
  finalizadoEm: Date | null;
  arquivoNome: string | null;
  resultados: ResultadoVerificacao[];
  totalVerificados: number;
  divergentes: number;
  logs: Array<{ id: number; status: AsyncJobStatus; mensagem: string | null; criadoEm: Date }>;
}

function inicioDoDiaAtual(): Date {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

function inicioDoProximoDia(): Date {
  const inicio = inicioDoDiaAtual();
  inicio.setDate(inicio.getDate() + 1);
  return inicio;
}

export async function validarRestricaoDiaria(superUserId: number): Promise<void> {
  const jaExecutadoHoje = await catalogoPrisma.asyncJob.findFirst({
    where: {
      tipo: AsyncJobTipo.AJUSTE_ESTRUTURA,
      criadoEm: {
        gte: inicioDoDiaAtual(),
        lt: inicioDoProximoDia(),
      },
      payload: { path: '$.superUserId', equals: superUserId },
    },
  });

  if (jaExecutadoHoje) {
    throw new Error('Já existe uma verificação de atributos iniciada hoje. Aguarde o próximo dia.');
  }
}

export async function iniciarVerificacaoAtributos(
  superUserId: number,
  usuarioId: number
) {
  await validarRestricaoDiaria(superUserId);

  const payload: VerificacaoAtributosPayload = {
    superUserId,
    usuarioId,
  };

  return createAsyncJob({
    tipo: AsyncJobTipo.AJUSTE_ESTRUTURA,
    payload: payload as unknown as Prisma.InputJsonValue,
    prioridade: 1,
  });
}

export async function listarVerificacoes(superUserId: number) {
  return listAsyncJobs({
    superUserId,
    tipos: [AsyncJobTipo.AJUSTE_ESTRUTURA],
  });
}

function lerResultadosBase64(conteudoBase64: string | null): ResultadoVerificacao[] {
  if (!conteudoBase64) return [];

  try {
    const buffer = Buffer.from(conteudoBase64, 'base64');
    const texto = buffer.toString('utf8');
    const parsed = JSON.parse(texto);
    if (Array.isArray(parsed)) {
      return parsed as ResultadoVerificacao[];
    }
  } catch {
    return [];
  }

  return [];
}

export async function detalharVerificacao(
  superUserId: number,
  jobId: number
): Promise<DetalheVerificacaoJob | null> {
  const job = await catalogoPrisma.asyncJob.findFirst({
    where: {
      id: jobId,
      tipo: AsyncJobTipo.AJUSTE_ESTRUTURA,
      payload: { path: '$.superUserId', equals: superUserId },
    },
    include: {
      arquivo: true,
      logs: { orderBy: { criadoEm: 'desc' } },
    },
  });

  if (!job) {
    return null;
  }

  const resultados = lerResultadosBase64(job.arquivo?.conteudoBase64 ?? null);
  const divergentes = resultados.filter(item => item.divergente).length;

  return {
    id: job.id,
    status: job.status,
    criadoEm: job.criadoEm,
    finalizadoEm: job.finalizadoEm,
    arquivoNome: job.arquivo?.nome ?? null,
    resultados,
    totalVerificados: resultados.length,
    divergentes,
    logs: job.logs.map(log => ({
      id: log.id,
      status: log.status,
      mensagem: log.mensagem ?? null,
      criadoEm: log.criadoEm,
    })),
  };
}
