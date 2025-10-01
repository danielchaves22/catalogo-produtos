// frontend/pages/mensagens/index.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Mensagem, MensagemCategoria, MensagemStatusFiltro, useMessages } from '@/contexts/MessagesContext';

const STATUS_FILTROS: { label: string; valor: MensagemStatusFiltro }[] = [
  { label: 'Não lidas', valor: 'NAO_LIDAS' },
  { label: 'Lidas', valor: 'LIDAS' },
  { label: 'Todas', valor: 'TODAS' },
];

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
  const { listMessages, getMessage, markAsRead, listarCategorias } = useMessages();

  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [mensagemSelecionada, setMensagemSelecionada] = useState<Mensagem | null>(null);
  const [statusFiltro, setStatusFiltro] = useState<MensagemStatusFiltro>('NAO_LIDAS');
  const [categoriaFiltro, setCategoriaFiltro] = useState<MensagemCategoria | 'TODAS'>('TODAS');
  const [categoriasDisponiveis, setCategoriasDisponiveis] = useState<MensagemCategoria[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const importacaoIdAcao = useMemo(() => {
    if (!mensagemSelecionada || mensagemSelecionada.categoria !== 'IMPORTACAO_CONCLUIDA') {
      return null;
    }
    return extrairImportacaoId(mensagemSelecionada.metadados);
  }, [mensagemSelecionada]);

  const abrirDetalhesImportacao = useCallback(() => {
    if (importacaoIdAcao === null) {
      return;
    }
    void router.push(`/automacao/importar-produto/${importacaoIdAcao}`);
  }, [importacaoIdAcao, router]);

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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        <section className="lg:col-span-1 bg-[#151921] border border-gray-800 rounded-lg flex flex-col">
          <header className="border-b border-gray-800 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-100">Caixa de entrada</h2>
            <p className="text-sm text-gray-400">Gerencie as mensagens importantes para o seu catálogo.</p>
          </header>

          <div className="px-4 py-3 border-b border-gray-800 flex flex-wrap gap-2">
            {STATUS_FILTROS.map((filtro) => (
              <button
                key={filtro.valor}
                onClick={() => setStatusFiltro(filtro.valor)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  statusFiltro === filtro.valor
                    ? 'border-[#f59e0b] text-[#f59e0b] bg-[#2a2f3a]'
                    : 'border-transparent bg-[#1e232d] text-gray-300 hover:text-white'
                }`}
              >
                {filtro.label}
              </button>
            ))}
          </div>

          {categoriaOptions.length > 1 && (
            <div className="px-4 pb-3">
              <label htmlFor="categoriaFiltro" className="block text-xs uppercase tracking-wide text-gray-400 mb-1">
                Categoria
              </label>
              <select
                id="categoriaFiltro"
                className="w-full bg-[#1e232d] border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#f59e0b]"
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
                  return (
                    <li key={mensagem.id}>
                      <button
                        onClick={() => selecionarMensagem(mensagem.id)}
                        className={`w-full text-left px-4 py-4 transition-colors ${
                          selecionada ? 'bg-[#2a2f3a] border-l-4 border-[#f59e0b]' : 'hover:bg-[#1e232d]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-gray-100 truncate">{mensagem.titulo}</h3>
                          <span className="text-xs text-gray-400 ml-4">
                            {new Date(mensagem.criadaEm).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-2 overflow-hidden text-ellipsis whitespace-normal max-h-12 leading-5">
                          {mensagem.conteudo}
                        </p>
                        <span className="inline-block mt-3 text-[11px] uppercase tracking-wide text-[#f59e0b] bg-[#2a2f3a] px-2 py-1 rounded-full">
                          {CATEGORIA_LABELS[mensagem.categoria] ?? mensagem.categoria}
                        </span>
                      </button>
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
                    className="inline-flex items-center px-4 py-2 rounded-md bg-[#f59e0b] text-[#151921] font-semibold hover:bg-[#d97706] transition-colors"
                    aria-label="Abrir detalhes da importação"
                  >
                    Abrir detalhes da importação
                  </button>
                </section>
              )}
            </article>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
