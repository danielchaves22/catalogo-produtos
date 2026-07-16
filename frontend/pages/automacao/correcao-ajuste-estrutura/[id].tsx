import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  RefreshCcw,
  RotateCcw,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import api from '@/lib/api';

type AsyncJobStatus = 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHO' | 'CANCELADO';
type ProdutoStatus = 'PENDENTE' | 'APROVADO' | 'PROCESSANDO' | 'TRANSMITIDO' | 'ERRO' | 'AJUSTAR_ESTRUTURA';

interface StatusResumo {
  status: ProdutoStatus;
  total: number;
}

interface ResumoDashboard {
  produtos: {
    total: number;
    porStatus: StatusResumo[];
  };
}

interface AsyncJobLog {
  id: number;
  status: AsyncJobStatus;
  mensagem?: string | null;
  criadoEm: string;
}

interface CorrecaoStatusPayload {
  superUserId?: number;
  produtoIds?: number[];
  quantidadeInicialAjustarEstrutura?: number;
}

interface AsyncJobDetalhe {
  id: number;
  tipo: 'CORRECAO_STATUS_AJUSTE_ESTRUTURA';
  status: AsyncJobStatus;
  tentativas: number;
  maxTentativas: number;
  prioridade: number;
  payload: CorrecaoStatusPayload | null;
  lockedAt: string | null;
  heartbeatAt: string | null;
  finalizadoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  logs: AsyncJobLog[];
}

const TODOS_STATUS: ProdutoStatus[] = [
  'PENDENTE',
  'APROVADO',
  'PROCESSANDO',
  'TRANSMITIDO',
  'ERRO',
  'AJUSTAR_ESTRUTURA',
];

const STATUS_LABELS: Record<ProdutoStatus, string> = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  PROCESSANDO: 'Processando',
  TRANSMITIDO: 'Transmitido',
  ERRO: 'Erro',
  AJUSTAR_ESTRUTURA: 'Atributo divergente',
};

const STATUS_COLORS: Record<ProdutoStatus, string> = {
  PENDENTE: '#ff9900',
  APROVADO: '#01aa4d',
  PROCESSANDO: '#4c82d3',
  TRANSMITIDO: '#5e17eb',
  ERRO: '#ff3131',
  AJUSTAR_ESTRUTURA: '#ff5757',
};

function criarMapaStatus(lista?: StatusResumo[]): Record<ProdutoStatus, number> {
  const mapa = TODOS_STATUS.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as Record<ProdutoStatus, number>);

  if (!lista) return mapa;

  for (const item of lista) {
    if (TODOS_STATUS.includes(item.status)) {
      mapa[item.status] = item.total;
    }
  }

  return mapa;
}

function formatarNumero(valor?: number | null) {
  if (typeof valor !== 'number' || Number.isNaN(valor)) return '-';
  return new Intl.NumberFormat('pt-BR').format(valor);
}

function extrairQuantidadeInicialDosLogs(logs: AsyncJobLog[]) {
  for (const log of logs) {
    const mensagem = log.mensagem ?? '';
    const totalAnalisado = mensagem.match(/(\d+)\s+produto\(s\)\s+analisado\(s\)/i);
    if (totalAnalisado?.[1]) {
      return Number(totalAnalisado[1]);
    }

    const totalInformado = mensagem.match(/para\s+(\d+)\s+produto\(s\)/i);
    if (totalInformado?.[1]) {
      return Number(totalInformado[1]);
    }
  }

  return null;
}

function formatarData(data?: string | null) {
  if (!data) return '-';
  const instancia = new Date(data);
  if (Number.isNaN(instancia.getTime())) return '-';
  return `${instancia.toLocaleDateString('pt-BR')} ${instancia.toLocaleTimeString('pt-BR')}`;
}

function jobEstaAtivo(status?: AsyncJobStatus) {
  return status === 'PENDENTE' || status === 'PROCESSANDO';
}

function obterBadge(status: AsyncJobStatus) {
  switch (status) {
    case 'CONCLUIDO':
      return {
        cor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
        texto: 'Concluído',
        icone: <CheckCircle2 className="h-4 w-4" />,
      };
    case 'FALHO':
    case 'CANCELADO':
      return {
        cor: 'text-rose-300 bg-rose-500/10 border-rose-500/40',
        texto: status === 'CANCELADO' ? 'Cancelado' : 'Falho',
        icone: <AlertTriangle className="h-4 w-4" />,
      };
    case 'PROCESSANDO':
      return {
        cor: 'text-sky-300 bg-sky-500/10 border-sky-500/40',
        texto: 'Em processamento',
        icone: <Clock3 className="h-4 w-4" />,
      };
    default:
      return {
        cor: 'text-slate-300 bg-slate-500/10 border-slate-500/40',
        texto: 'Pendente',
        icone: <CircleDashed className="h-4 w-4" />,
      };
  }
}

export default function CorrecaoAjusteEstruturaDetalhePage() {
  useProtectedRoute();
  const router = useRouter();
  const { addToast } = useToast();
  const [dados, setDados] = useState<AsyncJobDetalhe | null>(null);
  const [resumoDashboard, setResumoDashboard] = useState<ResumoDashboard | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [recarregando, setRecarregando] = useState(false);

  const jobId = useMemo(() => {
    const id = router.query.id;
    return Array.isArray(id) ? id[0] : id;
  }, [router.query.id]);

  const carregarDetalhes = useCallback(
    async (silencioso = false) => {
      if (!jobId) return;

      if (silencioso) {
        setRecarregando(true);
      } else {
        setCarregando(true);
      }

      try {
        const resposta = await api.get<AsyncJobDetalhe>(`/automacao/jobs/${jobId}`);
        if (resposta.data.tipo !== 'CORRECAO_STATUS_AJUSTE_ESTRUTURA') {
          throw new Error('Tipo de processo incompatível.');
        }
        setDados(resposta.data);

        try {
          const resumoResposta = await api.get<ResumoDashboard>('/dashboard/resumo');
          setResumoDashboard(resumoResposta.data);
        } catch (dashboardError) {
          console.error('Erro ao carregar resumo atualizado do dashboard', dashboardError);
        }
      } catch (error) {
        console.error('Erro ao carregar detalhes da correção de ajuste de estrutura', error);
        if (!silencioso) {
          addToast('Não foi possível carregar os detalhes da correção.', 'error');
        }
      } finally {
        if (silencioso) {
          setRecarregando(false);
        } else {
          setCarregando(false);
        }
      }
    },
    [addToast, jobId]
  );

  useEffect(() => {
    carregarDetalhes();
  }, [carregarDetalhes]);

  useEffect(() => {
    if (!jobEstaAtivo(dados?.status)) return undefined;

    const intervalo = setInterval(() => {
      carregarDetalhes(true);
    }, 5000);

    return () => clearInterval(intervalo);
  }, [carregarDetalhes, dados?.status]);

  const produtoIds = useMemo(
    () => (Array.isArray(dados?.payload?.produtoIds) ? dados.payload.produtoIds : []),
    [dados?.payload?.produtoIds]
  );

  if (carregando) {
    return (
      <DashboardLayout title="Correção de Ajuste de Estrutura">
        <PageLoader message="Carregando detalhes da correção..." />
      </DashboardLayout>
    );
  }

  if (!dados) {
    return (
      <DashboardLayout title="Correção de Ajuste de Estrutura">
        <div className="py-10 text-center text-slate-300">
          Não foi possível localizar o processo solicitado.
        </div>
      </DashboardLayout>
    );
  }

  const badge = obterBadge(dados.status);
  const atualizacaoAutomatica = jobEstaAtivo(dados.status);
  const alvoTexto = produtoIds.length > 0
    ? `${produtoIds.length} produto(s) informado(s)`
    : 'Todos os produtos em AJUSTAR_ESTRUTURA';
  const mapaProdutos = criarMapaStatus(resumoDashboard?.produtos.porStatus);
  const quantidadeInicialRegistrada = typeof dados.payload?.quantidadeInicialAjustarEstrutura === 'number'
    ? dados.payload.quantidadeInicialAjustarEstrutura
    : null;
  const quantidadeInicialAjustar =
    quantidadeInicialRegistrada ?? extrairQuantidadeInicialDosLogs(dados.logs);
  const quantidadeAtualAjustar = mapaProdutos.AJUSTAR_ESTRUTURA;
  const diferencaAjustar = quantidadeInicialAjustar !== null
    ? quantidadeAtualAjustar - quantidadeInicialAjustar
    : null;
  const resumoProdutos = TODOS_STATUS.map(status => ({
    status,
    label: STATUS_LABELS[status],
    total: mapaProdutos[status],
    color: STATUS_COLORS[status],
  }));

  return (
    <DashboardLayout title="Correção de Ajuste de Estrutura">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao/processos' },
          {
            label: 'Correção de Ajuste de Estrutura',
            href: `/automacao/correcao-ajuste-estrutura/${dados.id}`,
          },
        ]}
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1 text-sm text-slate-400">Processo #{dados.id}</p>
          <h1 className="text-2xl font-semibold text-slate-100">
            Correção de Status de Ajuste de Estrutura
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Acompanhe os eventos registrados durante a reavaliação dos produtos marcados como AJUSTAR_ESTRUTURA.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => carregarDetalhes()}
            disabled={recarregando}
          >
            <RefreshCcw className={`h-4 w-4 ${recarregando ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => router.push('/automacao/processos')}
          >
            <RotateCcw className="h-4 w-4" />
            Processos
          </Button>
        </div>
      </div>

      {atualizacaoAutomatica && (
        <p className="mb-4 text-sm text-sky-300">
          Processo em andamento. Esta tela atualiza automaticamente a cada 5 segundos.
        </p>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,320px)_1fr]">
        <Card className="p-4 border border-slate-800">
          <p className="text-sm text-slate-400">Total de Produtos</p>
          <p className="mt-1 text-3xl font-bold text-white">
            {formatarNumero(resumoDashboard?.produtos.total)}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Atributo divergente no início</p>
              <p className="mt-1 text-xl font-semibold text-slate-100">
                {formatarNumero(quantidadeInicialAjustar)}
              </p>
            </div>
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3">
              <p className="text-xs uppercase tracking-wide text-rose-200/80">Atributo divergente agora</p>
              <p className="mt-1 text-xl font-semibold text-rose-100">
                {formatarNumero(quantidadeAtualAjustar)}
              </p>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Diferença atual</p>
              <p className={`mt-1 text-xl font-semibold ${diferencaAjustar !== null && diferencaAjustar <= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                {diferencaAjustar === null
                  ? '-'
                  : `${diferencaAjustar > 0 ? '+' : ''}${formatarNumero(diferencaAjustar)}`}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-slate-800">
          <div className="mb-3">
            <p className="font-semibold text-slate-200">Resumo atual por status</p>
            <p className="text-sm text-slate-400">
              Mesmos números do box Total de Produtos do painel inicial.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {resumoProdutos.map(item => (
              <div key={item.status} className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-slate-300">{item.label}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold text-white">{formatarNumero(item.total)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4 border border-slate-800">
          <p className="text-sm text-slate-400">Status</p>
          <div className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${badge.cor}`}>
            {badge.icone}
            {badge.texto}
          </div>
        </Card>
        <Card className="p-4 border border-slate-800">
          <p className="text-sm text-slate-400">Execução</p>
          <p className="mt-1 font-semibold text-slate-100">Criado: {formatarData(dados.criadoEm)}</p>
          <p className="text-sm text-slate-400">Atualizado: {formatarData(dados.atualizadoEm)}</p>
          <p className="text-sm text-slate-400">Finalizado: {formatarData(dados.finalizadoEm)}</p>
        </Card>
        <Card className="p-4 border border-slate-800">
          <p className="text-sm text-slate-400">Tentativas</p>
          <p className="mt-1 font-semibold text-slate-100">
            {dados.tentativas} / {dados.maxTentativas}
          </p>
          <p className="text-sm text-slate-400">Prioridade: {dados.prioridade}</p>
        </Card>
      </div>

      <Card className="mb-4 p-4 border border-slate-800">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div>
            <p className="text-sm text-slate-400">Escopo</p>
            <p className="mt-1 font-semibold text-slate-100">{alvoTexto}</p>
          </div>
          <div>
            <p className="text-sm text-slate-400">Heartbeat</p>
            <p className="mt-1 font-semibold text-slate-100">{formatarData(dados.heartbeatAt)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-400">Bloqueio</p>
            <p className="mt-1 font-semibold text-slate-100">{formatarData(dados.lockedAt)}</p>
          </div>
        </div>

        {produtoIds.length > 0 && (
          <div className="mt-4 rounded-md border border-slate-800 bg-slate-900/40 p-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Produtos informados</p>
            <p className="text-sm text-slate-300">
              {produtoIds.slice(0, 30).join(', ')}
              {produtoIds.length > 30 ? ` e mais ${produtoIds.length - 30}` : ''}
            </p>
          </div>
        )}
      </Card>

      <Card className="p-4 border border-slate-800">
        <p className="mb-3 font-semibold text-slate-200">Linha do tempo</p>
        {dados.logs.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum log registrado até o momento.</p>
        ) : (
          <div className="space-y-3">
            {dados.logs.map(log => (
              <div key={log.id} className="rounded border border-slate-800 bg-slate-900/40 px-4 py-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${obterBadge(log.status).cor}`}>
                    {obterBadge(log.status).texto}
                  </span>
                  <span className="text-xs text-slate-400">{formatarData(log.criadoEm)}</span>
                </div>
                <p className="text-sm font-medium text-slate-200">
                  {log.mensagem || 'Atualização registrada.'}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </DashboardLayout>
  );
}
