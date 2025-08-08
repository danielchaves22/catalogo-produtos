// frontend/pages/produtos.tsx - listagem de produtos
import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/PageLoader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { AlertCircle, Plus, Search, Trash2, Pencil } from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useToast } from '@/components/ui/ToastContext';

interface Produto {
  id: number;
  codigo: string;
  ncmCodigo: string;
  status: 'PENDENTE' | 'APROVADO' | 'PROCESSANDO' | 'TRANSMITIDO' | 'ERRO';
  atualizadoEm: string;
  catalogoNumero?: number;
  catalogoNome?: string;
  catalogoCpfCnpj?: string;
  denominacao?: string;
  descricao?: string;
  codigoInterno?: string;
  situacao?: string;
}

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtros, setFiltros] = useState({
    status: 'TODOS',
    situacao: 'TODOS',
    ncm: '',
    catalogoId: ''
  });
  const [produtoParaExcluir, setProdutoParaExcluir] = useState<number | null>(null);
  const [catalogos, setCatalogos] = useState<{ id: number; numero: number; nome: string }[]>([]);
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    if (router.isReady && typeof router.query.catalogoId === 'string') {
      setFiltros(prev => ({ ...prev, catalogoId: router.query.catalogoId as string }));
    }
  }, [router.isReady, router.query.catalogoId]);

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

  useEffect(() => {
    if (!router.isReady) return;
    carregarProdutos();
  }, [router.isReady, filtros.status, filtros.situacao, filtros.ncm, filtros.catalogoId]);

  async function carregarProdutos() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filtros.status !== 'TODOS') params.append('status', filtros.status);
      if (filtros.situacao !== 'TODOS') params.append('situacao', filtros.situacao);
      if (filtros.ncm) params.append('ncm', filtros.ncm);
      if (filtros.catalogoId) params.append('catalogoId', filtros.catalogoId);
      const query = params.toString();
      const url = query ? `/produtos?${query}` : '/produtos';
      const response = await api.get(url);
      setProdutos(response.data);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
      setError('Não foi possível carregar os produtos.');
    } finally {
      setLoading(false);
    }
  }

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
        return 'bg-[#4c82d31a] text-[#4c82d3] border border-[#4c82d3]';
      case 'ERRO':
        return 'bg-[#f2545f1a] text-[#f2545f] border border-[#f2545f]';
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

  const produtosFiltrados = produtos.filter(p => {
    const termo = busca.toLowerCase();
    const matchBusca =
      (p.codigo || '').toLowerCase().includes(termo) ||
      p.ncmCodigo.toLowerCase().includes(termo) ||
      (p.denominacao && p.denominacao.toLowerCase().includes(termo));

    const matchStatus =
      filtros.status === 'TODOS' || p.status === filtros.status;

    const matchSituacao =
      filtros.situacao === 'TODOS' || p.situacao === filtros.situacao;

    const matchNcm =
      filtros.ncm === '' || p.ncmCodigo.includes(filtros.ncm);

    return matchBusca && matchStatus && matchSituacao && matchNcm;
  });

  if (loading) {
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

  return (
    <DashboardLayout title="Produtos">
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Produtos' }]} />

      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-white">Lista de Produtos</h1>
        <Link
          href="/produtos/novo"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          <Plus size={16} />
          <span>Novo Produto</span>
        </Link>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar produtos..."
              className="pl-10 pr-4 py-2 w-full bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <input
            type="text"
            placeholder="Filtrar NCM"
            className="px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
            value={filtros.ncm}
            onChange={e => setFiltros({ ...filtros, ncm: e.target.value })}
          />
          <select
            className="bg-[#1e2126] border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring focus:border-blue-500"
            value={filtros.catalogoId}
            onChange={e => setFiltros({ ...filtros, catalogoId: e.target.value })}
          >
            <option value="">Todos os catálogos</option>
            {catalogos.map(catalogo => (
              <option key={catalogo.id} value={catalogo.id}>
                {catalogo.numero} - {catalogo.nome}
              </option>
            ))}
          </select>
          <select
            className="bg-[#1e2126] border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring focus:border-blue-500"
            value={filtros.status}
            onChange={e => setFiltros({ ...filtros, status: e.target.value })}
          >
            <option value="TODOS">Todos os status</option>
            <option value="PENDENTE">Pendente</option>
            <option value="APROVADO">Aprovado</option>
            <option value="PROCESSANDO">Processando</option>
            <option value="TRANSMITIDO">Transmitido</option>
            <option value="ERRO">Erro</option>
          </select>
          <select
            className="bg-[#1e2126] border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring focus:border-blue-500"
            value={filtros.situacao}
            onChange={e => setFiltros({ ...filtros, situacao: e.target.value })}
          >
            <option value="TODOS">Todas as situações</option>
            <option value="ATIVADO">Ativado</option>
            <option value="DESATIVADO">Desativado</option>
            <option value="RASCUNHO">Rascunho</option>
          </select>
          <div className="text-sm text-gray-400 self-center">
            Exibindo {produtosFiltrados.length} de {produtos.length} produtos
          </div>
        </div>
      </Card>

      {error && (
        <div className="bg-red-500/20 border border-red-700 p-4 rounded-lg mb-6 flex items-center gap-3">
          <AlertCircle className="text-red-500" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        {produtosFiltrados.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-400 mb-4">Nenhum produto encontrado.</p>
            <Link href="/produtos/novo" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors">
              <Plus size={16} />
              <span>Adicionar Produto</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                <tr>
                  <th className="w-16 px-4 py-3 text-center">Ações</th>
                  <th className="px-4 py-3">Nº do Catálogo</th>
                  <th className="px-4 py-3">Nome Catálogo</th>
                  <th className="px-4 py-3">CPF/CNPJ</th>
                  <th className="px-4 py-3">Nome do Produto</th>
                  <th className="px-4 py-3">Código Interno</th>
                  <th className="px-4 py-3">NCM</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Última Alteração</th>
                </tr>
              </thead>
              <tbody>
                {produtosFiltrados.map((produto) => (
                  <tr
                    key={produto.id}
                    className="border-b border-gray-700 hover:bg-[#1a1f2b] transition-colors"
                  >
                    <td className="px-4 py-3 flex gap-2">
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
                    <td className="px-4 py-3 font-mono text-[#f59e0b]">{produto.catalogoNumero ?? '-'}</td>
                    <td className="px-4 py-3">{produto.catalogoNome ?? '-'}</td>
                    <td className="px-4 py-3">{produto.catalogoCpfCnpj ?? '-'}</td>
                    <td className="px-4 py-3">{produto.denominacao ?? produto.codigo ?? '-'}</td>
                    <td className="px-4 py-3">{produto.codigoInterno ?? '-'}</td>
                    <td className="px-4 py-3 font-mono">{produto.ncmCodigo}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
    </DashboardLayout>
  );
}
