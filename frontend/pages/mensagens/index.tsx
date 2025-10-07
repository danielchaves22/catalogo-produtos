// frontend/pages/mensagens/index.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Trash2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Mensagem, MensagemCategoria, MensagemStatusFiltro, useMessages } from '@/contexts/MessagesContext';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';

const STATUS_FILTROS: { label: string; valor: MensagemStatusFiltro }[] = [
  { label: 'Não lidas', valor: 'NAO_LIDAS' },
  { label: 'Lidas', valor: 'LIDAS' },
  { label: 'Todas', valor: 'TODAS' },
];

const STATUS_ORDEM: MensagemStatusFiltro[] = ['TODAS', 'LIDAS', 'NAO_LIDAS'];

const CATEGORIA_LABELS: Record<MensagemCategoria, string> = {
  ATUALIZACAO_SISCOMEX: 'Atualização do SISCOMEX',
  IMPORTACAO_CONCLUIDA: 'Importação concluída',
};

function extrairImportacaoId(metadados: Mensagem['metadados']): number | null {
  if (!metadados || typeof metadados !== 'object') {
    return null;
  }

  const registro = metadados as Record<string, unknown>;
  const valor = registro.importacaoId;

  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return valor;
  }

  if (typeof valor === 'string') {
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : null;
  }

  return null;
}

export default function MensagensPage() {
  const router = useRouter();
  const { listMessages, getMessage, markAsRead, listarCategorias, removerMensagem } = useMessages();
  const { addToast } = useToast();

  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [mensagemSelecionada, setMensagemSelecionada] = useState<Mensagem | null>(null);
  const [statusFiltro, setStatusFiltro] = useState<MensagemStatusFiltro>('TODAS');
  const [categoriaFiltro, setCategoriaFiltro] = useState<MensagemCategoria | 'TODAS'>('TODAS');
  const [categoriasDisponiveis, setCategoriasDisponiveis] = useState<MensagemCategoria[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [removendoMensagemId, setRemovendoMensagemId] = useState<number | null>(null);
  const [mensagemParaExcluirId, setMensagemParaExcluirId] = useState<number | null>(null);
  const [motivoModalExclusao, setMotivoModalExclusao] = useState<'PADRAO' | 'OBSOLETA' | null>(null);
  const [verificandoImportacao, setVerificandoImportacao] = useState(false);

  const importacaoIdAcao = useMemo(() => {
    if (!mensagemSelecionada || mensagemSelecionada.categoria !== 'IMPORTACAO_CONCLUIDA') {
      return null;
    }
    return extrairImportacaoId(mensagemSelecionada.metadados);
  }, [mensagemSelecionada]);

  const abrirDetalhesImportacao = useCallback(async () => {
    if (importacaoIdAcao === null || !mensagemSelecionada) {
      return;
    }

    setVerificandoImportacao(true);
    try {
      await api.get(`/produtos/importacoes/${importacaoIdAcao}`);
      await router.push(`/automacao/importar-produto/${importacaoIdAcao}`);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404) {
        setMotivoModalExclusao('OBSOLETA');
        setMensagemParaExcluirId(mensagemSelecionada.id);
      } else {
        addToast('Não foi possível abrir os detalhes da importação. Tente novamente.', 'error');
        console.error('Erro ao abrir detalhes da importação:', error);
      }
    } finally {
      setVerificandoImportacao(false);
    }
  }, [importacaoIdAcao, mensagemSelecionada, router, addToast]);

  const categoriaOptions = useMemo(() => {
    const items = categoriasDisponiveis.map((categoria) => ({
      valor: categoria,
      label: CATEGORIA_LABELS[categoria] ?? categoria,
    }));
    return [{ valor: 'TODAS' as const, label: 'Todas as categorias' }, ...items];
  }, [categoriasDisponiveis]);

  useEffect(() => {
    async function carregarCategorias() {
      try {
        const categorias = await listarCategorias();
        setCategoriasDisponiveis(categorias);
      } catch (error) {
        console.error('Erro ao carregar categorias de mensagens:', error);
      }
    }

    carregarCategorias();
  }, [listarCategorias]);

  useEffect(() => {
    async function carregarMensagens() {
      setCarregandoLista(true);
      try {
        const categoria = categoriaFiltro === 'TODAS' ? undefined : categoriaFiltro;
        const resposta = await listMessages(statusFiltro, categoria);
        setMensagens(resposta.mensagens);

        if (resposta.mensagens.length > 0) {
          setMensagemSelecionada((atual) => {
            if (!atual) {
              return resposta.mensagens[0];
            }
            const encontrada = resposta.mensagens.find((msg) => msg.id === atual.id);
            return encontrada ?? resposta.mensagens[0];
          });
        } else {
          setMensagemSelecionada((atual) => {
            if (atual && statusFiltro === 'NAO_LIDAS') {
              return atual;
            }
            return null;
          });
        }
      } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
        setMensagens([]);
      } finally {
        setCarregandoLista(false);
      }
    }

    carregarMensagens();
  }, [listMessages, statusFiltro, categoriaFiltro]);

  useEffect(() => {
    const { mensagem } = router.query;
    if (!router.isReady || !mensagem) {
      return;
    }

    const mensagemId = Number(mensagem);
    if (Number.isNaN(mensagemId)) {
      return;
    }

    selecionarMensagem(mensagemId, { atualizarUrl: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.mensagem]);

  async function selecionarMensagem(id: number, options: { atualizarUrl?: boolean } = {}) {
    setCarregandoDetalhe(true);
    try {
      let mensagem = mensagens.find((item) => item.id === id) ?? null;

      if (!mensagem) {
        try {
          mensagem = await getMessage(id);
        } catch (error) {
          console.error('Erro ao carregar mensagem selecionada:', error);
        }
      }

      if (mensagem && !mensagem.lida) {
        try {
          const mensagemAtualizada = await markAsRead(id);
          if (mensagemAtualizada) {
            mensagem = mensagemAtualizada;
          }
        } catch (error) {
          console.error('Erro ao marcar mensagem como lida:', error);
        }

        const mensagemFinal = mensagem;
        setMensagens((prev) => {
          if (statusFiltro === 'NAO_LIDAS') {
            return prev.filter((item) => item.id !== id);
          }
          if (!mensagemFinal) {
            return prev.map((item) => (
              item.id === id
                ? { ...item, lida: true, lidaEm: new Date().toISOString() }
                : item
            ));
          }
          return prev.map((item) => (item.id === id ? { ...item, ...mensagemFinal } : item));
        });
      }

      setMensagemSelecionada(mensagem ?? null);

      if (options.atualizarUrl !== false) {
        router.replace(
          {
            pathname: '/mensagens',
            query: { mensagem: id },
          },
          undefined,
          { shallow: true },
        );
      }
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  const abrirConfirmacaoExcluir = useCallback((id: number) => {
    setMotivoModalExclusao('PADRAO');
    setMensagemParaExcluirId(id);
  }, []);

  const cancelarExclusaoMensagem = useCallback(() => {
    setMensagemParaExcluirId(null);
    setMotivoModalExclusao(null);
  }, []);

  const confirmarExclusaoMensagem = useCallback(async () => {
    if (mensagemParaExcluirId == null) return;

    const id = mensagemParaExcluirId;
    setRemovendoMensagemId(id);

    try {
      const removida = await removerMensagem(id);
      if (!removida) {
        return;
      }

      const eraSelecionada = mensagemSelecionada?.id === id;
      let novaSelecionada: Mensagem | null = mensagemSelecionada ?? null;

      setMensagens((prev) => {
        const atualizadas = prev.filter((item) => item.id !== id);
        if (eraSelecionada) {
          novaSelecionada = atualizadas[0] ?? null;
        }
        return atualizadas;
      });

      if (eraSelecionada) {
        setMensagemSelecionada(novaSelecionada);
        if (novaSelecionada) {
          void router.replace(
            {
              pathname: '/mensagens',
              query: { mensagem: novaSelecionada.id },
            },
            undefined,
            { shallow: true },
          );
        } else {
          void router.replace({ pathname: '/mensagens' }, undefined, { shallow: true });
        }
      }
    } catch (error) {
      console.error('Erro ao remover mensagem:', error);
    } finally {
      setRemovendoMensagemId((atual) => (atual === id ? null : atual));
      setMensagemParaExcluirId(null);
      setMotivoModalExclusao(null);
    }
  }, [mensagemParaExcluirId, removerMensagem, mensagemSelecionada, router, setMensagens]);

  const tituloModalExclusao = useMemo(() => {
    if (motivoModalExclusao === 'OBSOLETA') {
      return 'Mensagem obsoleta';
    }
    return 'Confirmar Exclusão';
  }, [motivoModalExclusao]);

  const descricaoModalExclusao = useMemo(() => {
    if (motivoModalExclusao === 'OBSOLETA') {
      return 'O histórico desta importação não está mais disponível. Deseja remover esta mensagem para evitar notificações antigas?';
    }
    return 'Tem certeza que deseja remover esta mensagem? Essa ação não poderá ser desfeita.';
  }, [motivoModalExclusao]);

  const textoBotaoConfirmarModal = useMemo(() => {
    if (motivoModalExclusao === 'OBSOLETA') {
      return removendoMensagemId === mensagemParaExcluirId ? 'Removendo...' : 'Remover mensagem';
    }
    return removendoMensagemId === mensagemParaExcluirId ? 'Removendo...' : 'Remover';
  }, [motivoModalExclusao, removendoMensagemId, mensagemParaExcluirId]);

  const dataFormatada = useMemo(() => {
    if (!mensagemSelecionada) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(mensagemSelecionada.criadaEm));
  }, [mensagemSelecionada]);

  return (
    <DashboardLayout title="Mensagens">
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Mensagens' }]} />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Mensagens</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        <section className="lg:col-span-1 bg-[#151921] border border-gray-800 rounded-lg flex flex-col">
          <header className="hidden">
            <h2 className="text-lg font-semibold text-gray-100">Caixa de entrada</h2>
            <p className="text-sm text-gray-400">Gerencie as mensagens importantes para o seu catálogo.</p>
          </header>

          <div className="px-4 py-3 border-b border-gray-800 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDEM.map((valor) => {
                const filtro = STATUS_FILTROS.find((f) => f.valor === valor);
                const label = filtro?.label ?? valor;
                return (
                  <button
                    key={valor}
                    onClick={() => setStatusFiltro(valor)}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      statusFiltro === valor
                        ? 'border-[#f59e0b] text-[#f59e0b] bg-[#2a2f3a]'
                        : 'border-transparent bg-[#1e232d] text-gray-300 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {categoriaOptions.length > 1 && (
              <div className="flex items-center gap-2 w-full lg:w-auto lg:justify-end">
                <label htmlFor="categoriaFiltro" className="sr-only">
                  Categoria
                </label>
                <select
                  id="categoriaFiltro"
                  className="w-full lg:w-56 bg-[#1e232d] border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#f59e0b]"
                  value={categoriaFiltro}
                  onChange={(event) => setCategoriaFiltro(event.target.value as MensagemCategoria | 'TODAS')}
                >
                  {categoriaOptions.map((categoria) => (
                    <option key={categoria.valor} value={categoria.valor}>
                      {categoria.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {carregandoLista ? (
              <p className="text-sm text-gray-400 px-4 py-6">Carregando mensagens...</p>
            ) : mensagens.length === 0 ? (
              <p className="text-sm text-gray-400 px-4 py-6">
                {statusFiltro === 'NAO_LIDAS'
                  ? 'Nenhuma mensagem não lida encontrada.'
                  : 'Nenhuma mensagem encontrada para o filtro selecionado.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-800">
                {mensagens.map((mensagem) => {
                  const selecionada = mensagemSelecionada?.id === mensagem.id;
                  const removendo = removendoMensagemId === mensagem.id;
                  return (
                    <li key={mensagem.id}>
                      <div
                        className={`flex items-center gap-3 px-4 py-4 transition-colors border-l-4 ${
                          selecionada
                            ? 'bg-[#2a2f3a] border-[#f59e0b]'
                            : 'border-transparent hover:bg-[#1e232d]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => abrirConfirmacaoExcluir(mensagem.id)}
                          className={`p-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 focus:ring-offset-[#151921] ${
                            removendo
                              ? 'text-red-400/70 cursor-wait'
                              : 'text-gray-500 hover:text-red-400 hover:bg-[#1e232d]'
                          }`}
                          aria-label={`Remover mensagem "${mensagem.titulo}"`}
                          disabled={removendo}
                        >
                          <Trash2 size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => selecionarMensagem(mensagem.id)}
                          className="flex-1 text-left"
                        >
                          {/* Linha única: indicador, título (com reticências), categoria e data */}
                          <div className="flex items-center gap-2 min-w-0">
                            {/* Indicador de leitura */}
                            <span
                              aria-hidden
                              className={`h-2 w-2 rounded-full ${mensagem.lida ? 'bg-gray-600' : 'bg-[#f59e0b]'}`}
                            />

                            {/* Título responsivo com reticências */}
                            <h3
                              className={`flex-1 min-w-0 truncate text-sm ${
                                mensagem.lida ? 'text-gray-300' : 'text-gray-100 font-semibold'
                              }`}
                              title={mensagem.titulo}
                            >
                              {mensagem.titulo}
                            </h3>

                            {/* Categoria (não corta) */}
                            <span className="ml-2 shrink-0 text-[11px] uppercase tracking-wide text-[#f59e0b] bg-[#2a2f3a] px-2 py-1 rounded-full">
                              {CATEGORIA_LABELS[mensagem.categoria] ?? mensagem.categoria}
                            </span>

                            {/* Data (não corta) */}
                            <span className="ml-2 shrink-0 whitespace-nowrap text-xs text-gray-400">
                              {new Date(mensagem.criadaEm).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="lg:col-span-2 bg-[#151921] border border-gray-800 rounded-lg p-6 flex flex-col">
          {carregandoDetalhe ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-400">Carregando mensagem...</p>
            </div>
          ) : !mensagemSelecionada ? (
            <div className="flex-1 flex items-center justify-center text-center">
              <div>
                <h2 className="text-lg font-semibold text-gray-200">Selecione uma mensagem</h2>
                <p className="text-sm text-gray-400 mt-2">
                  Escolha uma mensagem na lista ao lado para visualizar os detalhes.
                </p>
              </div>
            </div>
          ) : (
            <article className="flex-1 overflow-y-auto">
              <header className="border-b border-gray-800 pb-4 mb-4">
                <span className="inline-block text-[11px] uppercase tracking-wide text-[#f59e0b] bg-[#2a2f3a] px-2 py-1 rounded-full">
                  {CATEGORIA_LABELS[mensagemSelecionada.categoria] ?? mensagemSelecionada.categoria}
                </span>
                <h1 className="text-2xl font-semibold text-gray-100 mt-3">{mensagemSelecionada.titulo}</h1>
                <p className="text-sm text-gray-400 mt-2">{dataFormatada}</p>
              </header>

              <div className="prose prose-invert max-w-none">
                <p className="whitespace-pre-line text-gray-200 leading-relaxed">
                  {mensagemSelecionada.conteudo}
                </p>
              </div>

              {importacaoIdAcao !== null && (
                <section className="mt-6 border-t border-gray-800 pt-4">
                  <h2 className="text-sm font-semibold text-gray-200 mb-3">Ações</h2>
                  <button
                    type="button"
                    onClick={abrirDetalhesImportacao}
                    disabled={verificandoImportacao}
                    className={`inline-flex items-center px-4 py-2 rounded-md font-semibold transition-colors ${
                      verificandoImportacao
                        ? 'bg-[#f59e0b]/60 text-[#151921]/80 cursor-wait'
                        : 'bg-[#f59e0b] text-[#151921] hover:bg-[#d97706]'
                    }`}
                    aria-label="Abrir detalhes da importação"
                  >
                    {verificandoImportacao ? 'Verificando importação...' : 'Abrir detalhes da importação'}
                  </button>
                </section>
              )}
            </article>
          )}
        </section>
      </div>

      {mensagemParaExcluirId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#151921] rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">{tituloModalExclusao}</h3>
            <p className="text-gray-300 mb-6">{descricaoModalExclusao}</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={cancelarExclusaoMensagem}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={confirmarExclusaoMensagem}
                disabled={removendoMensagemId === mensagemParaExcluirId}
              >
                {textoBotaoConfirmarModal}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

// Modal de confirmação de exclusão
// Inserir o modal no retorno principal
