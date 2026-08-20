import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  PackageSearch,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
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
  obterDetalhesOrigemTransmissao,
  obterRotuloOrigemTransmissao,
  obterResumoOrigemTransmissao,
} from '@/lib/transmissao-origem';

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

interface TransmissaoItem {
  id: number;
  produtoId: number;
  operacao: TransmissaoItemOperacao;
  status: TransmissaoItemStatus;
  mensagem?: string | null;
  retornoCodigo?: string | null;
  produto?: {
    id: number;
    codigo?: string | null;
    denominacao?: string | null;
    status?: string | null;
    situacao?: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO' | null;
    versao?: string | null;
    catalogoId?: number | null;
  } | null;
}

interface TransmissaoDetalhe {
  id: number;
  catalogoId: number;
  catalogo: CatalogoResumo;
  modalidade: 'PRODUTOS' | 'OPERADORES_ESTRANGEIROS';
  origemTipo?: TransmissaoOrigemTipo;
  origemContexto?: TransmissaoOrigemContexto | null;
  status: TransmissaoStatus;
  totalItens: number;
  totalSucesso: number;
  totalErro: number;
  totalBlocos?: number;
  filaCatalogoPosicao?: number | null;
  blocos?: ResumoBloco[];
  criadoEm?: string | null;
  iniciadoEm?: string | null;
  concluidoEm?: string | null;
  itens: TransmissaoItem[];
}

function formatarData(dataIso?: string | null) {
  if (!dataIso) return '-';
  return new Date(dataIso).toLocaleString('pt-BR');
}

function obterClasseStatusProduto(status?: string | null) {
  switch (status) {
    case 'APROVADO':
      return 'border border-emerald-500/30 bg-emerald-400/10 text-emerald-300';
    case 'ERRO':
      return 'border border-red-500/30 bg-red-400/10 text-red-300';
    case 'TRANSMITIDO':
      return 'border border-sky-500/30 bg-sky-400/10 text-sky-300';
    default:
      return 'border border-slate-600/60 bg-slate-700/40 text-gray-300';
  }
}

function obterClasseSituacao(situacao?: string | null) {
  switch (situacao) {
    case 'ATIVADO':
      return 'border border-sky-500/30 bg-sky-400/10 text-sky-300';
    case 'RASCUNHO':
      return 'border border-amber-500/30 bg-amber-400/10 text-amber-300';
    default:
      return 'border border-slate-600/60 bg-slate-700/40 text-gray-300';
  }
}

function formatarOperacaoItem(operacao: TransmissaoItemOperacao) {
  if (operacao === 'NOVA_VERSAO') return 'Nova versão';
  if (operacao === 'RETIFICACAO') return 'Retificação';
  return 'Inclusão';
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

export default function ConfirmarTransmissaoProdutosPage() {
  const router = useRouter();
  const { id } = router.query;
  const { addToast } = useToast();
  const [transmissao, setTransmissao] = useState<TransmissaoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [transmitindo, setTransmitindo] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [removendoItemId, setRemovendoItemId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacaoCancelamentoAberta, setConfirmacaoCancelamentoAberta] =
    useState(false);

  const transmissaoId = useMemo(() => {
    if (!id) return null;
    const valor = Array.isArray(id) ? Number(id[0]) : Number(id);
    return Number.isFinite(valor) ? valor : null;
  }, [id]);

  const carregarTransmissao = useCallback(
    async (identificador: number, silencioso = false) => {
      try {
        const resposta = await api.get<TransmissaoDetalhe>(
          `/siscomex/transmissoes/${identificador}`
        );
        setTransmissao(resposta.data);
        setErro(null);
      } catch (error) {
        console.error('Erro ao carregar transmissão para confirmação:', error);
        const mensagem = extrairMensagemErro(
          error,
          'Não foi possível carregar a revisão da transmissão.'
        );
        if (!silencioso) {
          addToast(mensagem, 'error');
        }
        setErro(mensagem);
      } finally {
        if (!silencioso) {
          setCarregando(false);
        }
      }
    },
    [addToast]
  );

  useEffect(() => {
    if (!transmissaoId) return;
    carregarTransmissao(transmissaoId);
  }, [carregarTransmissao, transmissaoId]);

  const resumo = useMemo(() => {
    if (!transmissao) {
      return { total: 0, inclusoes: 0, novasVersoes: 0, retificacoes: 0, ativados: 0, rascunhos: 0, desativados: 0 };
    }

    return transmissao.itens.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.operacao === 'NOVA_VERSAO') acc.novasVersoes += 1;
        else if (item.operacao === 'RETIFICACAO') acc.retificacoes += 1;
        else acc.inclusoes += 1;
        if (item.produto?.situacao === 'ATIVADO') acc.ativados += 1;
        if (item.produto?.situacao === 'RASCUNHO') acc.rascunhos += 1;
        if (item.produto?.situacao === 'DESATIVADO') acc.desativados += 1;
        return acc;
      },
      { total: 0, inclusoes: 0, novasVersoes: 0, retificacoes: 0, ativados: 0, rascunhos: 0, desativados: 0 }
    );
  }, [transmissao]);

  const detalhesOrigem = useMemo(
    () => obterDetalhesOrigemTransmissao(transmissao?.origemTipo, transmissao?.origemContexto),
    [transmissao?.origemContexto, transmissao?.origemTipo]
  );

  const inconsistencias = useMemo(() => {
    if (!transmissao) {
      return [];
    }

    const mensagens: string[] = [];
    const itensSemProduto = transmissao.itens.filter(item => !item.produto);
    const itensDeOutroCatalogo = transmissao.itens.filter(
      item => item.produto?.catalogoId && item.produto.catalogoId !== transmissao.catalogoId
    );
    const itensNaoAprovados = transmissao.itens.filter(item => {
      if (!item.produto?.status) return false;
      if (item.operacao === 'RETIFICACAO') {
        return item.produto.status !== 'APROVADO' && item.produto.status !== 'TRANSMITIDO';
      }
      return item.produto.status !== 'APROVADO';
    });
    const itensSituacaoInvalida = transmissao.itens.filter(item => {
      if (!item.produto?.situacao) return false;
      if (item.operacao === 'RETIFICACAO') {
        return item.produto.situacao !== 'DESATIVADO';
      }
      return item.produto.situacao !== 'RASCUNHO' && item.produto.situacao !== 'ATIVADO';
    });
    const itensAtivadosSemCodigo = transmissao.itens.filter(
      item => item.produto?.situacao === 'ATIVADO' && !String(item.produto?.codigo || '').trim()
    );
    const itensRetificacaoSemCodigo = transmissao.itens.filter(
      item => item.operacao === 'RETIFICACAO' && !String(item.produto?.codigo || '').trim()
    );
    const itensRetificacaoSemVersao = transmissao.itens.filter(
      item => item.operacao === 'RETIFICACAO' && !String(item.produto?.versao || '').trim()
    );

    if (itensSemProduto.length > 0) {
      mensagens.push(
        `${itensSemProduto.length} item(ns) perderam o vínculo com o produto original.`
      );
    }
    if (itensDeOutroCatalogo.length > 0) {
      mensagens.push(`${itensDeOutroCatalogo.length} produto(s) pertencem a outro catálogo.`);
    }
    if (itensNaoAprovados.length > 0) {
      mensagens.push(`${itensNaoAprovados.length} produto(s) não estão com status permitido para a operação.`);
    }
    if (itensSituacaoInvalida.length > 0) {
      mensagens.push(
        `${itensSituacaoInvalida.length} produto(s) estão fora das situações permitidas para transmissão.`
      );
    }
    if (itensAtivadosSemCodigo.length > 0) {
      mensagens.push(
        `${itensAtivadosSemCodigo.length} produto(s) ativados estão sem código SISCOMEX para nova versão.`
      );
    }
    if (itensRetificacaoSemCodigo.length > 0) {
      mensagens.push(
        `${itensRetificacaoSemCodigo.length} produto(s) de retificação estão sem código SISCOMEX.`
      );
    }
    if (itensRetificacaoSemVersao.length > 0) {
      mensagens.push(
        `${itensRetificacaoSemVersao.length} produto(s) de retificação estão sem versão SISCOMEX.`
      );
    }

    return mensagens;
  }, [transmissao]);

  const aguardandoConfirmacao = transmissao?.status === 'AGUARDANDO_CONFIRMACAO';
  const interrompida = transmissao?.status === 'INTERROMPIDA';
  const podeTransmitir = Boolean(
    transmissao &&
      (aguardandoConfirmacao || interrompida) &&
      transmissao.itens.length > 0 &&
      inconsistencias.length === 0
  );
  const totalBlocosEstimado =
    transmissao?.totalBlocos ??
    (transmissao ? Math.max(1, Math.ceil(transmissao.itens.length / 100)) : 0);

  const removerItem = async (itemId: number) => {
    if (!transmissaoId || !aguardandoConfirmacao) return;

    setRemovendoItemId(itemId);
    try {
      await api.delete(`/siscomex/transmissoes/${transmissaoId}/itens/${itemId}`);
      await carregarTransmissao(transmissaoId, true);
      addToast('Item removido da pré-transmissão.', 'success');
    } catch (error) {
      console.error('Erro ao remover item da pré-transmissão:', error);
      addToast(
        extrairMensagemErro(error, 'Não foi possível remover o item da pré-transmissão.'),
        'error'
      );
    } finally {
      setRemovendoItemId(null);
    }
  };

  const iniciarOuRetomarTransmissao = async () => {
    if (!transmissaoId || !podeTransmitir) return;

    setTransmitindo(true);
    try {
      const resposta = await api.post(`/siscomex/transmissoes/${transmissaoId}/iniciar`);
      const idDetalhe = resposta.data?.dados?.transmissaoId ?? transmissaoId;
      addToast(
        resposta.data?.mensagem ||
          (interrompida
            ? 'Transmissão recolocada na fila do catálogo.'
            : 'Transmissão enfileirada.'),
        'success'
      );
      await router.push(`/automacao/transmissoes-siscomex/${idDetalhe}`);
    } catch (error) {
      console.error('Erro ao iniciar transmissão:', error);
      const mensagem = extrairMensagemErro(error, 'Não foi possível iniciar a transmissão.');
      setErro(mensagem);
      addToast(mensagem, 'error');
      await carregarTransmissao(transmissaoId, true);
    } finally {
      setTransmitindo(false);
    }
  };

  const cancelarPreTransmissao = async () => {
    if (!transmissaoId || !aguardandoConfirmacao) return;

    setCancelando(true);
    try {
      await api.post(`/siscomex/transmissoes/${transmissaoId}/cancelar`);
      addToast('Pré-transmissão cancelada com sucesso.', 'success');
      await router.push('/automacao/transmissoes-siscomex');
    } catch (error) {
      console.error('Erro ao cancelar pré-transmissão:', error);
      addToast(
        extrairMensagemErro(error, 'Não foi possível cancelar a pré-transmissão.'),
        'error'
      );
    } finally {
      setCancelando(false);
      setConfirmacaoCancelamentoAberta(false);
    }
  };

  if (carregando) {
    return (
      <DashboardLayout title="Confirmar transmissão de produtos">
        <PageLoader message="Carregando revisão da transmissão..." />
      </DashboardLayout>
    );
  }

  if (!transmissao || !transmissaoId) {
    return (
      <DashboardLayout title="Confirmar transmissão de produtos">
        <Card className="p-6 text-gray-300">
          {erro || 'Nenhuma transmissão localizada para o identificador informado.'}
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Confirmar transmissão de produtos">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao' },
          { label: 'Transmissões ao SISCOMEX', href: '/automacao/transmissoes-siscomex' },
          {
            label: `Transmissão #${transmissao.id}`,
            href: `/automacao/transmissoes-siscomex/${transmissao.id}`,
          },
          { label: 'Confirmar' },
        ]}
      />

      <div className="mb-6 flex items-center justify-between gap-4">
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
            <h1 className="text-2xl font-semibold text-white">Confirmar transmissão em lote</h1>
            <p className="text-sm text-gray-400">
              Revise os produtos antes de enfileirar o envio individual, sequencial e assíncrono.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push('/automacao/transmissoes-siscomex')}
          >
            Fechar revisão
          </Button>
          <Button
            variant="accent"
            className="flex items-center gap-2"
            disabled={!podeTransmitir || transmitindo}
            onClick={iniciarOuRetomarTransmissao}
          >
            {transmitindo ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            {interrompida ? 'Continuar transmissão' : 'Transmitir agora'}
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Catálogo</div>
            <div className="text-sm text-gray-100">
              Nº {transmissao.catalogo.numero ?? '-'} · {transmissao.catalogo.nome}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Origem</div>
            <div className="text-sm text-gray-100">
              {obterRotuloOrigemTransmissao(transmissao.origemTipo)}
            </div>
            {ehOrigemAjusteEstrutura(transmissao.origemTipo) && (
              <div className="mt-1 text-xs text-amber-300">
                {obterResumoOrigemTransmissao(transmissao.origemTipo, transmissao.origemContexto)}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Criada em</div>
            <div className="text-sm text-gray-100">{formatarData(transmissao.criadoEm)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Status</div>
            <div className="text-sm text-gray-100">
              {aguardandoConfirmacao
                ? 'Aguardando confirmação'
                : interrompida
                  ? 'Interrompida'
                  : 'Já iniciada'}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-800 pt-4 md:grid-cols-3">
          <div className="text-sm text-gray-300">
            <span className="text-gray-500">Blocos previstos:</span> {totalBlocosEstimado}
          </div>
          <div className="text-sm text-gray-300">
            <span className="text-gray-500">Tamanho máximo por bloco:</span> 100 produtos
          </div>
          <div className="text-sm text-gray-300">
            <span className="text-gray-500">Posição atual na fila:</span>{' '}
            {transmissao.filaCatalogoPosicao ?? 'a definir após o enfileiramento'}
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

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-5">
        <Card>
          <div className="text-sm text-gray-400">Produtos selecionados</div>
          <div className="text-2xl font-semibold text-white">{resumo.total}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400">Inclusões</div>
          <div className="text-2xl font-semibold text-amber-300">{resumo.inclusoes}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400">Novas versões</div>
          <div className="text-2xl font-semibold text-sky-300">{resumo.novasVersoes}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400">Retificações</div>
          <div className="text-2xl font-semibold text-violet-300">{resumo.retificacoes}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400">Ativados / Rascunhos / Desativados</div>
          <div className="text-2xl font-semibold text-white">
            {resumo.ativados} / {resumo.rascunhos} / {resumo.desativados}
          </div>
        </Card>
      </div>

      {erro && (
        <div className="mb-4 flex items-center gap-3 rounded border border-gray-700 bg-[#1f2937] p-4 text-gray-100">
          <AlertCircle size={18} className="text-[#f59e0b]" />
          <span>{erro}</span>
        </div>
      )}

      {!aguardandoConfirmacao && !interrompida && (
        <Card className="mb-6 border-slate-600/60">
          <div className="text-sm text-gray-200">
            Esta transmissão já saiu da etapa de confirmação. Abra o detalhe para acompanhar o
            progresso ou consultar o histórico.
          </div>
        </Card>
      )}

      {interrompida && (
        <Card className="mb-6 border-orange-500/40">
          <div className="text-sm text-orange-200">
            Esta transmissão foi interrompida. Os itens já concluídos serão preservados e apenas os
            pendentes voltarão para a fila quando você confirmar a continuação.
          </div>
        </Card>
      )}

      {inconsistencias.length > 0 && (aguardandoConfirmacao || interrompida) && (
        <Card className="mb-6 border-amber-500/40">
          <div className="flex items-start gap-3">
            <TriangleAlert size={18} className="mt-1 text-amber-300" />
            <div>
              <h2 className="text-sm font-semibold text-amber-200">
                Revise os itens abaixo antes do envio
              </h2>
              <ul className="mt-2 space-y-1 text-sm text-gray-200">
                {inconsistencias.map(mensagem => (
                  <li key={mensagem}>{mensagem}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {transmissao.itens.length === 0 ? (
        <Card className="mb-6">
          <div className="py-10 text-center text-gray-300">
            <PackageSearch className="mx-auto mb-3 text-gray-500" size={32} />
            <p className="mb-4">Nenhum produto permanece nesta transmissão.</p>
          </div>
        </Card>
      ) : (
        <Card className="mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Denominação</th>
                  <th className="px-4 py-3">Operação</th>
                  <th className="px-4 py-3">Versão</th>
                  <th className="px-4 py-3">Status atual</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="w-20 px-4 py-3 text-center">Ação</th>
                </tr>
              </thead>
              <tbody>
                {transmissao.itens.map(item => {
                  const codigo = String(item.produto?.codigo || '').trim();
                  return (
                    <tr key={item.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                      <td className="px-4 py-3 text-gray-200">
                        {codigo || `#${item.produtoId}`}
                        {!codigo && item.produto?.situacao === 'ATIVADO' && (
                          <div className="mt-1 text-xs text-amber-300">
                            Ativado sem código SISCOMEX.
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        {item.produto?.denominacao || 'Produto indisponível'}
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        {formatarOperacaoItem(item.operacao)}
                      </td>
                      <td className="px-4 py-3 text-gray-200">{item.produto?.versao ?? '-'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${obterClasseStatusProduto(
                            item.produto?.status
                          )}`}
                        >
                          {item.produto?.status || 'Indisponível'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${obterClasseSituacao(
                            item.produto?.situacao
                          )}`}
                        >
                          {item.produto?.situacao || 'Indisponível'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {aguardandoConfirmacao ? (
                          <button
                            type="button"
                            onClick={() => removerItem(item.id)}
                            disabled={removendoItemId === item.id}
                            className="inline-flex items-center justify-center rounded-md bg-red-500/10 p-2 text-red-300 transition-colors hover:bg-red-500/20 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Remover produto ${
                              item.produto?.codigo || item.produto?.denominacao || item.produtoId
                            } da transmissão`}
                            title="Remover da transmissão"
                          >
                            {removendoItemId === item.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500">Bloqueada</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-sm text-gray-400">
            {aguardandoConfirmacao
              ? 'Remova os itens que não devem seguir para o SISCOMEX. O enfileiramento final usará somente os produtos desta revisão.'
              : 'Os itens exibidos refletem o estado persistido da transmissão. Em retomadas, apenas os pendentes serão processados novamente.'}
          </div>
        </Card>
      )}

      {aguardandoConfirmacao && (
        <Card className="border-slate-700">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Cancelar pré-transmissão</h2>
              <p className="text-sm text-gray-400">
                Fechar a revisão não apaga o registro. Use o cancelamento abaixo apenas se esta
                pré-transmissão não deve mais existir.
              </p>
            </div>
            <Button
              variant="danger"
              onClick={() => setConfirmacaoCancelamentoAberta(true)}
            >
              Cancelar pré-transmissão
            </Button>
          </div>

          {confirmacaoCancelamentoAberta && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <p className="mb-4 text-sm text-gray-200">
                Deseja manter esta pré-transmissão para revisar depois, cancelar o registro ou
                continuar revisando agora?
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => router.push('/automacao/transmissoes-siscomex')}
                >
                  Manter para transmitir depois
                </Button>
                <Button
                  variant="danger"
                  className="flex items-center gap-2"
                  disabled={cancelando}
                  onClick={cancelarPreTransmissao}
                >
                  {cancelando ? <Loader2 size={16} className="animate-spin" /> : null}
                  Cancelar pré-transmissão
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setConfirmacaoCancelamentoAberta(false)}
                >
                  Continuar revisando
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </DashboardLayout>
  );
}
