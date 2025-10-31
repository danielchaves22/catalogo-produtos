import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { Activity, Eye, RefreshCcw, Trash, Trash2 } from 'lucide-react';

interface AsyncJobLogResumo {
  id: number;
  status: 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHO' | 'CANCELADO';
  mensagem?: string | null;
  criadoEm: string;
}

interface AsyncJobCatalogoResumo {
  id: number;
  nome: string;
  numero: number | null;
}

interface AsyncJobImportacaoResumo {
  id: number;
  situacao: 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CONCLUIDA_INCOMPLETA' | 'REVERTIDA';
  resultado: 'PENDENTE' | 'SUCESSO' | 'ATENCAO';
  catalogo?: AsyncJobCatalogoResumo | null;
}

interface AsyncJobResumo {
  id: number;
  tipo: 'IMPORTACAO_PRODUTO' | 'EXCLUSAO_MASSIVA' | 'ALTERACAO_ATRIBUTOS' | 'AJUSTE_ESTRUTURA';
  status: 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHO' | 'CANCELADO';
  tentativas: number;
  maxTentativas: number;
  prioridade: number;
  payload: unknown;
  lockedAt: string | null;
  heartbeatAt: string | null;
  finalizadoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  arquivo?: { nome: string | null } | null;
  ultimoLog?: AsyncJobLogResumo | null;
  importacaoProduto?: AsyncJobImportacaoResumo | null;
}

function formatarData(data?: string | null) {
  if (!data) return '-';
  const instancia = new Date(data);
  if (Number.isNaN(instancia.getTime())) return '-';
  return `${instancia.toLocaleDateString('pt-BR')} ${instancia.toLocaleTimeString('pt-BR')}`;
}

function obterClasseStatus(status: AsyncJobResumo['status']) {
  switch (status) {
    case 'CONCLUIDO':
      return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40';
    case 'FALHO':
    case 'CANCELADO':
      return 'bg-rose-500/10 text-rose-300 border border-rose-500/40';
    case 'PROCESSANDO':
      return 'bg-sky-500/10 text-sky-300 border border-sky-500/40';
    default:
      return 'bg-slate-500/10 text-slate-300 border border-slate-500/40';
  }
}

function traduzirStatus(status: AsyncJobResumo['status']) {
  switch (status) {
    case 'CONCLUIDO':
      return 'Concluído';
    case 'FALHO':
      return 'Falho';
    case 'CANCELADO':
      return 'Cancelado';
    case 'PROCESSANDO':
      return 'Em processamento';
    default:
      return 'Pendente';
  }
}

function traduzirTipo(tipo: AsyncJobResumo['tipo']) {
  switch (tipo) {
    case 'IMPORTACAO_PRODUTO':
      return 'Importação de Produto';
    case 'EXCLUSAO_MASSIVA':
      return 'Exclusão em Massa';
    case 'ALTERACAO_ATRIBUTOS':
      return 'Alteração de Atributos em Massa';
    case 'AJUSTE_ESTRUTURA':
      return 'Ajuste de Estrutura';
    default:
      return tipo;
  }
}

function obterDescricaoCatalogo(catalogo?: AsyncJobCatalogoResumo | null) {
  if (!catalogo) return null;
  const partes = [] as string[];
  if (catalogo.nome) partes.push(catalogo.nome);
  if (catalogo.numero != null) partes.push(`Catálogo ${catalogo.numero}`);
  return partes.join(' · ');
}

export default function ProcessosAssincronosPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [jobs, setJobs] = useState<AsyncJobResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [recarregando, setRecarregando] = useState(false);
  const [jobParaExcluir, setJobParaExcluir] = useState<AsyncJobResumo | null>(null);
  const [excluindoId, setExcluindoId] = useState<number | null>(null);
  const [mostrarConfirmacaoLimpeza, setMostrarConfirmacaoLimpeza] = useState(false);
  const [limpandoHistorico, setLimpandoHistorico] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setRecarregando(true);
      const resposta = await api.get<AsyncJobResumo[]>('/automacao/jobs');
      setJobs(resposta.data);
    } catch (error) {
      console.error('Erro ao carregar jobs assíncronos', error);
      addToast('Não foi possível carregar os processos assíncronos.', 'error');
    } finally {
      setCarregando(false);
      setRecarregando(false);
    }
  }, [addToast]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const solicitarExclusaoJob = useCallback((job: AsyncJobResumo) => {
    setJobParaExcluir(job);
  }, []);

  const confirmarExclusaoJob = useCallback(async () => {
    if (!jobParaExcluir) return;

    try {
      setExcluindoId(jobParaExcluir.id);
      await api.delete(`/automacao/jobs/${jobParaExcluir.id}`);
      addToast('Job removido do histórico com sucesso.', 'success');
      await carregar();
    } catch (error: unknown) {
      console.error('Erro ao remover job assíncrono', error);
      if (error && typeof error === 'object' && 'response' in error) {
        const resposta = (error as any).response;
        if (resposta?.status === 409) {
          addToast('Não é possível remover um job que está em execução.', 'error');
        } else {
          addToast('Não foi possível remover o job selecionado.', 'error');
        }
      } else {
        addToast('Não foi possível remover o job selecionado.', 'error');
      }
    } finally {
      setExcluindoId(null);
      setJobParaExcluir(null);
    }
  }, [addToast, carregar, jobParaExcluir]);

  const limparHistorico = useCallback(async () => {
    try {
      setLimpandoHistorico(true);
      await api.delete('/automacao/jobs');
      addToast('Histórico de processos limpo com sucesso.', 'success');
      await carregar();
    } catch (error: unknown) {
      console.error('Erro ao limpar histórico de jobs', error);
      if (error && typeof error === 'object' && 'response' in error) {
        const resposta = (error as any).response;
        if (resposta?.status === 409) {
          addToast('Há processos em execução. Aguarde a finalização antes de limpar.', 'error');
        } else {
          addToast('Não foi possível limpar o histórico de processos.', 'error');
        }
      } else {
        addToast('Não foi possível limpar o histórico de processos.', 'error');
      }
    } finally {
      setLimpandoHistorico(false);
      setMostrarConfirmacaoLimpeza(false);
    }
  }, [addToast, carregar]);

  const possuiEmExecucao = useMemo(
    () => jobs.some(job => job.status === 'PENDENTE' || job.status === 'PROCESSANDO'),
    [jobs]
  );

  useEffect(() => {
    if (!possuiEmExecucao) return undefined;

    const intervalo = setInterval(() => {
      carregar();
    }, 5000);

    return () => clearInterval(intervalo);
  }, [carregar, possuiEmExecucao]);

  if (carregando) {
    return (
      <DashboardLayout title="Processos Assíncronos">
        <PageLoader message="Carregando processos assíncronos..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Processos Assíncronos">
      <Breadcrumb
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Automacao' },
          { label: 'Processos Assincronos' },
        ]}
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Acompanhamento de Processos</h1>
          <p className="mt-1 text-sm text-slate-300">
            Consulte o andamento das importações, exclusões e demais rotinas pesadas registradas no orquestrador.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            variant="outline"
            onClick={carregar}
            disabled={recarregando}
            className="flex items-center gap-2"
          >
            <RefreshCcw size={16} />
            Atualizar
          </Button>
          {jobs.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setMostrarConfirmacaoLimpeza(true)}
              className="flex items-center gap-2 border-red-500/60 text-red-300 hover:bg-red-500/10"
              disabled={limpandoHistorico}
            >
              <Trash size={16} />
              Limpar histórico
            </Button>
          )}
          <Button
            variant="accent"
            onClick={() => router.push('/automacao/importar-produto')}
            className="flex items-center gap-2"
          >
            <Activity size={16} />
            Acessar Importações
          </Button>
        </div>
      </div>

      {possuiEmExecucao && (
        <p className="mb-4 text-sm text-sky-300">
          Existem processos em execução. A listagem é atualizada automaticamente a cada 5 segundos.
        </p>
      )}

      <Card>
        {jobs.length === 0 ? (
          <p className="p-6 text-center text-slate-300">
            Nenhum processo assíncrono foi encontrado ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-3">Ações</th>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Último evento</th>
                  <th className="px-4 py-3">Relacionamento</th>
                  <th className="px-4 py-3">Datas</th>
                  <th className="px-4 py-3">Tentativas</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => {
                  const catalogoDescricao = obterDescricaoCatalogo(job.importacaoProduto?.catalogo ?? null);
                  const importacaoId = job.importacaoProduto?.id ?? null;
                  const desabilitarExclusao =
                    job.status === 'PENDENTE' ||
                    job.status === 'PROCESSANDO' ||
                    excluindoId === job.id ||
                    limpandoHistorico;
                  return (
                    <tr key={job.id} className="border-b border-gray-800 hover:bg-[#1a1f2b]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {importacaoId && (
                            <button
                              type="button"
                              onClick={() => router.push(`/automacao/importar-produto/${importacaoId}`)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-800/60 text-slate-200 transition hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                              title="Ver detalhes da importação"
                              aria-label="Ver detalhes da importação"
                            >
                              <Eye size={16} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => solicitarExclusaoJob(job)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-500/50 bg-red-500/10 text-red-200 transition hover:bg-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                            title="Excluir processo"
                            aria-label="Excluir processo"
                            disabled={desabilitarExclusao}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-white">#{job.id}</td>
                      <td className="px-4 py-3 text-white">
                        <div className="font-medium">{traduzirTipo(job.tipo)}</div>
                        {job.arquivo?.nome && (
                          <div className="text-xs text-slate-300">Arquivo: {job.arquivo.nome}</div>
                        )}
                        <div className="mt-1 text-xs text-slate-400">Prioridade: {job.prioridade}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${obterClasseStatus(job.status)}`}>
                          {traduzirStatus(job.status)}
                        </span>
                        {job.heartbeatAt && (
                          <div className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">
                            Heartbeat: {formatarData(job.heartbeatAt)}
                          </div>
                        )}
                        {job.lockedAt && (
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            Bloqueado em: {formatarData(job.lockedAt)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white">
                        {job.ultimoLog ? (
                          <>
                            <div className="text-sm font-medium text-slate-200">
                              {job.ultimoLog.mensagem || 'Atualização registrada.'}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {formatarData(job.ultimoLog.criadoEm)}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">Nenhum log registrado.</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white">
                        {job.importacaoProduto ? (
                          <div className="space-y-1 text-xs">
                            <div className="font-medium text-slate-100">Importação #{job.importacaoProduto.id}</div>
                            <div className="text-slate-300">
                              Situação: {job.importacaoProduto.situacao.replace(/_/g, ' ')}
                            </div>
                            <div className="text-slate-300">
                              Resultado: {job.importacaoProduto.resultado}
                            </div>
                            {catalogoDescricao && (
                              <div className="text-slate-400">{catalogoDescricao}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        <div>Iniciado: {formatarData(job.criadoEm)}</div>
                        <div>Atualizado: {formatarData(job.atualizadoEm)}</div>
                        <div>Finalizado: {formatarData(job.finalizadoEm)}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        {job.tentativas} / {job.maxTentativas}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {jobParaExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-gray-700 bg-[#151921] p-6">
            <h3 className="mb-4 text-xl font-semibold text-white">Excluir registro do processo</h3>
            <p className="mb-6 text-gray-300">
              Deseja remover o histórico do job <strong>#{jobParaExcluir.id}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setJobParaExcluir(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={confirmarExclusaoJob}
                disabled={excluindoId === jobParaExcluir.id}
              >
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}

      {mostrarConfirmacaoLimpeza && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-gray-700 bg-[#151921] p-6">
            <h3 className="mb-4 text-xl font-semibold text-white">Limpar histórico de processos</h3>
            <p className="mb-6 text-gray-300">
              Confirma a remoção de todos os registros de jobs concluídos? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setMostrarConfirmacaoLimpeza(false)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={limparHistorico} disabled={limpandoHistorico}>
                Limpar histórico
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
