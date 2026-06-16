import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Eye, FileDown, Loader2, PlayCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import {
  TransmissaoOrigemContexto,
  TransmissaoOrigemTipo,
  ehOrigemAjusteEstrutura,
  obterResumoOrigemTransmissao,
} from '@/lib/transmissao-origem';

interface CatalogoResumo {
  nome: string;
  numero: number | null;
}

interface ResumoBloco {
  id: number;
  ordem: number;
  status: 'PENDENTE' | 'PROCESSANDO' | 'INTERROMPIDO' | 'CONCLUIDO' | 'FALHO' | 'PARCIAL';
  totalItens: number;
  totalSucesso: number;
  totalErro: number;
  mensagem?: string | null;
}

type TransmissaoStatus =
  | 'AGUARDANDO_CONFIRMACAO'
  | 'EM_FILA'
  | 'PROCESSANDO'
  | 'INTERROMPIDA'
  | 'CONCLUIDO'
  | 'FALHO'
  | 'PARCIAL'
  | 'CANCELADA';
type ModalidadeTransmissao = 'PRODUTOS' | 'OPERADORES_ESTRANGEIROS';

const STATUS_ATIVOS_PADRAO: TransmissaoStatus[] = [
  'AGUARDANDO_CONFIRMACAO',
  'EM_FILA',
  'PROCESSANDO',
  'INTERROMPIDA',
  'PARCIAL',
  'FALHO',
];

const STATUS_TRANSMISSAO_OPCOES: TransmissaoStatus[] = [
  'AGUARDANDO_CONFIRMACAO',
  'EM_FILA',
  'PROCESSANDO',
  'INTERROMPIDA',
  'PARCIAL',
  'FALHO',
  'CONCLUIDO',
  'CANCELADA',
];

interface TransmissaoListagem {
  id: number;
  modalidade: ModalidadeTransmissao;
  catalogo: CatalogoResumo;
  origemTipo?: TransmissaoOrigemTipo;
  origemContexto?: TransmissaoOrigemContexto | null;
  totalItens: number;
  totalSucesso: number;
  totalErro: number;
  itensPendentes?: number;
  totalBlocos?: number;
  blocosConcluidos?: number;
  blocoAtual?: ResumoBloco | null;
  filaCatalogoPosicao?: number | null;
  enfileiradaEm?: string | null;
  status: TransmissaoStatus;
  iniciadoEm?: string | null;
  concluidoEm?: string | null;
  payloadEnvioUrl?: string | null;
  payloadRetornoUrl?: string | null;
}

function formatarData(dataIso?: string | null) {
  if (!dataIso) return '-';
  return new Date(dataIso).toLocaleString('pt-BR');
}

function obterEtiquetaStatus(status: TransmissaoStatus) {
  switch (status) {
    case 'AGUARDANDO_CONFIRMACAO':
      return 'Aguardando confirmação';
    case 'CONCLUIDO':
      return 'Concluída';
    case 'CANCELADA':
      return 'Cancelada';
    case 'FALHO':
      return 'Falha';
    case 'PARCIAL':
      return 'Parcial';
    case 'PROCESSANDO':
      return 'Processando';
    case 'INTERROMPIDA':
      return 'Interrompida';
    default:
      return 'Em fila';
  }
}

function obterClasseStatus(status: TransmissaoStatus) {
  switch (status) {
    case 'AGUARDANDO_CONFIRMACAO':
      return 'border border-slate-600/60 bg-slate-700/40 text-slate-200';
    case 'CONCLUIDO':
      return 'border border-emerald-500/40 bg-emerald-400/10 text-emerald-400';
    case 'CANCELADA':
      return 'border border-gray-600/40 bg-gray-500/10 text-gray-400';
    case 'FALHO':
      return 'border border-red-500/40 bg-red-400/10 text-red-400';
    case 'PARCIAL':
      return 'border border-amber-500/40 bg-amber-400/10 text-amber-300';
    case 'PROCESSANDO':
      return 'border border-blue-500/40 bg-blue-400/10 text-blue-300';
    case 'INTERROMPIDA':
      return 'border border-orange-500/40 bg-orange-400/10 text-orange-300';
    default:
      return 'border border-amber-500/40 bg-amber-400/10 text-amber-400';
  }
}

function obterResumoExecucao(transmissao: TransmissaoListagem) {
  if (transmissao.status === 'AGUARDANDO_CONFIRMACAO') {
    return `${transmissao.totalItens} preparado(s)`;
  }

  if (transmissao.status === 'CANCELADA') {
    return `${transmissao.totalItens} item(ns) cancelado(s)`;
  }

  const partes = [`${transmissao.totalSucesso}/${transmissao.totalItens} concluídos`];

  if ((transmissao.itensPendentes ?? 0) > 0) {
    partes.push(`${transmissao.itensPendentes} pendente(s)`);
  }

  if ((transmissao.totalBlocos ?? 0) > 0 && transmissao.blocoAtual) {
    partes.push(`Bloco ${transmissao.blocoAtual.ordem}/${transmissao.totalBlocos}`);
  }

  return partes.join(' · ');
}

function obterResumoFila(transmissao: TransmissaoListagem) {
  if (transmissao.status === 'AGUARDANDO_CONFIRMACAO') {
    return 'Pré-transmissão criada e aguardando revisão final.';
  }

  if (transmissao.status === 'INTERROMPIDA') {
    return 'Processamento interrompido. A transmissão pode ser retomada do ponto pendente.';
  }

  if (
    (transmissao.status === 'EM_FILA' || transmissao.status === 'PROCESSANDO') &&
    (transmissao.filaCatalogoPosicao ?? 0) > 0
  ) {
    return `Fila do catálogo: ${transmissao.filaCatalogoPosicao}ª posição.`;
  }

  return 'Execução individual, sequencial e assíncrona por catálogo.';
}

function extrairMensagemErro(error: unknown, padrao: string) {
  const mensagem = (error as any)?.response?.data?.error;
  if (typeof mensagem === 'string') {
    return mensagem;
  }
  if (Array.isArray(mensagem) && mensagem.length > 0) {
    const primeiro = mensagem[0];
    if (typeof primeiro === 'string') return primeiro;
    if (primeiro?.message) return String(primeiro.message);
  }
  return padrao;
}

export default function TransmissoesSiscomexPage() {
  const [transmissoes, setTransmissoes] = useState<TransmissaoListagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [recarregando, setRecarregando] = useState(false);
  const [acaoTransmissaoId, setAcaoTransmissaoId] = useState<number | null>(null);
  const [statusSelecionados, setStatusSelecionados] =
    useState<TransmissaoStatus[]>(STATUS_ATIVOS_PADRAO);
  const { addToast } = useToast();
  const router = useRouter();

  const statusOptions = useMemo(
    () =>
      STATUS_TRANSMISSAO_OPCOES.map(status => ({
        value: status,
        label: obterEtiquetaStatus(status),
      })),
    []
  );

  const carregarTransmissoes = useCallback(
    async (silencioso = false) => {
      try {
        if (silencioso) {
          setRecarregando(true);
        }

        const resposta = await api.get<{ itens: TransmissaoListagem[] }>('/siscomex/transmissoes');
        setTransmissoes(resposta.data?.itens ?? []);
      } catch (error) {
        console.error('Erro ao carregar transmissões SISCOMEX:', error);
        if (!silencioso) {
          addToast('Não foi possível carregar as transmissões.', 'error');
        }
      } finally {
        setCarregando(false);
        setRecarregando(false);
      }
    },
    [addToast]
  );

  useEffect(() => {
    carregarTransmissoes();
  }, [carregarTransmissoes]);

  const transmissoesFiltradas = useMemo(() => {
    if (statusSelecionados.length === 0) {
      return transmissoes;
    }

    return transmissoes.filter(item => statusSelecionados.includes(item.status));
  }, [statusSelecionados, transmissoes]);

  const filtroPadraoAtivo = useMemo(
    () =>
      statusSelecionados.length === STATUS_ATIVOS_PADRAO.length &&
      STATUS_ATIVOS_PADRAO.every(status => statusSelecionados.includes(status)),
    [statusSelecionados]
  );

  const possuiTransmissaoAtiva = useMemo(
    () =>
      transmissoesFiltradas.some(
        item => item.status === 'EM_FILA' || item.status === 'PROCESSANDO'
      ),
    [transmissoesFiltradas]
  );

  useEffect(() => {
    if (!possuiTransmissaoAtiva) {
      return undefined;
    }

    const intervalo = setInterval(() => {
      carregarTransmissoes(true);
    }, 5000);

    return () => clearInterval(intervalo);
  }, [carregarTransmissoes, possuiTransmissaoAtiva]);

  const baixarArquivo = async (
    transmissaoId: number,
    tipo: 'envio' | 'retorno',
    url?: string | null
  ) => {
    try {
      if (url) {
        window.open(url, '_blank');
        return;
      }

      const resposta = await api.get(`/siscomex/transmissoes/${transmissaoId}/arquivos/${tipo}`, {
        responseType: 'blob',
      });

      const contentType = resposta.headers['content-type'] as string | undefined;
      if (contentType?.includes('application/json')) {
        const texto = await (resposta.data as Blob).text();
        try {
          const json = JSON.parse(texto);
          if (json.url) {
            window.open(json.url, '_blank');
            return;
          }
        } catch (_) {}
      }

      const blobUrl = URL.createObjectURL(resposta.data as Blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `payload-${tipo}-${transmissaoId}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Erro ao baixar payload da transmissão:', error);
      addToast('Não foi possível baixar o payload solicitado.', 'error');
    }
  };

  const continuarTransmissao = async (transmissaoId: number) => {
    setAcaoTransmissaoId(transmissaoId);
    try {
      const resposta = await api.post(`/siscomex/transmissoes/${transmissaoId}/iniciar`);
      addToast(
        resposta.data?.mensagem ||
          'Transmissão retomada com sucesso. Acompanhe o progresso no detalhe.',
        'success'
      );
      await router.push(`/automacao/transmissoes-siscomex/${transmissaoId}`);
    } catch (error) {
      console.error('Erro ao retomar transmissão:', error);
      addToast(
        extrairMensagemErro(error, 'Não foi possível retomar a transmissão selecionada.'),
        'error'
      );
      await carregarTransmissoes(true);
    } finally {
      setAcaoTransmissaoId(null);
    }
  };

  return (
    <DashboardLayout title="Transmissões ao SISCOMEX">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao' },
          { label: 'Transmissões ao SISCOMEX' },
        ]}
      />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Transmissões ao SISCOMEX</h1>
          <p className="text-sm text-gray-400">
            Acompanhe as filas por catálogo, o progresso por blocos e as retomadas de transmissão.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="accent"
            className="flex items-center gap-2"
            onClick={() => router.push('/automacao/transmissoes-siscomex/produtos')}
          >
            <PlayCircle size={18} />
            Nova transmissão de produtos
          </Button>
          <Button
            variant="primary"
            className="flex items-center gap-2"
            onClick={() => router.push('/automacao/transmissoes-siscomex/operadores')}
          >
            <PlayCircle size={18} />
            Nova transmissão de operadores
          </Button>
        </div>
      </div>

      {!carregando && (
        <Card className="mb-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_auto] lg:items-end">
            <MultiSelect
              label="Status da transmissão"
              options={statusOptions}
              values={statusSelecionados}
              onChange={valores => setStatusSelecionados(valores as TransmissaoStatus[])}
              placeholder="Todos os status"
              hint="Por padrão, a tela destaca transmissões ativas ou que exigem atenção."
            />

            <div className="flex flex-wrap items-center gap-2 pb-4 lg:justify-end">
              <Button
                type="button"
                variant={filtroPadraoAtivo ? 'accent' : 'outline'}
                onClick={() => setStatusSelecionados(STATUS_ATIVOS_PADRAO)}
              >
                Somente ativas
              </Button>
              <Button
                type="button"
                variant={statusSelecionados.length === 0 ? 'accent' : 'outline'}
                onClick={() => setStatusSelecionados([])}
              >
                Mostrar todas
              </Button>
            </div>
          </div>

          <p className="text-sm text-gray-400">
            Exibindo {transmissoesFiltradas.length} de {transmissoes.length} transmissão(ões).
          </p>
        </Card>
      )}

      {carregando ? (
        <PageLoader message="Carregando transmissões..." />
      ) : (
        <Card>
          {recarregando && (
            <div className="border-b border-slate-800/60 px-4 py-3 text-xs text-sky-300">
              Atualizando andamento das transmissões...
            </div>
          )}
          {transmissoes.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <FileDown className="mx-auto mb-3" size={32} />
              Nenhuma transmissão registrada até o momento.
            </div>
          ) : transmissoesFiltradas.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <FileDown className="mx-auto mb-3" size={32} />
              Nenhuma transmissão encontrada para os status selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                  <tr>
                    <th className="w-56 px-4 py-3 text-center">Ações</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Modalidade</th>
                    <th className="px-4 py-3">Catálogo</th>
                    <th className="px-4 py-3">Progresso</th>
                    <th className="px-4 py-3">Enfileirada em</th>
                    <th className="px-4 py-3">Concluída em</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transmissoesFiltradas.map(transmissao => (
                    <tr
                      key={transmissao.id}
                      className="border-b border-slate-800/60 hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-2">
                          {transmissao.status === 'AGUARDANDO_CONFIRMACAO' && (
                            <Button
                              variant="accent"
                              size="xs"
                              className="w-full justify-center"
                              onClick={() =>
                                router.push(
                                  `/automacao/transmissoes-siscomex/${transmissao.id}/confirmar`
                                )
                              }
                            >
                              Revisar e transmitir
                            </Button>
                          )}
                          {transmissao.status === 'INTERROMPIDA' && (
                            <Button
                              variant="accent"
                              size="xs"
                              className="w-full justify-center"
                              disabled={acaoTransmissaoId === transmissao.id}
                              onClick={() => continuarTransmissao(transmissao.id)}
                            >
                              {acaoTransmissaoId === transmissao.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                'Continuar transmissão'
                              )}
                            </Button>
                          )}
                          <div className="flex items-center justify-center gap-2">
                            <button
                              className="rounded bg-slate-800 p-2 text-gray-200 hover:bg-slate-700 hover:text-white"
                              title="Visualizar detalhes"
                              onClick={() =>
                                router.push(`/automacao/transmissoes-siscomex/${transmissao.id}`)
                              }
                            >
                              <Eye size={18} />
                            </button>
                            <button
                              className="rounded bg-slate-800 p-2 text-gray-200 hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                              title="Baixar payload de envio"
                              disabled={!transmissao.payloadEnvioUrl}
                              onClick={() =>
                                baixarArquivo(
                                  transmissao.id,
                                  'envio',
                                  transmissao.payloadEnvioUrl
                                )
                              }
                            >
                              <FileDown size={18} />
                            </button>
                            <button
                              className="rounded bg-slate-800 p-2 text-gray-200 hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                              title="Baixar retorno"
                              disabled={!transmissao.payloadRetornoUrl}
                              onClick={() =>
                                baixarArquivo(
                                  transmissao.id,
                                  'retorno',
                                  transmissao.payloadRetornoUrl
                                )
                              }
                            >
                              <Loader2 size={18} />
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        <div className="font-medium">Transmissão #{transmissao.id}</div>
                        <div className="mt-1 text-xs text-gray-400">
                          {obterResumoFila(transmissao)}
                        </div>
                        {ehOrigemAjusteEstrutura(transmissao.origemTipo) && (
                          <div className="mt-1 text-xs text-amber-300">
                            {obterResumoOrigemTransmissao(
                              transmissao.origemTipo,
                              transmissao.origemContexto
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        {transmissao.modalidade === 'PRODUTOS'
                          ? 'Produtos'
                          : 'Operadores estrangeiros'}
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        <span className="font-medium">{transmissao.catalogo.nome}</span>
                        <span className="block text-xs text-gray-400">
                          Catálogo Nº {transmissao.catalogo.numero ?? '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        <div>{obterResumoExecucao(transmissao)}</div>
                        {(transmissao.totalBlocos ?? 0) > 0 && (
                          <div className="mt-1 text-xs text-gray-400">
                            {transmissao.blocosConcluidos ?? 0}/{transmissao.totalBlocos} bloco(s)
                            concluído(s)
                          </div>
                        )}
                        {transmissao.totalErro > 0 && (
                          <div className="mt-1 text-xs text-red-400">
                            {transmissao.totalErro} com erro
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        {formatarData(transmissao.enfileiradaEm || transmissao.iniciadoEm)}
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        {formatarData(transmissao.concluidoEm)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${obterClasseStatus(
                            transmissao.status
                          )}`}
                        >
                          {obterEtiquetaStatus(transmissao.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </DashboardLayout>
  );
}
