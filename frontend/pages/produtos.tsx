// frontend/pages/produtos.tsx - listagem de produtos
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/PageLoader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { AlertCircle, Plus, Search, Trash2, Pencil, Copy, X } from 'lucide-react';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Hint } from '@/components/ui/Hint';
import { LegendInfoModal } from '@/components/ui/LegendInfoModal';
import { EnvironmentBadge } from '@/components/ui/EnvironmentBadge';
import api from '@/lib/api';
import { produtoStatusLegend, produtoSituacaoLegend } from '@/constants/statusLegends';
import { useRouter } from 'next/router';
import { useToast } from '@/components/ui/ToastContext';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { Input } from '@/components/ui/Input';
import { PaginationControls } from '@/components/ui/PaginationControls';

interface Produto {
  id: number;
  codigo?: string | null;
  ncmCodigo: string;
  status: 'PENDENTE' | 'APROVADO' | 'PROCESSANDO' | 'TRANSMITIDO' | 'ERRO';
  atualizadoEm: string;
  catalogoNumero?: number | null;
  catalogoNome?: string | null;
  catalogoCpfCnpj?: string | null;
  catalogoAmbiente?: 'HOMOLOGACAO' | 'PRODUCAO' | null;
  catalogoId?: number;
  denominacao?: string;
  descricao?: string;
  codigosInternos?: string[];
  situacao?: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO' | string;
  modalidade?: 'IMPORTACAO' | 'EXPORTACAO' | null;
}

interface ProdutosResponse {
  items: Produto[];
  total: number;
  page: number;
  pageSize: number;
}

const statusOptions = [
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'APROVADO', label: 'Aprovado' },
  { value: 'PROCESSANDO', label: 'Processando' },
  { value: 'TRANSMITIDO', label: 'Transmitido' },
  { value: 'ERRO', label: 'Erro' }
] satisfies Array<{ value: Produto['status']; label: string }>;

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [totalProdutos, setTotalProdutos] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtros, setFiltros] = useState<{
    status: Produto['status'][];
    situacoes: Array<'ATIVADO' | 'DESATIVADO' | 'RASCUNHO'>;
    catalogoId: string;
  }>(() => ({
    status: [],
    situacoes: ['RASCUNHO', 'ATIVADO'],
    catalogoId: ''
  }));
  const [produtoParaExcluir, setProdutoParaExcluir] = useState<number | null>(null);
  const [catalogos, setCatalogos] = useState<{ id: number; numero: number; nome: string }[]>([]);
  const [produtoParaClonar, setProdutoParaClonar] = useState<Produto | null>(null);
  const [cloneCatalogoId, setCloneCatalogoId] = useState('');
  const [cloneNome, setCloneNome] = useState('');
  const [cloneSkus, setCloneSkus] = useState<string[]>([]);
  const [cloneErrors, setCloneErrors] = useState<{ nome?: string; catalogo?: string }>({});
  const [clonandoProduto, setClonandoProduto] = useState(false);
  const [selectedProdutoIds, setSelectedProdutoIds] = useState<Set<number>>(() => new Set());
  const [deselectedProdutoIds, setDeselectedProdutoIds] = useState<Set<number>>(() => new Set());
  const [isAllFilteredSelected, setIsAllFilteredSelected] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteConfirmationText, setBulkDeleteConfirmationText] = useState('');
  const [bulkDeleteValidationError, setBulkDeleteValidationError] = useState<string | null>(null);
  const [bulkDeleteRequestError, setBulkDeleteRequestError] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const router = useRouter();
  const { addToast } = useToast();
  const { workingCatalog } = useWorkingCatalog();
  const pageSizeOptions = [10, 20, 50];
  const totalPages = Math.max(1, Math.ceil(totalProdutos / pageSize));
  const paginaAtual = Math.min(page, totalPages);
  const possuiItensNaPagina = totalProdutos > 0 && produtos.length > 0;
  const inicioExibicao = possuiItensNaPagina ? (paginaAtual - 1) * pageSize + 1 : 0;
  const fimExibicao = possuiItensNaPagina
    ? Math.min(totalProdutos, inicioExibicao + produtos.length - 1)
    : 0;
  const exibicaoLabel = possuiItensNaPagina
    ? `Exibindo ${inicioExibicao}-${fimExibicao} de ${totalProdutos} produtos`
    : undefined;
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);
  const filtrosStatusSelecionados = filtros.status;
  const filtrosSituacoesSelecionadas = filtros.situacoes;
  const filtroCatalogoSelecionado = filtros.catalogoId;
  const totalSelectedCount = isAllFilteredSelected
    ? Math.max(0, totalProdutos - deselectedProdutoIds.size)
    : selectedProdutoIds.size;
  const currentPageSelectedCount = produtos.reduce((count, produto) => {
    if (isAllFilteredSelected) {
      return deselectedProdutoIds.has(produto.id) ? count : count + 1;
    }
    return selectedProdutoIds.has(produto.id) ? count + 1 : count;
  }, 0);
  const allCurrentPageSelected = produtos.length > 0 && currentPageSelectedCount === produtos.length;
  const someCurrentPageSelected = currentPageSelectedCount > 0 && currentPageSelectedCount < produtos.length;
  const bulkDeleteConfirmationValid =
    bulkDeleteConfirmationText.trim().toUpperCase() === 'EXCLUIR';

  const limparSelecao = useCallback(() => {
    setSelectedProdutoIds(new Set());
    setDeselectedProdutoIds(new Set());
    setIsAllFilteredSelected(false);
  }, []);

  const abrirExclusaoEmMassa = useCallback(() => {
    setBulkDeleteModalOpen(true);
    setBulkDeleteConfirmationText('');
    setBulkDeleteValidationError(null);
    setBulkDeleteRequestError(null);
    setBulkDeleting(false);
  }, []);

  const fecharExclusaoEmMassa = useCallback(() => {
    setBulkDeleteModalOpen(false);
    setBulkDeleteConfirmationText('');
    setBulkDeleteValidationError(null);
    setBulkDeleteRequestError(null);
    setBulkDeleting(false);
  }, []);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someCurrentPageSelected;
    }
  }, [someCurrentPageSelected, currentPageSelectedCount, produtos.length]);

  useEffect(() => {
    limparSelecao();
  }, [busca, filtros.status, filtros.situacoes, filtros.catalogoId, limparSelecao]);

  useEffect(() => {
    if (bulkDeleteModalOpen && totalSelectedCount === 0) {
      fecharExclusaoEmMassa();
    }
  }, [bulkDeleteModalOpen, totalSelectedCount, fecharExclusaoEmMassa]);

  useEffect(() => {
    async function carregarCatalogos() {
      try {
        const response = await api.get('/catalogos');
        setCatalogos(response.data);
      } catch (err) {
        console.error('Erro ao carregar catálogos:', err);
      }
    }
    carregarCatalogos();
  }, []);

  const carregarProdutos = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = {
        page,
        pageSize
      };
      if (busca.trim()) params.busca = busca.trim();
      if (filtros.status.length > 0) params.status = filtros.status.join(',');
      if (filtros.situacoes.length > 0) params.situacao = filtros.situacoes.join(',');
      if (filtros.catalogoId) params.catalogoId = filtros.catalogoId;

      const response = await api.get<ProdutosResponse>('/produtos', { params });
      const { items, total, page: paginaResposta, pageSize: tamanhoResposta } = response.data;
      setProdutos(items);
      setTotalProdutos(total);
      if (paginaResposta && paginaResposta !== page) {
        setPage(paginaResposta);
      }
      if (tamanhoResposta && tamanhoResposta !== pageSize) {
        setPageSize(tamanhoResposta);
      }
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
      setError('Não foi possível carregar os produtos.');
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  }, [
    page,
    pageSize,
    busca,
    filtros.status,
    filtros.situacoes,
    filtros.catalogoId
  ]);

  const confirmarExclusaoEmMassa = useCallback(async () => {
    if (bulkDeleteConfirmationText.trim().toUpperCase() !== 'EXCLUIR') {
      setBulkDeleteValidationError('Digite EXCLUIR para confirmar a exclusão.');
      return;
    }

    setBulkDeleteValidationError(null);
    setBulkDeleteRequestError(null);
    setBulkDeleting(true);

    const filtrosParaEnviar: Record<string, unknown> = {
      status:
        filtrosStatusSelecionados.length > 0 ? filtrosStatusSelecionados : undefined,
      situacoes:
        filtrosSituacoesSelecionadas.length > 0 ? filtrosSituacoesSelecionadas : undefined,
      catalogoId: filtroCatalogoSelecionado ? Number(filtroCatalogoSelecionado) : undefined
    };

    const filtrosLimpos = Object.fromEntries(
      Object.entries(filtrosParaEnviar).filter(([, valor]) => {
        if (Array.isArray(valor)) {
          return valor.length > 0;
        }
        return valor !== undefined && valor !== null && valor !== '';
      })
    );

    const payload: Record<string, unknown> = {
      todosFiltrados: isAllFilteredSelected
    };

    if (Object.keys(filtrosLimpos).length > 0) {
      payload.filtros = filtrosLimpos;
    }

    const buscaLimpa = busca.trim();
    if (buscaLimpa) {
      payload.busca = buscaLimpa;
    }

    if (isAllFilteredSelected) {
      if (deselectedProdutoIds.size > 0) {
        payload.idsDeselecionados = Array.from(deselectedProdutoIds);
      }
    } else {
      payload.idsSelecionados = Array.from(selectedProdutoIds);
    }

    try {
      await api.post('/produtos/excluir-em-massa', payload);
      addToast('Produtos excluídos com sucesso.', 'success');
      fecharExclusaoEmMassa();
      limparSelecao();
      await carregarProdutos();
    } catch (err: any) {
      const mensagem = err?.response?.data?.error || 'Erro ao excluir produtos';
      setBulkDeleteRequestError(mensagem);
      addToast(mensagem, 'error');
    } finally {
      setBulkDeleting(false);
    }
  }, [
    addToast,
    carregarProdutos,
    deselectedProdutoIds,
    fecharExclusaoEmMassa,
    filtroCatalogoSelecionado,
    filtrosSituacoesSelecionadas,
    filtrosStatusSelecionados,
    isAllFilteredSelected,
    limparSelecao,
    bulkDeleteConfirmationText,
    selectedProdutoIds,
    busca
  ]);

  useEffect(() => {
    if (workingCatalog) {
      if (filtros.catalogoId !== String(workingCatalog.id)) {
        setFiltros(prev => ({ ...prev, catalogoId: String(workingCatalog.id) }));
        setPage(1);
        return;
      }
    } else {
      if (!router.isReady) return;
      const catalogoIdFromQuery =
        typeof router.query.catalogoId === 'string' ? router.query.catalogoId : '';
      if (catalogoIdFromQuery && filtros.catalogoId !== catalogoIdFromQuery) {
        setFiltros(prev => ({ ...prev, catalogoId: catalogoIdFromQuery }));
        setPage(1);
        const { catalogoId, ...rest } = router.query;
        router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
        return;
      }
    }

    carregarProdutos();
  }, [
    router.isReady,
    router.query.catalogoId,
    filtros.status,
    filtros.situacoes,
    filtros.catalogoId,
    workingCatalog,
    page,
    pageSize,
    carregarProdutos
  ]);

  function formatarData(dataString: string) {
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR');
  }

  function getStatusClasses(status: string) {
    switch (status) {
      case 'PENDENTE':
        return 'bg-[#e4a8351a] text-[#e4a835] border border-[#e4a835]';
      case 'APROVADO':
        return 'bg-[#27f58a1a] text-[#27f58a] border border-[#27f58a]';
      case 'PROCESSANDO':
        return 'bg-[#4c82d31a] text-[#4c82d3] border border-[#4c82d3]';
      case 'TRANSMITIDO':
        return 'bg-[#5e17eb1a] text-[#5e17eb] border border-[#5e17eb]';
      case 'ERRO':
        return 'bg-[#ff57571a] text-[#ff5757] border border-[#ff5757]';
      default:
        return 'bg-gray-900/50 text-gray-400 border border-gray-700';
    }
  }

  function getSituacaoClasses(situacao?: string) {
    switch (situacao) {
      case 'ATIVADO':
        return 'bg-[#27f58a1a] text-[#27f58a] border border-[#27f58a]';
      case 'DESATIVADO':
        return 'bg-[#f2545f1a] text-[#f2545f] border border-[#f2545f]';
      case 'RASCUNHO':
        return 'bg-[#e4a8351a] text-[#e4a835] border border-[#e4a835]';
      default:
        return 'bg-gray-900/50 text-gray-400 border border-gray-700';
    }
  }

  function getModalidadeLabel(modalidade: string) {
    switch (modalidade) {
      case 'IMPORTACAO':
        return 'Importação';
      case 'EXPORTACAO':
        return 'Exportação';
      default:
        return modalidade;
    }
  }

  const handleToggleProduto = useCallback((produtoId: number) => {
    if (isAllFilteredSelected) {
      setDeselectedProdutoIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(produtoId)) {
          newSet.delete(produtoId);
        } else {
          newSet.add(produtoId);
        }
        return newSet;
      });
      return;
    }

    setSelectedProdutoIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(produtoId)) {
        newSet.delete(produtoId);
      } else {
        newSet.add(produtoId);
      }
      return newSet;
    });
  }, [isAllFilteredSelected]);

  const handleToggleSelectAllCurrentPage = useCallback(() => {
    if (produtos.length === 0) return;

    if (isAllFilteredSelected) {
      const algumDeselecionadoNaPagina = produtos.some(produto => deselectedProdutoIds.has(produto.id));

      if (algumDeselecionadoNaPagina) {
        setDeselectedProdutoIds(prev => {
          const newSet = new Set(prev);
          produtos.forEach(produto => {
            newSet.delete(produto.id);
          });
          return newSet;
        });
      } else {
        limparSelecao();
      }

      return;
    }

    const idsDaPagina = produtos.map(produto => produto.id);
    if (allCurrentPageSelected) {
      setSelectedProdutoIds(prev => {
        const newSet = new Set(prev);
        idsDaPagina.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      setSelectedProdutoIds(prev => {
        const newSet = new Set(prev);
        idsDaPagina.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  }, [
    allCurrentPageSelected,
    deselectedProdutoIds,
    isAllFilteredSelected,
    limparSelecao,
    produtos,
  ]);

  const handleSelectAllFiltered = useCallback(() => {
    if (totalProdutos === 0) return;
    setIsAllFilteredSelected(true);
    setDeselectedProdutoIds(new Set());
  }, [totalProdutos]);

  if (loading && !hasLoadedOnce) {
    return (
      <DashboardLayout title="Produtos">
        <PageLoader message="Carregando produtos..." />
      </DashboardLayout>
    );
  }

  function editarProduto(id: number) {
    router.push(`/produtos/${id}`);
  }

  function confirmarExclusao(id: number) {
    setProdutoParaExcluir(id);
  }

  function cancelarExclusao() {
    setProdutoParaExcluir(null);
  }

  async function excluirProduto() {
    if (!produtoParaExcluir) return;
    try {
      await api.delete(`/produtos/${produtoParaExcluir}`);
      setProdutos(produtos.filter(p => p.id !== produtoParaExcluir));
      addToast('Produto excluído com sucesso', 'success');
    } catch (err) {
      console.error('Erro ao excluir produto:', err);
      addToast('Erro ao excluir produto', 'error');
    } finally {
      setProdutoParaExcluir(null);
    }
  }

  function abrirModalClonar(produto: Produto) {
    setProdutoParaClonar(produto);
    setCloneCatalogoId(produto.catalogoId ? String(produto.catalogoId) : '');
    const nomeBase = produto.denominacao ?? '';
    const sugestao = nomeBase && nomeBase.length <= 90 ? `${nomeBase} (cópia)` : nomeBase;
    setCloneNome(sugestao);
    setCloneSkus([]);
    setCloneErrors({});
  }

  function cancelarClonagem() {
    setProdutoParaClonar(null);
    setCloneCatalogoId('');
    setCloneNome('');
    setCloneSkus([]);
    setCloneErrors({});
    setClonandoProduto(false);
  }

  function adicionarSku() {
    setCloneSkus(prev => [...prev, '']);
  }

  function atualizarSku(index: number, valor: string) {
    setCloneSkus(prev => prev.map((sku, i) => (i === index ? valor : sku)));
  }

  function removerSku(index: number) {
    setCloneSkus(prev => prev.filter((_, i) => i !== index));
  }

  async function confirmarClonagem() {
    if (!produtoParaClonar) return;

    const erros: { nome?: string; catalogo?: string } = {};
    if (!cloneNome.trim()) {
      erros.nome = 'Nome é obrigatório';
    }
    const catalogoSelecionado = cloneCatalogoId || (produtoParaClonar.catalogoId ? String(produtoParaClonar.catalogoId) : '');
    if (!catalogoSelecionado) {
      erros.catalogo = 'Selecione um catálogo';
    }

    if (Object.keys(erros).length > 0) {
      setCloneErrors(erros);
      return;
    }

    const codigos = cloneSkus.map(sku => sku.trim()).filter(sku => sku.length > 0);

    try {
      setClonandoProduto(true);
      await api.post(`/produtos/${produtoParaClonar.id}/clonar`, {
        catalogoId: Number(catalogoSelecionado),
        denominacao: cloneNome.trim(),
        codigosInternos: codigos.length > 0 ? codigos : undefined
      });
      addToast('Produto clonado com sucesso', 'success');
      cancelarClonagem();
      await carregarProdutos();
    } catch (err: any) {
      const mensagem = err?.response?.data?.error || 'Erro ao clonar produto';
      addToast(mensagem, 'error');
      setClonandoProduto(false);
    }
  }

  return (
    <DashboardLayout title="Produtos">
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Produtos' }]} />

      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-white">Lista de Produtos</h1>
        <Button
          variant="accent"
          className="flex items-center gap-2"
          onClick={() => router.push('/produtos/novo')}
        >
          <Plus size={16} />
          <span>Novo Produto</span>
        </Button>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative md:col-span-2">
            <label className="block text-sm font-medium mb-2 text-gray-300">Buscar por nome ou código (SKU/PN)</label>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 pl-3 pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              className="pl-10 pr-4 py-2 w-full bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
              value={busca}
              onChange={e => {
                setBusca(e.target.value);
                setPage(1);
              }}
              aria-label="Buscar por nome ou código"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">Catálogo</label>
            <select
              className="w-full bg-[#1e2126] border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring focus:border-blue-500"
              value={filtros.catalogoId}
              onChange={e => {
                setFiltros(prev => ({ ...prev, catalogoId: e.target.value }));
                setPage(1);
              }}
              disabled={!!workingCatalog}
            >
              <option value="">Todos os catálogos</option>
              {catalogos.map(catalogo => (
                <option key={catalogo.id} value={catalogo.id}>
                  {catalogo.numero} - {catalogo.nome}
                </option>
              ))}
            </select>
          </div>
          <MultiSelect
            label="Status"
            options={statusOptions}
            values={filtros.status}
            onChange={vals => {
              setFiltros(prev => ({
                ...prev,
                status: vals as Produto['status'][]
              }));
              setPage(1);
            }}
            placeholder="Status"
          />
          {false && ( <select style={{ display: 'none' }}
            className="bg-[#1e2126] border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring focus:border-blue-500"
            value={''}
            onChange={() => {}}
          >
            <option value="TODOS">Todas as situações</option>
            <option value="ATIVADO">Ativado</option>
            <option value="DESATIVADO">Desativado</option>
            <option value="RASCUNHO">Rascunho</option>
          </select> ) }
          <MultiSelect
            label="Situação"
            options={[
              { value: 'ATIVADO', label: 'Ativado' },
              { value: 'DESATIVADO', label: 'Desativado' },
              { value: 'RASCUNHO', label: 'Rascunho' },
            ]}
            values={filtros.situacoes}
            onChange={(vals) => {
              setFiltros(prev => ({
                ...prev,
                situacoes: vals as Array<'ATIVADO' | 'DESATIVADO' | 'RASCUNHO'>
              }));
              setPage(1);
            }}
            placeholder="Situação"
          />
        </div>
        {loading && hasLoadedOnce && (
          <div className="mt-2 text-xs text-gray-400">Atualizando lista de produtos...</div>
        )}
      </Card>

      {error && (
        <div className="bg-red-500/20 border border-red-700 p-4 rounded-lg mb-6 flex items-center gap-3">
          <AlertCircle className="text-red-500" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        {produtos.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-400 mb-4">Nenhum produto encontrado.</p>
            <Button
              variant="accent"
              className="inline-flex items-center gap-2"
              onClick={() => router.push('/produtos/novo')}
            >
              <Plus size={16} />
              <span>Adicionar Produto</span>
            </Button>
          </div>
        ) : (
          <>
            {totalSelectedCount > 0 && (
              <div className="flex flex-col gap-3 px-4 py-3 border-b border-gray-800 bg-[#111821] text-gray-200 text-sm md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    {isAllFilteredSelected ? (
                      deselectedProdutoIds.size === 0 ? (
                        <>Todos os {totalProdutos} produtos filtrados estão selecionados.</>
                      ) : (
                        <>Selecionados {totalSelectedCount} de {totalProdutos} produtos filtrados.</>
                      )
                    ) : (
                      <>
                        {totalSelectedCount} produto{totalSelectedCount === 1 ? '' : 's'} selecionado{totalSelectedCount === 1 ? '' : 's'}.
                      </>
                    )}
                  </span>
                  {!isAllFilteredSelected && totalSelectedCount < totalProdutos && allCurrentPageSelected && (
                    <Button variant="outline" size="xs" onClick={handleSelectAllFiltered}>
                      Selecionar todos os {totalProdutos} produtos filtrados
                    </Button>
                  )}
                  <Button variant="outline" size="xs" onClick={limparSelecao}>
                    Limpar seleção
                  </Button>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  className="inline-flex items-center gap-2 ml-auto md:ml-0"
                  onClick={abrirExclusaoEmMassa}
                >
                  <Trash2 size={16} />
                  <span>Excluir selecionados</span>
                </Button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <div className="flex justify-center">
                        <input
                          ref={headerCheckboxRef}
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-600 bg-[#1e2126] text-purple-500 focus:ring-purple-500"
                          checked={produtos.length > 0 && allCurrentPageSelected}
                          onChange={handleToggleSelectAllCurrentPage}
                          aria-label="Selecionar todos os produtos desta página"
                        />
                      </div>
                    </th>
                    <th className="w-24 px-4 py-3 text-center">Ações</th>
                    <th className="px-4 py-3">Catálogo</th>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Cód. Int. (SKU/PN)</th>
                    <th className="px-4 py-3">Modalidade</th>
                    <th className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        Status
                        <LegendInfoModal
                          title="Status dos Produtos"
                          legend={produtoStatusLegend}
                          triggerAriaLabel="Ver detalhes sobre os status dos produtos"
                        />
                      </span>
                    </th>
                    <th className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        Situação
                        <LegendInfoModal
                          title="Situação dos Produtos"
                          legend={produtoSituacaoLegend}
                          triggerAriaLabel="Ver detalhes sobre as situações dos produtos"
                        />
                      </span>
                    </th>
                    <th className="px-4 py-3">Última Alteração</th>
                    <th className="px-4 py-3">Ambiente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 text-gray-300">
                  {produtos.map((produto) => (
                    <tr
                      key={produto.id}
                      className="border-b border-gray-700 hover:bg-[#1a1f2b] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-600 bg-[#1e2126] text-purple-500 focus:ring-purple-500"
                            checked={
                              isAllFilteredSelected
                                ? !deselectedProdutoIds.has(produto.id)
                                : selectedProdutoIds.has(produto.id)
                            }
                            onChange={() => handleToggleProduto(produto.id)}
                            aria-label={`Selecionar produto ${produto.denominacao ?? produto.codigo ?? produto.id}`}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 flex items-center justify-center gap-2">
                        <button
                          className="p-1 text-gray-300 hover:text-purple-500 transition-colors"
                          onClick={() => abrirModalClonar(produto)}
                          title="Clonar produto"
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          className="p-1 text-gray-300 hover:text-blue-500 transition-colors"
                          onClick={() => editarProduto(produto.id)}
                          title="Editar produto"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                          onClick={() => confirmarExclusao(produto.id)}
                          title="Excluir produto"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                      <td className="px-4 py-3">{produto.catalogoNome ?? '-'}</td>
                      <td className="px-4 py-3">{produto.denominacao ?? produto.codigo ?? '-'}</td>
                      <td className="px-4 py-3">
                        {produto.codigosInternos && produto.codigosInternos.length > 0 ? (
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-[150px]">
                              {produto.codigosInternos.join(', ')}
                            </span>
                            {produto.codigosInternos.join(', ').length > 20 && (
                              <Hint text={produto.codigosInternos.join(', ')} />
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {produto.modalidade
                          ? getModalidadeLabel(produto.modalidade)
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusClasses(
                            produto.status
                          )}`}
                        >
                          {produto.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {produto.situacao ? (
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getSituacaoClasses(
                              produto.situacao
                            )}`}
                          >
                            {produto.situacao}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3">{formatarData(produto.atualizadoEm)}</td>
                      <td className="px-4 py-3">
                        {produto.catalogoAmbiente ? (
                          <EnvironmentBadge ambiente={produto.catalogoAmbiente} size="sm" />
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PaginationControls
              page={paginaAtual}
              pageSize={pageSize}
              totalItems={totalProdutos}
              onPageChange={novo => setPage(Math.max(1, Math.min(novo, totalPages)))}
              onPageSizeChange={novo => {
                setPageSize(novo);
                setPage(1);
              }}
              pageSizeOptions={pageSizeOptions}
              loading={loading}
              displayLabel={exibicaoLabel}
            />
          </>
        )}
      </Card>

      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#151921] rounded-lg max-w-lg w-full p-6 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Confirmar exclusão em massa</h3>
            <p className="text-gray-300 mb-2">
              {isAllFilteredSelected ? (
                deselectedProdutoIds.size === 0 ? (
                  <>Todos os {totalProdutos} produtos filtrados serão excluídos.</>
                ) : (
                  <>
                    {totalSelectedCount} de {totalProdutos} produtos filtrados serão excluídos.
                  </>
                )
              ) : (
                <>
                  {totalSelectedCount} produto{totalSelectedCount === 1 ? '' : 's'} selecionado{totalSelectedCount === 1 ? '' : 's'} será excluído.
                </>
              )}{' '}
              Esta ação não pode ser desfeita.
            </p>
            <p className="text-gray-400 mb-4">
              Para confirmar, digite <span className="text-red-400 font-semibold">EXCLUIR</span> no campo abaixo.
            </p>
            <Input
              label="Confirmação"
              value={bulkDeleteConfirmationText}
              onChange={event => {
                setBulkDeleteConfirmationText(event.target.value);
                if (bulkDeleteValidationError) {
                  setBulkDeleteValidationError(null);
                }
                if (bulkDeleteRequestError) {
                  setBulkDeleteRequestError(null);
                }
              }}
              placeholder="Digite EXCLUIR"
              autoFocus
              error={bulkDeleteValidationError ?? undefined}
            />
            {bulkDeleteRequestError && (
              <p className="text-red-400 text-sm -mt-2 mb-4">{bulkDeleteRequestError}</p>
            )}
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={fecharExclusaoEmMassa} disabled={bulkDeleting}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={confirmarExclusaoEmMassa}
                disabled={!bulkDeleteConfirmationValid || bulkDeleting}
              >
                {bulkDeleting ? 'Excluindo...' : 'Excluir'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {produtoParaExcluir && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#151921] rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Confirmar Exclusão</h3>
            <p className="text-gray-300 mb-6">
              Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={cancelarExclusao}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={excluirProduto}>
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}

      {produtoParaClonar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#151921] rounded-lg max-w-lg w-full p-6 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Clonar Produto</h3>
            <Input
              label="Nome do novo produto"
              value={cloneNome}
              onChange={(e) => {
                setCloneNome(e.target.value);
                if (cloneErrors.nome) {
                  setCloneErrors(prev => ({ ...prev, nome: undefined }));
                }
              }}
              required
              error={cloneErrors.nome}
              placeholder="Informe o nome do produto clonado"
            />

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1 text-gray-300">
                Catálogo de destino
                <span className="text-red-400 ml-1">*</span>
              </label>
              <select
                className="w-full bg-[#1e2126] border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring focus:border-blue-500"
                value={cloneCatalogoId || (produtoParaClonar.catalogoId ? String(produtoParaClonar.catalogoId) : '')}
                onChange={(e) => {
                  setCloneCatalogoId(e.target.value);
                  if (cloneErrors.catalogo) {
                    setCloneErrors(prev => ({ ...prev, catalogo: undefined }));
                  }
                }}
              >
                <option value="" disabled={Boolean(produtoParaClonar.catalogoId)}>
                  Selecione um catálogo
                </option>
                {catalogos.map(catalogo => (
                  <option key={catalogo.id} value={catalogo.id}>
                    {catalogo.numero} - {catalogo.nome}
                  </option>
                ))}
              </select>
              {cloneErrors.catalogo && (
                <p className="mt-1 text-sm text-red-400">{cloneErrors.catalogo}</p>
              )}
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-300">Novos códigos internos (SKU/PN)</span>
                <Button
                  variant="outline"
                  size="xs"
                  type="button"
                  onClick={adicionarSku}
                  disabled={clonandoProduto}
                >
                  Adicionar SKU
                </Button>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Os códigos informados substituirão os do produto original. Deixe vazio para não copiar nenhum SKU.
              </p>
              {cloneSkus.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum SKU será copiado.</p>
              ) : (
                <div className="space-y-2">
                  {cloneSkus.map((sku, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        className="flex-1 px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
                        value={sku}
                        onChange={(e) => atualizarSku(index, e.target.value)}
                        placeholder={`SKU ${index + 1}`}
                        maxLength={50}
                      />
                      <button
                        type="button"
                        className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                        onClick={() => removerSku(index)}
                        aria-label={`Remover SKU ${index + 1}`}
                        disabled={clonandoProduto}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={cancelarClonagem} disabled={clonandoProduto}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={confirmarClonagem} disabled={clonandoProduto || catalogos.length === 0}>
                {clonandoProduto ? 'Clonando...' : 'Clonar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
