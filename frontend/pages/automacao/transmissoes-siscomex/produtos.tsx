import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { PageLoader } from '@/components/ui/PageLoader';
import { Select } from '@/components/ui/Select';
import api from '@/lib/api';
import { useToast } from '@/components/ui/ToastContext';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Save } from 'lucide-react';
import { LegendInfoModal } from '@/components/ui/LegendInfoModal';
import { produtoSituacaoLegend, produtoStatusLegend } from '@/constants/statusLegends';

interface ProdutoTransmissao {
  id: number;
  codigo?: string | null;
  denominacao?: string;
  status?: 'PENDENTE' | 'APROVADO' | 'PROCESSANDO' | 'TRANSMITIDO' | 'ERRO' | 'AJUSTAR_ESTRUTURA';
  situacao?: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';
  catalogoId?: number;
  catalogoNome?: string | null;
  catalogoNumero?: number | null;
  versao?: number | null;
}

interface CatalogoResumo {
  id: number;
  numero: number;
  nome: string;
}

interface ProdutosResponse {
  items: ProdutoTransmissao[];
  total: number;
}

type AcaoPreparacao = 'salvar' | 'transmitir' | null;

const SITUACOES_TRANSMISSAO = ['RASCUNHO', 'ATIVADO'] as const;

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

export default function NovaTransmissaoProdutosPage() {
  const [produtos, setProdutos] = useState<ProdutoTransmissao[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogoResumo[]>([]);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState('');
  const [situacoesSelecionadas, setSituacoesSelecionadas] = useState<string[]>([...SITUACOES_TRANSMISSAO]);
  const [catalogoId, setCatalogoId] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [acaoPreparacao, setAcaoPreparacao] = useState<AcaoPreparacao>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [totalEncontrado, setTotalEncontrado] = useState(0);
  const { addToast } = useToast();
  const { workingCatalog } = useWorkingCatalog();
  const router = useRouter();

  const catalogoBloqueado = Boolean(workingCatalog?.id);
  const catalogoSelecionado = useMemo(
    () => catalogos.find(catalogo => String(catalogo.id) === catalogoId) || null,
    [catalogoId, catalogos]
  );

  useEffect(() => {
    if (workingCatalog?.id) {
      setCatalogoId(String(workingCatalog.id));
    }
  }, [workingCatalog]);

  useEffect(() => {
    async function carregarCatalogos() {
      try {
        const resposta = await api.get<CatalogoResumo[]>('/catalogos');
        setCatalogos(resposta.data);
      } catch (error) {
        console.error('Erro ao carregar catálogos para transmissão de produtos:', error);
      }
    }

    carregarCatalogos();
  }, []);

  useEffect(() => {
    if (catalogoId) {
      setErro(null);
    }
  }, [catalogoId]);

  const carregarProdutos = useCallback(async () => {
    try {
      setCarregando(true);

      if (!catalogoId) {
        setProdutos([]);
        setTotalEncontrado(0);
        setErro('Selecione um catálogo para listar produtos aprovados e transmitir.');
        return;
      }

      if (situacoesSelecionadas.length === 0) {
        setProdutos([]);
        setTotalEncontrado(0);
        setErro(null);
        return;
      }

      const params: Record<string, string> = {
        status: 'APROVADO',
        pageSize: '1000',
        catalogoId,
        situacao: situacoesSelecionadas.join(','),
      };

      if (busca.trim()) {
        params.busca = busca.trim();
      }

      const resposta = await api.get<ProdutosResponse>('/produtos', { params });
      const itens = resposta.data.items || [];
      const itensValidos = itens.filter(item => (item.status || 'APROVADO') === 'APROVADO');

      setProdutos(itensValidos);
      setTotalEncontrado(resposta.data.total || itensValidos.length);
      setSelecionados(prev => new Set(itensValidos.filter(item => prev.has(item.id)).map(item => item.id)));
      setErro(null);
    } catch (error) {
      console.error('Erro ao carregar produtos aprovados:', error);
      setProdutos([]);
      setTotalEncontrado(0);
      setErro('Não foi possível carregar os produtos aguardando transmissão.');
    } finally {
      setCarregando(false);
    }
  }, [busca, catalogoId, situacoesSelecionadas]);

  useEffect(() => {
    carregarProdutos();
  }, [carregarProdutos]);

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter(produto => {
      const atendeBusca =
        !termo ||
        (produto.denominacao || '').toLowerCase().includes(termo) ||
        (produto.codigo || '').toLowerCase().includes(termo);

      const atendeSituacao =
        situacoesSelecionadas.length === 0 || situacoesSelecionadas.includes(produto.situacao || '');

      return atendeBusca && atendeSituacao;
    });
  }, [busca, produtos, situacoesSelecionadas]);

  const todosSelecionados =
    produtosFiltrados.length > 0 && produtosFiltrados.every(produto => selecionados.has(produto.id));

  const alternarSelecao = (id: number) => {
    setSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) {
        novo.delete(id);
      } else {
        novo.add(id);
      }
      return novo;
    });
  };

  const selecionarTodos = () => {
    setSelecionados(prev => {
      const novo = new Set(prev);
      if (todosSelecionados) {
        produtosFiltrados.forEach(produto => novo.delete(produto.id));
        return novo;
      }
      produtosFiltrados.forEach(produto => novo.add(produto.id));
      return novo;
    });
  };

  const prepararTransmissao = async (modo: Exclude<AcaoPreparacao, null>) => {
    if (!catalogoId) {
      setErro('Selecione um catálogo para transmitir ao SISCOMEX.');
      addToast('Selecione um catálogo para transmitir ao SISCOMEX.', 'error');
      return;
    }

    if (selecionados.size === 0) {
      return;
    }

    setAcaoPreparacao(modo);
    try {
      const registros = produtos.filter(produto => selecionados.has(produto.id));
      const idsCatalogo = Number(catalogoId);

      if (registros.length === 0) {
        setErro('Nenhum produto selecionado foi localizado para preparação.');
        addToast('Selecione ao menos um produto para seguir com a transmissão.', 'error');
        return;
      }

      const produtosForaDoCatalogo = registros.filter(produto => produto.catalogoId !== idsCatalogo);
      if (produtosForaDoCatalogo.length > 0) {
        setErro('Todos os produtos devem pertencer ao catálogo selecionado para transmissão.');
        addToast('Há produtos de outro catálogo na seleção. Ajuste e tente novamente.', 'error');
        return;
      }

      const resposta = await api.post('/siscomex/produtos/preparar', {
        ids: registros.map(produto => produto.id),
        catalogoId: idsCatalogo,
      });

      const transmissaoId = resposta.data?.dados?.transmissaoId;
      if (!transmissaoId) {
        throw new Error('Pré-transmissão criada sem identificador retornado.');
      }

      setErro(null);

      if (modo === 'salvar') {
        addToast('Pré-transmissão criada. Revise e transmita depois na listagem.', 'success');
        await router.push('/automacao/transmissoes-siscomex');
        return;
      }

      await router.push(`/automacao/transmissoes-siscomex/${transmissaoId}/confirmar`);
    } catch (error) {
      console.error('Erro ao preparar transmissão de produtos ao SISCOMEX:', error);
      const mensagem = extrairMensagemErro(error, 'Não foi possível preparar a transmissão.');
      setErro(mensagem);
      addToast(mensagem, 'error');
    } finally {
      setAcaoPreparacao(null);
    }
  };

  return (
    <DashboardLayout title="Nova transmissão de produtos">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao' },
          { label: 'Transmissões ao SISCOMEX', href: '/automacao/transmissoes-siscomex' },
          { label: 'Produtos' },
        ]}
      />

      <div className="flex items-center justify-between mb-6 gap-4">
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
            <h1 className="text-2xl font-semibold text-white">Selecionar produtos para transmissão</h1>
            <p className="text-gray-400 text-sm">
              Produtos em rascunho e ativados podem ser enviados juntos. O processamento continua individual, sequencial e assíncrono.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex items-center gap-2"
            disabled={selecionados.size === 0 || acaoPreparacao !== null || !catalogoId}
            onClick={() => prepararTransmissao('salvar')}
          >
            {acaoPreparacao === 'salvar' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar para depois
          </Button>
          <Button
            variant="accent"
            className="flex items-center gap-2"
            disabled={selecionados.size === 0 || acaoPreparacao !== null || !catalogoId}
            onClick={() => prepararTransmissao('transmitir')}
          >
            {acaoPreparacao === 'transmitir' ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            Transmitir agora
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Select
            label="Catálogo"
            value={catalogoId}
            disabled={catalogoBloqueado}
            onChange={e => setCatalogoId(e.target.value)}
            options={catalogos.map(catalogo => ({
              value: String(catalogo.id),
              label: `${catalogo.numero} · ${catalogo.nome}`,
            }))}
            placeholder="Selecione o catálogo"
          />

          <div>
            <div className="flex items-center gap-1 text-sm font-medium mb-1 text-gray-300">
              <span>Situação</span>
              <LegendInfoModal
                title="Situação dos produtos"
                legend={produtoSituacaoLegend}
                triggerAriaLabel="Ver legenda de situação"
              />
            </div>
            <MultiSelect
              className="mb-0"
              options={[
                { value: 'RASCUNHO', label: 'Rascunho' },
                { value: 'ATIVADO', label: 'Ativado' },
              ]}
              values={situacoesSelecionadas}
              onChange={valores => setSituacoesSelecionadas(valores)}
              placeholder="Selecione as situações"
            />
          </div>

          <Input
            label="Busca por código ou denominação"
            placeholder="Digite para filtrar"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />

          <div className="flex items-end text-sm text-gray-300">
            <LegendInfoModal
              title="Status dos produtos"
              legend={produtoStatusLegend}
              triggerAriaLabel="Ver legenda de status"
            />
            <span className="ml-2">Somente produtos aprovados são listados para transmissão.</span>
          </div>
        </div>
        <p className="text-sm text-gray-400 mt-3">
          Produtos ativados serão enviados como nova versão; produtos em rascunho serão incluídos como versão inicial. Você pode salvar a pré-transmissão para revisar depois ou seguir direto para a revisão final.
        </p>
        {catalogoSelecionado && (
          <p className="text-sm text-gray-300 mt-1">
            Transmissão vinculada ao catálogo Nº {catalogoSelecionado.numero} · {catalogoSelecionado.nome}.
          </p>
        )}
        {totalEncontrado > produtos.length && (
          <p className="text-xs text-amber-300 mt-2">
            Exibindo {produtos.length} de {totalEncontrado} produto(s) encontrados para os filtros atuais.
          </p>
        )}
      </Card>

      {erro && (
        <div className="bg-[#1f2937] border border-gray-700 text-gray-100 p-4 rounded flex items-center gap-3 mb-4">
          <AlertCircle size={18} className="text-[#f59e0b]" />
          <span>{erro}</span>
        </div>
      )}

      {carregando ? (
        <PageLoader message="Carregando produtos para transmissão..." />
      ) : produtosFiltrados.length === 0 ? (
        <Card>
          <div className="text-center py-10 text-gray-400">
            {catalogoId
              ? situacoesSelecionadas.length === 0
                ? 'Selecione ao menos uma situação para listar produtos.'
                : 'Nenhum produto encontrado com os filtros selecionados.'
              : 'Selecione um catálogo para visualizar os produtos aprovados para transmissão.'}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                <tr>
                  <th className="w-20 px-4 py-3">
                    <input type="checkbox" checked={todosSelecionados} onChange={selecionarTodos} />
                  </th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Denominação</th>
                  <th className="px-4 py-3">Versão</th>
                  <th className="px-4 py-3">Catálogo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Situação</th>
                </tr>
              </thead>
              <tbody>
                {produtosFiltrados.map(produto => (
                  <tr key={produto.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selecionados.has(produto.id)}
                        onChange={() => alternarSelecao(produto.id)}
                        aria-label={`Selecionar produto ${produto.codigo || produto.denominacao || produto.id}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-200">{produto.codigo || `#${produto.id}`}</td>
                    <td className="px-4 py-3 text-gray-200">{produto.denominacao || '-'}</td>
                    <td className="px-4 py-3 text-gray-200">{produto.versao ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-200">
                      {produto.catalogoNome || '—'}
                      {produto.catalogoNumero && (
                        <span className="text-gray-500 block text-xs">Nº {produto.catalogoNumero}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-200">{produto.status || 'Aprovado'}</td>
                    <td className="px-4 py-3 text-gray-200">{produto.situacao || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-sm text-gray-400">
            {selecionados.size} produto(s) selecionado(s) no catálogo e {produtosFiltrados.length} exibido(s) na tela.
          </div>
        </Card>
      )}
    </DashboardLayout>
  );
}
