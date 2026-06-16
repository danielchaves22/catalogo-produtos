import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Eye, FileDown, Loader2, PlayCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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

type TransmissaoStatus =
  | 'AGUARDANDO_CONFIRMACAO'
  | 'EM_FILA'
  | 'PROCESSANDO'
  | 'CONCLUIDO'
  | 'FALHO'
  | 'PARCIAL'
  | 'CANCELADA';
type ModalidadeTransmissao = 'PRODUTOS' | 'OPERADORES_ESTRANGEIROS';

interface TransmissaoListagem {
  id: number;
  modalidade: ModalidadeTransmissao;
  catalogo: CatalogoResumo;
  origemTipo?: TransmissaoOrigemTipo;
  origemContexto?: TransmissaoOrigemContexto | null;
  totalItens: number;
  totalSucesso: number;
  totalErro: number;
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
      return 'Concluído';
    case 'CANCELADA':
      return 'Cancelada';
    case 'FALHO':
      return 'Erro';
    case 'PARCIAL':
      return 'Parcial';
    case 'PROCESSANDO':
      return 'Processando';
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
    default:
      return 'border border-amber-500/40 bg-amber-400/10 text-amber-400';
  }
}

function obterResumoTotais(transmissao: TransmissaoListagem) {
  if (transmissao.status === 'AGUARDANDO_CONFIRMACAO') {
    return `${transmissao.totalItens} preparado(s)`;
  }

  if (transmissao.status === 'CANCELADA') {
    return `${transmissao.totalItens} item(ns) cancelado(s)`;
  }

  return `${transmissao.totalSucesso}/${transmissao.totalItens} concluídos`;
}

export default function TransmissoesSiscomexPage() {
  const [transmissoes, setTransmissoes] = useState<TransmissaoListagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [recarregando, setRecarregando] = useState(false);
  const { addToast } = useToast();
  const router = useRouter();

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

  const possuiTransmissaoAtiva = useMemo(
    () => transmissoes.some(item => item.status === 'EM_FILA' || item.status === 'PROCESSANDO'),
    [transmissoes]
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
            Acompanhe as transmissões de produtos e operadores estrangeiros.
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

      {carregando ? (
        <PageLoader message="Carregando transmissões..." />
      ) : (
        <Card>
          {recarregando && (
            <div className="border-b border-slate-800/60 px-4 py-3 text-xs text-sky-300">
              Atualizando progresso das transmissões...
            </div>
          )}
          {transmissoes.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <FileDown className="mx-auto mb-3" size={32} />
              Nenhuma transmissão registrada até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                  <tr>
                    <th className="w-48 px-4 py-3 text-center">Ações</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Modalidade</th>
                    <th className="px-4 py-3">Catálogo</th>
                    <th className="px-4 py-3">Totais</th>
                    <th className="px-4 py-3">Iniciada em</th>
                    <th className="px-4 py-3">Concluída em</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transmissoes.map(transmissao => (
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
                              disabled={
                                !transmissao.payloadEnvioUrl ||
                                transmissao.status === 'EM_FILA' ||
                                transmissao.status === 'PROCESSANDO'
                              }
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
                          : 'Operadores Estrangeiros'}
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        <span className="font-medium">{transmissao.catalogo.nome}</span>
                        <span className="block text-xs text-gray-400">
                          Catálogo Nº {transmissao.catalogo.numero ?? '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        {obterResumoTotais(transmissao)}
                        {transmissao.totalErro > 0 && (
                          <span className="ml-1 text-red-400">
                            ({transmissao.totalErro} com erro)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        {formatarData(transmissao.iniciadoEm)}
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
