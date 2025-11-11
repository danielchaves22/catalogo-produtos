import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { Download, Eye, Loader2, RefreshCcw, Trash, Trash2 } from 'lucide-react';

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
  tipo:
    | 'IMPORTACAO_PRODUTO'
    | 'EXCLUSAO_MASSIVA'
    | 'ALTERACAO_ATRIBUTOS'
    | 'AJUSTE_ESTRUTURA'
    | 'EXPORTACAO_PRODUTO';
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
  arquivo?: { nome: string | null; expiraEm?: string | null } | null;
  ultimoLog?: AsyncJobLogResumo | null;
  importacaoProduto?: AsyncJobImportacaoResumo | null;
  atributoPreenchimentoMassa?: { id: number } | null;
  produtoExportacao?: {
    id: number;
    arquivoNome: string | null;
    arquivoExpiraEm: string | null;
    arquivoTamanho: number | null;
    totalItens: number | null;
  } | null;
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
    case 'EXPORTACAO_PRODUTO':
      return 'Exportação de Produto';
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

function extrairNomeArquivo(contentDisposition?: string): string | null {
  if (!contentDisposition) return null;
  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch && utfMatch[1]) {
    return decodeURIComponent(utfMatch[1]);
  }
  const asciiMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (asciiMatch && asciiMatch[1]) {
    return asciiMatch[1];
  }
  return null;
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
  const [baixandoArquivoId, setBaixandoArquivoId] = useState<number | null>(null);

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

  const baixarArquivoJob = useCallback(
    async (job: AsyncJobResumo) => {
      if (baixandoArquivoId === job.id) {
        return;
      }

      setBaixandoArquivoId(job.id);

      try {
        const resposta = await api.get(`/automacao/jobs/${job.id}/arquivo`, {
          responseType: 'blob',
        });

        const contentType = (resposta.headers['content-type'] as string | undefined) ?? '';

        if (contentType.includes('application/json')) {
          const texto = await (resposta.data as Blob).text();
          const dados = JSON.parse(texto);
          if (dados.url) {
            window.open(dados.url, '_blank');
            if (dados.expiraEm) {
              addToast(
                `Link válido até ${new Date(dados.expiraEm).toLocaleString('pt-BR')}.`,
                'success'
              );
            } else {
              addToast('Link temporário gerado para download.', 'success');
            }
          } else {
            addToast('Link do arquivo indisponível.', 'error');
          }
        } else {
          const blob = resposta.data as Blob;
          const url = window.URL.createObjectURL(blob);
          const nomeArquivo =
            extrairNomeArquivo(resposta.headers['content-disposition'] as string | undefined) ||
            job.produtoExportacao?.arquivoNome ||
            job.arquivo?.nome ||
            `exportacao-${job.id}.json`;
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = nomeArquivo;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          window.URL.revokeObjectURL(url);
          addToast('Download iniciado.', 'success');
        }
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 410) {
          addToast('O arquivo expirou. Solicite uma nova exportação.', 'error');
        } else if (status === 404) {
          addToast('Arquivo não disponível para este processo.', 'error');
        } else {
          addToast('Não foi possível obter o arquivo da exportação.', 'error');
        }
      } finally {
        setBaixandoArquivoId(null);
      }
    },
    [addToast, baixandoArquivoId]
  );

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
                  const atributoId = job.atributoPreenchimentoMassa?.id ?? null;
                  const podeVerAtribuicao =
                    job.tipo === 'ALTERACAO_ATRIBUTOS' && atributoId && job.status === 'CONCLUIDO';
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
                          {podeVerAtribuicao && (
                            <button
                              type="button"
                              onClick={() => router.push(`/automacao/atributos-massa/${atributoId}`)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/50 bg-emerald-500/10 text-emerald-200 transition hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              title="Ver detalhes da atribuição em massa"
                              aria-label="Ver detalhes da atribuição em massa"
                            >
                              <Eye size={16} />
                            </button>
                          )}
                          {job.tipo === 'EXPORTACAO_PRODUTO' && job.status === 'CONCLUIDO' && (
                            <button
                              type="button"
                              onClick={() => baixarArquivoJob(job)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sky-500/50 bg-sky-500/10 text-sky-200 transition hover:bg-sky-500/20 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                              title="Baixar arquivo gerado"
                              aria-label="Baixar arquivo gerado"
                              disabled={baixandoArquivoId === job.id}
                            >
                              {baixandoArquivoId === job.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Download size={16} />
                              )}
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
                        ) : job.atributoPreenchimentoMassa ? (
                          <div className="space-y-1 text-xs">
                            <div className="font-medium text-slate-100">
                              Atribuição em massa #{job.atributoPreenchimentoMassa.id}
                            </div>
                            <div className="text-slate-300">
                              {job.status === 'CONCLUIDO'
                                ? 'Processo concluído. Utilize o botão de ações para revisar os detalhes.'
                                : 'Processo em andamento. O status é atualizado automaticamente.'}
                            </div>
                          </div>
                        ) : job.produtoExportacao ? (
                          <div className="space-y-1 text-xs">
                            <div className="font-medium text-slate-100">
                              Exportação #{job.produtoExportacao.id}
                            </div>
                            {job.produtoExportacao.totalItens != null && (
                              <div className="text-slate-300">
                                Itens exportados: {job.produtoExportacao.totalItens}
                              </div>
                            )}
                            {job.produtoExportacao.arquivoExpiraEm && (
                              <div className="text-slate-400">
                                Expira em: {formatarData(job.produtoExportacao.arquivoExpiraEm)}
                              </div>
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
