// frontend/pages/produtos.tsx - listagem de produtos
import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/PageLoader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { AlertCircle, Plus, Search } from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

interface Produto {
  id: number;
  codigo: string;
  ncmCodigo: string;
  status: 'RASCUNHO' | 'ATIVO' | 'INATIVO';
  atualizadoEm: string;
  catalogoNumero?: number;
  catalogoNome?: string;
  nome?: string;
  codigoInterno?: string;
  situacao?: string;
}

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    carregarProdutos();
  }, []);

  async function carregarProdutos() {
    try {
      setLoading(true);
      const response = await api.get('/produtos');
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

  const produtosFiltrados = produtos.filter(p => {
    const termo = busca.toLowerCase();
    return (
      p.codigo.toLowerCase().includes(termo) ||
      p.ncmCodigo.toLowerCase().includes(termo) ||
      (p.nome && p.nome.toLowerCase().includes(termo))
    );
  });

  if (loading) {
    return (
      <DashboardLayout title="Produtos">
        <PageLoader message="Carregando produtos..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Produtos">
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Produtos' }]} />

      {/* Campo de busca */}
      <div className="mb-6 flex justify-between">
        <div className="relative max-w-md">
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
        <Link href="/produtos/novo" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors">
          <Plus size={18} />
          <span>Novo Produto</span>
        </Link>
      </div>

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
                  <th className="px-4 py-3">Nº do Catálogo</th>
                  <th className="px-4 py-3">Nome Catálogo</th>
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
                  <tr key={produto.id} className="border-b border-gray-700 hover:bg-[#1a1f2b] transition-colors">
                    <td className="px-4 py-3 font-mono text-[#f59e0b]">{produto.catalogoNumero ?? '-'}</td>
                    <td className="px-4 py-3">{produto.catalogoNome ?? '-'}</td>
                    <td className="px-4 py-3">{produto.nome ?? produto.codigo}</td>
                    <td className="px-4 py-3">{produto.codigoInterno ?? '-'}</td>
                    <td className="px-4 py-3 font-mono">{produto.ncmCodigo}</td>
                    <td className="px-4 py-3">{produto.status}</td>
                    <td className="px-4 py-3">{produto.situacao ?? '-'}</td>
                    <td className="px-4 py-3">{formatarData(produto.atualizadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </DashboardLayout>
  );
}
