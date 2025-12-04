// frontend/pages/automacao/transmissoes-siscomex/produtos.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PageLoader } from '@/components/ui/PageLoader';
import api from '@/lib/api';
import { useToast } from '@/components/ui/ToastContext';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { AlertCircle, ArrowLeft, Download, Loader2 } from 'lucide-react';
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

export default function NovaTransmissaoProdutosPage() {
  const [produtos, setProdutos] = useState<ProdutoTransmissao[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogoResumo[]>([]);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<'ATIVADO' | 'RASCUNHO' | ''>('RASCUNHO');
  const [catalogoId, setCatalogoId] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [transmitindo, setTransmitindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
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
        setErro('Selecione um catálogo para listar produtos aprovados e transmitir.');
        return;
      }
      const params: Record<string, string> = {
        status: 'APROVADO',
      };
      if (busca.trim()) params.busca = busca.trim();
      if (catalogoId) params.catalogoId = catalogoId;
      if (situacao) params.situacao = situacao;

      const resposta = await api.get<ProdutosResponse>('/produtos', { params });
      const itensAprovados = (resposta.data.items || []).filter(
        item => (item.status || 'APROVADO') === 'APROVADO'
      );
      setProdutos(itensAprovados);
      setErro(null);
    } catch (error) {
      console.error('Erro ao carregar produtos aprovados:', error);
      setErro('Não foi possível carregar os produtos aguardando transmissão.');
    } finally {
      setCarregando(false);
    }
  }, [busca, catalogoId, situacao]);

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

      const atendeSituacao = !situacao || produto.situacao === situacao;
      return atendeBusca && atendeSituacao;
    });
  }, [busca, produtos, situacao]);

  const todosSelecionados = produtosFiltrados.length > 0 && selecionados.size === produtosFiltrados.length;

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
      if (todosSelecionados) return new Set();
      return new Set(produtosFiltrados.map(p => p.id));
    });
  };

  const transmitir = async () => {
    if (!catalogoId) {
      setErro('Selecione um catálogo para transmitir ao SISCOMEX.');
      addToast('Selecione um catálogo para transmitir ao SISCOMEX.', 'error');
      return;
    }

    if (selecionados.size === 0) return;
    if (selecionados.size > 100) {
      setErro('Selecione no máximo 100 produtos por transmissão.');
      addToast('É possível transmitir apenas 100 produtos por vez.', 'error');
      return;
    }
    setTransmitindo(true);
    try {
      const registros = produtosFiltrados.filter(p => selecionados.has(p.id));
      const idsCatalogo = Number(catalogoId);

      const produtosForaDoCatalogo = registros.filter(produto => produto.catalogoId !== idsCatalogo);

      if (produtosForaDoCatalogo.length > 0) {
        setErro('Todos os produtos devem pertencer ao catálogo selecionado para transmissão.');
        addToast('Há produtos de outro catálogo na seleção. Ajuste e tente novamente.', 'error');
        return;
      }
      const resposta = await api.post('/siscomex/produtos/transmitir', {
        ids: registros.map(produto => produto.id),
        catalogoId: idsCatalogo,
      });

      const transmissaoId = resposta.data?.dados?.transmissaoId;
      addToast('Transmissão enfileirada. Acompanhe o progresso na listagem.', 'success');
      setErro(null);
      setSelecionados(new Set());

      if (transmissaoId) {
        router.push(`/automacao/transmissoes-siscomex/${transmissaoId}`);
      } else {
        await carregarProdutos();
      }
    } catch (error) {
      console.error('Erro ao transmitir produtos ao SISCOMEX:', error);
      const mensagemErro =
        (error as any)?.response?.data?.error || 'Não foi possível transmitir os produtos selecionados.';
      setErro(typeof mensagemErro === 'string' ? mensagemErro : 'Erro inesperado ao transmitir.');
      addToast('Falha na transmissão ao SISCOMEX.', 'error');
    } finally {
      setTransmitindo(false);
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

      <div className="flex items-center justify-between mb-6">
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
            <h1 className="text-2xl font-semibold text-white">Selecionar produtos aprovados</h1>
            <p className="text-gray-400 text-sm">
              Apenas itens aprovados e ainda não enviados são exibidos. Ajuste filtros e confirme o envio.
            </p>
          </div>
        </div>
        <Button
          variant="accent"
          className="flex items-center gap-2"
          disabled={selecionados.size === 0 || transmitindo || !catalogoId}
          onClick={transmitir}
        >
          {transmitindo ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Transmitir registros ao SISCOMEX
        </Button>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Select
            label="Catálogo"
            value={catalogoId}
            disabled={catalogoBloqueado}
            onChange={e => setCatalogoId(e.target.value)}
            options={catalogos.map(c => ({
              value: String(c.id),
              label: `${c.numero} · ${c.nome}`,
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
            <Select
              aria-label="Situação"
              className="mb-0"
              value={situacao}
              onChange={e => setSituacao(e.target.value as typeof situacao)}
              options={[
                { value: 'ATIVADO', label: 'Ativado' },
                { value: 'RASCUNHO', label: 'Rascunho' },
              ]}
              placeholder="Selecione a situação"
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
            <span className="ml-2">Somente produtos aprovados são listados.</span>
          </div>
        </div>
        <p className="text-sm text-gray-400 mt-3">
          Escolha o catálogo que fornecerá o certificado PFX e os dados fiscais do envio. Todos os produtos são
          enviados juntos em um único JSON, com limite de 100 itens por transmissão.
        </p>
        {catalogoSelecionado && (
          <p className="text-sm text-gray-300 mt-1">
            Transmissão vinculada ao catálogo Nº {catalogoSelecionado.numero} · {catalogoSelecionado.nome}.
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
        <PageLoader message="Carregando produtos aprovados..." />
      ) : produtosFiltrados.length === 0 ? (
        <Card>
          <div className="text-center py-10 text-gray-400">
            {catalogoId
              ? 'Nenhum produto aprovado encontrado com os filtros selecionados.'
              : 'Selecione um catálogo para visualizar os produtos aprovados para transmissão.'}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input type="checkbox" checked={todosSelecionados} onChange={selecionarTodos} />
                  </th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Denominação</th>
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
            {selecionados.size} produto(s) selecionado(s) de {produtosFiltrados.length} exibidos.
          </div>
        </Card>
      )}
    </DashboardLayout>
  );
}
