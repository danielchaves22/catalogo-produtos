import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { AlertCircle, ArrowLeft, Download, Loader2, PlayCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/PageLoader';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import {
  TransmissaoOrigemContexto,
  TransmissaoOrigemTipo,
  ehOrigemAjusteEstrutura,
  obterDetalhesOrigemTransmissao,
  obterRotuloOrigemTransmissao,
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
  iniciadoEm?: string | null;
  concluidoEm?: string | null;
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
type TransmissaoItemStatus = 'PENDENTE' | 'PROCESSANDO' | 'SUCESSO' | 'ERRO';
type TransmissaoItemOperacao = 'INCLUSAO' | 'NOVA_VERSAO' | 'RETIFICACAO';

interface TransmissaoItem {
  id: number;
  blocoId?: number | null;
  ordemExecucao?: number | null;
  produtoId: number;
  operacao: TransmissaoItemOperacao;
  status: TransmissaoItemStatus;
  mensagem?: string | null;
  retornoCodigo?: string | null;
  produto?: {
    id: number;
    codigo?: string | null;
    denominacao?: string | null;
  } | null;
}

interface TransmissaoDetalhe {
  id: number;
  catalogo: CatalogoResumo;
  modalidade: 'PRODUTOS' | 'OPERADORES_ESTRANGEIROS';
  origemTipo?: TransmissaoOrigemTipo;
  origemContexto?: TransmissaoOrigemContexto | null;
  status: TransmissaoStatus;
  totalItens: number;
  totalSucesso: number;
  totalErro: number;
  itensPendentes?: number;
  totalBlocos?: number;
  blocosConcluidos?: number;
  blocoAtual?: ResumoBloco | null;
  filaCatalogoPosicao?: number | null;
  enfileiradaEm?: string | null;
  criadoEm?: string | null;
  iniciadoEm?: string | null;
  concluidoEm?: string | null;
  payloadEnvioUrl?: string | null;
  payloadRetornoUrl?: string | null;
  blocos: ResumoBloco[];
  itens: TransmissaoItem[];
}

function obterClasseItem(status: TransmissaoItemStatus) {
  switch (status) {
    case 'SUCESSO':
      return 'border border-emerald-500/40 bg-emerald-400/10 text-emerald-400';
    case 'ERRO':
      return 'border border-red-500/40 bg-red-400/10 text-red-400';
    case 'PROCESSANDO':
      return 'border border-amber-500/40 bg-amber-400/10 text-amber-400';
    default:
      return 'border border-slate-600/60 bg-slate-700/40 text-gray-300';
  }
}

function formatarOperacaoItem(operacao: TransmissaoItemOperacao) {
  if (operacao === 'NOVA_VERSAO') return 'Nova versão';
  if (operacao === 'RETIFICACAO') return 'Retificação';
  return 'Inclusão';
}

function obterClasseBloco(status: ResumoBloco['status']) {
  switch (status) {
    case 'CONCLUIDO':
      return 'border border-emerald-500/40 bg-emerald-400/10 text-emerald-400';
    case 'FALHO':
      return 'border border-red-500/40 bg-red-400/10 text-red-400';
    case 'PARCIAL':
      return 'border border-amber-500/40 bg-amber-400/10 text-amber-300';
    case 'PROCESSANDO':
      return 'border border-blue-500/40 bg-blue-400/10 text-blue-300';
    case 'INTERROMPIDO':
      return 'border border-orange-500/40 bg-orange-400/10 text-orange-300';
    default:
      return 'border border-slate-600/60 bg-slate-700/40 text-gray-300';
  }
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

export default function DetalheTransmissaoSiscomexPage() {
  const router = useRouter();
  const { id } = router.query;
  const { addToast } = useToast();
  const [transmissao, setTransmissao] = useState<TransmissaoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState(false);
  const [retomando, setRetomando] = useState(false);

  const carregarDetalhe = useCallback(
    async (identificador: number, silencioso = false) => {
      try {
        const resposta = await api.get<TransmissaoDetalhe>(
          `/siscomex/transmissoes/${identificador}`
        );
        setTransmissao(resposta.data);
        setErroCarregamento(false);
      } catch (error) {
        console.error('Erro ao carregar detalhes da transmissão:', error);
        if (!silencioso) {
          addToast('Não foi possível carregar os detalhes da transmissão.', 'error');
        }
        setErroCarregamento(true);
      } finally {
        if (!silencioso) {
          setCarregando(false);
        }
      }
    },
    [addToast]
  );

  useEffect(() => {
    if (!id) return;
    const identificador = Array.isArray(id) ? Number(id[0]) : Number(id);
    if (!Number.isFinite(identificador)) return;

    carregarDetalhe(identificador);
  }, [carregarDetalhe, id]);

  useEffect(() => {
    if (!transmissao || (transmissao.status !== 'EM_FILA' && transmissao.status !== 'PROCESSANDO')) {
      return undefined;
    }

    const intervalo = setInterval(() => {
      carregarDetalhe(transmissao.id, true);
    }, 5000);

    return () => clearInterval(intervalo);
  }, [carregarDetalhe, transmissao]);

  const detalhesOrigem = useMemo(
    () => obterDetalhesOrigemTransmissao(transmissao?.origemTipo, transmissao?.origemContexto),
    [transmissao?.origemContexto, transmissao?.origemTipo]
  );

  const blocosPorId = useMemo(
    () =>
      new Map(
        (transmissao?.blocos ?? []).map(bloco => [
          bloco.id,
          `Bloco ${bloco.ordem}/${transmissao?.totalBlocos ?? transmissao?.blocos.length ?? 0}`,
        ])
      ),
    [transmissao?.blocos, transmissao?.totalBlocos]
  );

  const aguardandoConfirmacao = transmissao?.status === 'AGUARDANDO_CONFIRMACAO';
  const interrompida = transmissao?.status === 'INTERROMPIDA';
  const payloadEnvioDisponivel = Boolean(
    transmissao &&
      transmissao.status !== 'AGUARDANDO_CONFIRMACAO' &&
      transmissao.status !== 'CANCELADA' &&
      transmissao.payloadEnvioUrl
  );
  const payloadRetornoDisponivel = Boolean(transmissao?.payloadRetornoUrl);

  const baixarArquivo = async (tipo: 'envio' | 'retorno', url?: string | null) => {
    if (!transmissao) return;
    try {
      if (url) {
        window.open(url, '_blank');
        return;
      }

      const download = await api.get(`/siscomex/transmissoes/${transmissao.id}/arquivos/${tipo}`, {
        responseType: 'blob',
      });

      const contentType = download.headers['content-type'] as string | undefined;
      if (contentType?.includes('application/json')) {
        const texto = await (download.data as Blob).text();
        try {
          const json = JSON.parse(texto);
          if (json.url) {
            window.open(json.url, '_blank');
            return;
          }
        } catch (_) {}
      }

      const blobUrl = URL.createObjectURL(download.data as Blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `payload-${tipo}-${transmissao.id}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Erro ao baixar payload da transmissão:', error);
      addToast('Não foi possível baixar o payload solicitado.', 'error');
    }
  };

  const retomarTransmissao = async () => {
    if (!transmissao || !interrompida) return;

    setRetomando(true);
    try {
      const resposta = await api.post(`/siscomex/transmissoes/${transmissao.id}/iniciar`);
      addToast(
        resposta.data?.mensagem || 'Transmissão recolocada na fila do catálogo.',
        'success'
      );
      await carregarDetalhe(transmissao.id, true);
    } catch (error) {
      console.error('Erro ao retomar transmissão:', error);
      addToast(
        extrairMensagemErro(error, 'Não foi possível retomar a transmissão.'),
        'error'
      );
    } finally {
      setRetomando(false);
    }
  };

  if (carregando) {
    return (
      <DashboardLayout title="Detalhes da transmissão">
        <PageLoader message="Carregando detalhes da transmissão..." />
      </DashboardLayout>
    );
  }

  if (!transmissao) {
    return (
      <DashboardLayout title="Transmissão não encontrada">
        <Card className="p-6 text-gray-300">
          {erroCarregamento
            ? 'Não foi possível carregar os detalhes da transmissão.'
            : 'Nenhuma transmissão localizada para o identificador informado.'}
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={`Transmissão #${transmissao.id}`}>
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao' },
          { label: 'Transmissões ao SISCOMEX', href: '/automacao/transmissoes-siscomex' },
          { label: `Transmissão #${transmissao.id}` },
        ]}
      />

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/automacao/transmissoes-siscomex')}
            className="text-gray-400 transition-colors hover:text-white"
            aria-label="Voltar para a listagem de transmissões"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-white">Transmissão #{transmissao.id}</h1>
            <p className="text-sm text-gray-400">
              {transmissao.modalidade === 'PRODUTOS'
                ? 'Envio de produtos aprovados ao SISCOMEX com execução individual por blocos.'
                : 'Envio de operadores estrangeiros aprovados ao SISCOMEX.'}
            </p>
            <p className="text-xs text-gray-500">Criada em: {formatarData(transmissao.criadoEm)}</p>
            <p className="text-xs text-gray-500">
              Enfileirada em: {formatarData(transmissao.enfileiradaEm || transmissao.iniciadoEm)}
            </p>
            <p className="text-xs text-gray-500">Concluída em: {formatarData(transmissao.concluidoEm)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {aguardandoConfirmacao && (
            <Button
              variant="accent"
              className="flex items-center gap-2"
              onClick={() =>
                router.push(`/automacao/transmissoes-siscomex/${transmissao.id}/confirmar`)
              }
            >
              <PlayCircle size={16} />
              Revisar e transmitir
            </Button>
          )}
          {interrompida && (
            <Button
              variant="accent"
              className="flex items-center gap-2"
              disabled={retomando}
              onClick={retomarTransmissao}
            >
              {retomando ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
              Continuar transmissão
            </Button>
          )}
          <Button
            variant="outline"
            className="flex items-center gap-2"
            disabled={!payloadEnvioDisponivel}
            onClick={() => baixarArquivo('envio', transmissao.payloadEnvioUrl)}
          >
            <Download size={16} />
            Payload de envio
          </Button>
          <Button
            variant="accent"
            className="flex items-center gap-2"
            disabled={!payloadRetornoDisponivel}
            onClick={() => baixarArquivo('retorno', transmissao.payloadRetornoUrl)}
          >
            <Download size={16} />
            Retorno
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-gray-400">Status da transmissão</div>
            <div className="mt-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${obterClasseStatus(
                  transmissao.status
                )}`}
              >
                {obterEtiquetaStatus(transmissao.status)}
              </span>
            </div>
          </div>
          <div className="text-right text-sm text-gray-300">
            {transmissao.status === 'AGUARDANDO_CONFIRMACAO' &&
              'Esta transmissão ainda não foi enfileirada. Revise os itens antes de iniciar.'}
            {transmissao.status === 'EM_FILA' &&
              `Aguardando sua vez na fila do catálogo. Posição atual: ${
                transmissao.filaCatalogoPosicao ?? '-'
              }.`}
            {transmissao.status === 'PROCESSANDO' &&
              `Processamento em andamento${
                transmissao.blocoAtual ? ` no bloco ${transmissao.blocoAtual.ordem}` : ''
              }.`}
            {transmissao.status === 'INTERROMPIDA' &&
              'O processo foi interrompido e pode ser retomado sem retransmitir os itens já concluídos.'}
            {(transmissao.status === 'CONCLUIDO' ||
              transmissao.status === 'FALHO' ||
              transmissao.status === 'PARCIAL' ||
              transmissao.status === 'CANCELADA') &&
              'O progresso abaixo reflete o histórico persistido desta transmissão.'}
          </div>
        </div>
      </Card>

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Origem</div>
            <div className="mt-1 text-sm text-gray-100">
              {obterRotuloOrigemTransmissao(transmissao.origemTipo)}
            </div>
            {ehOrigemAjusteEstrutura(transmissao.origemTipo) && (
              <div className="mt-1 text-xs text-amber-300">
                {obterResumoOrigemTransmissao(transmissao.origemTipo, transmissao.origemContexto)}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Catálogo</div>
            <div className="mt-1 text-sm text-gray-100">
              Nº {transmissao.catalogo.numero ?? '-'} · {transmissao.catalogo.nome}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Modalidade</div>
            <div className="mt-1 text-sm text-gray-100">
              {transmissao.modalidade === 'PRODUTOS' ? 'Produtos' : 'Operadores estrangeiros'}
            </div>
          </div>
        </div>
        {detalhesOrigem.length > 0 && (
          <div className="mt-4 border-t border-slate-800 pt-4 text-sm text-gray-300">
            {detalhesOrigem.map(detalhe => (
              <div key={detalhe}>{detalhe}</div>
            ))}
          </div>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <div className="text-sm text-gray-400">Itens totais</div>
          <div className="text-2xl font-semibold text-white">{transmissao.totalItens}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400">Transmitidos</div>
          <div className="text-2xl font-semibold text-emerald-400">
            {transmissao.totalSucesso}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400">Pendentes</div>
          <div className="text-2xl font-semibold text-amber-300">
            {transmissao.itensPendentes ?? Math.max(0, transmissao.totalItens - transmissao.totalSucesso - transmissao.totalErro)}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400">Blocos</div>
          <div className="text-2xl font-semibold text-white">
            {transmissao.blocosConcluidos ?? 0}/{transmissao.totalBlocos ?? transmissao.blocos.length}
          </div>
        </Card>
      </div>

      <Card className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Blocos da transmissão</h2>
            <p className="text-sm text-gray-400">
              Cada bloco agrupa até 100 produtos e segue a fila do catálogo.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Bloco</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Progresso</th>
                <th className="px-4 py-3">Iniciado em</th>
                <th className="px-4 py-3">Concluído em</th>
                <th className="px-4 py-3">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {transmissao.blocos.map(bloco => (
                <tr key={bloco.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-gray-200">
                    Bloco {bloco.ordem}/{transmissao.totalBlocos ?? transmissao.blocos.length}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${obterClasseBloco(
                        bloco.status
                      )}`}
                    >
                      {bloco.status === 'CONCLUIDO'
                        ? 'Concluído'
                        : bloco.status === 'PROCESSANDO'
                          ? 'Processando'
                          : bloco.status === 'INTERROMPIDO'
                            ? 'Interrompido'
                            : bloco.status === 'FALHO'
                              ? 'Falho'
                              : bloco.status === 'PARCIAL'
                                ? 'Parcial'
                                : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-200">
                    {bloco.totalSucesso}/{bloco.totalItens} sucesso(s)
                    {bloco.totalErro > 0 && (
                      <span className="ml-1 text-red-400">· {bloco.totalErro} erro(s)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-200">{formatarData(bloco.iniciadoEm)}</td>
                  <td className="px-4 py-3 text-gray-200">{formatarData(bloco.concluidoEm)}</td>
                  <td className="px-4 py-3 text-gray-200">{bloco.mensagem || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
              <tr>
                <th className="w-20 px-4 py-3 text-center">Ordem</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Bloco</th>
                <th className="px-4 py-3">Operação</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {transmissao.itens.map(item => (
                <tr key={item.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-center text-gray-200">
                    {item.ordemExecucao ?? item.id}
                  </td>
                  <td className="px-4 py-3 text-gray-200">
                    <div className="font-semibold">
                      {item.produto?.denominacao ?? 'Produto sem descrição'}
                    </div>
                    <div className="text-xs text-gray-400">ID interno: {item.produtoId}</div>
                    {item.retornoCodigo && (
                      <div className="text-xs text-gray-400">
                        Código SISCOMEX: {item.retornoCodigo}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-200">
                    {item.blocoId ? blocosPorId.get(item.blocoId) || `Bloco #${item.blocoId}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-200">
                    {formatarOperacaoItem(item.operacao)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${obterClasseItem(
                        item.status
                      )}`}
                    >
                      {item.status === 'SUCESSO'
                        ? 'Transmitido'
                        : item.status === 'ERRO'
                          ? 'Erro'
                          : item.status === 'PROCESSANDO'
                            ? 'Processando'
                            : 'Pendente'}
                    </span>
                  </td>
                  <td className="flex items-start gap-2 px-4 py-3 text-gray-200">
                    {item.mensagem ? (
                      <AlertCircle size={14} className="mt-0.5 text-red-400" />
                    ) : null}
                    <span>{item.mensagem || '-'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </DashboardLayout>
  );
}
