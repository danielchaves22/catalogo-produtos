// frontend/pages/catalogos/index.tsx (CORRIGIDO com formatação)
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/PageLoader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import { Input } from '@/components/ui/Input';
import { MaskedInput } from '@/components/ui/MaskedInput';
import { EnvironmentBadge } from '@/components/ui/EnvironmentBadge';
import { Plus, Trash2, AlertCircle, Pencil, FileText, Copy } from 'lucide-react';
import { useRouter } from 'next/router';
import api from '@/lib/api';
import { formatCPFOrCNPJ } from '@/lib/validation';

interface Catalogo {
  id: number;
  numero: number;
  nome: string;
  cpf_cnpj: string | null;
  status: 'ATIVO' | 'INATIVO';
  ambiente: 'HOMOLOGACAO' | 'PRODUCAO';
  ultima_alteracao: string;
}

export default function CatalogosPage() {
  const [catalogos, setCatalogos] = useState<Catalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogoParaExcluir, setCatalogoParaExcluir] = useState<number | null>(null);
  const [catalogoParaClonar, setCatalogoParaClonar] = useState<number | null>(null);
  const [novoCpfCnpj, setNovoCpfCnpj] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const { addToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    carregarCatalogos();
  }, []);

  async function carregarCatalogos() {
    try {
      setLoading(true);
      const response = await api.get('/catalogos', { params: { visiveis: true } });
      setCatalogos(response.data);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar catálogos:', err);
      setError('Não foi possível carregar os catálogos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function formatarData(dataString: string) {
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR');
  }

  // NOVA FUNÇÃO: Formatar CPF/CNPJ para exibição
  function formatarCpfCnpj(valor: string | null) {
    if (!valor) return '-';
    return formatCPFOrCNPJ(valor);
  }

  function confirmarExclusao(id: number) {
    setCatalogoParaExcluir(id);
  }

  function cancelarExclusao() {
    setCatalogoParaExcluir(null);
  }

  async function excluirCatalogo() {
    if (!catalogoParaExcluir) return;

    try {
      await api.delete(`/catalogos/${catalogoParaExcluir}`);
      setCatalogos(catalogos.filter(cat => cat.id !== catalogoParaExcluir));
      addToast('Catálogo excluído com sucesso', 'success');
    } catch (err) {
      console.error('Erro ao excluir catálogo:', err);
      addToast('Erro ao excluir catálogo', 'error');
    } finally {
      setCatalogoParaExcluir(null);
    }
  }

  function editarCatalogo(id: number) {
    router.push(`/catalogos/${id}`);
  }

  function novoCatalogo() {
    router.push('/catalogos/novo');
  }

  function abrirModalClonar(id: number) {
    setCatalogoParaClonar(id);
    setNovoCpfCnpj('');
    setNovoNome('');
  }

  function cancelarClonagem() {
    setCatalogoParaClonar(null);
    setNovoCpfCnpj('');
    setNovoNome('');
  }

  async function confirmarClonagem() {
    if (!catalogoParaClonar) return;
    try {
      await api.post(`/catalogos/${catalogoParaClonar}/clonar`, {
        cpf_cnpj: novoCpfCnpj,
        nome: novoNome
      });
      addToast('Catálogo clonado com sucesso', 'success');
      cancelarClonagem();
      await carregarCatalogos();
    } catch (err: any) {
      const mensagem = err.response?.data?.error || 'Erro ao clonar catálogo';
      addToast(mensagem, 'error');
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Catálogos">
        <PageLoader message="Carregando catálogos..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Catálogos">
      <Breadcrumb 
        items={[
          { label: 'Início', href: '/' },
          { label: 'Catálogos' }
        ]} 
      />

      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-white">Lista de Catálogos</h1>
        <Button 
          variant="accent" 
          className="flex items-center gap-2"
          onClick={novoCatalogo}
        >
          <Plus size={16} />
          <span>Novo Catálogo</span>
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-700 p-4 rounded-lg mb-6 flex items-center gap-3">
          <AlertCircle className="text-red-500" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        {catalogos.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-400 mb-4">Não há catálogos cadastrados.</p>
            <Button
              variant="primary"
              className="inline-flex items-center gap-2"
              onClick={novoCatalogo}
            >
              <Plus size={16} />
              <span>Criar Primeiro Catálogo</span>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                <tr>
                  <th className="w-24 px-4 py-3 text-center">Ações</th>
                  <th className="px-4 py-3">Número</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">CPF/CNPJ</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Última Alteração</th>
                  <th className="px-4 py-3">Ambiente</th>
                </tr>
              </thead>
              <tbody>
                {catalogos.map((catalogo) => (
                  <tr
                    key={catalogo.id}
                    className="border-b border-gray-700 hover:bg-[#1a1f2b] transition-colors"
                  >
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        className="p-1 text-gray-300 hover:text-green-500 transition-colors"
                        onClick={() => router.push(`/produtos?catalogoId=${catalogo.id}`)}
                        title="Ver produtos"
                      >
                        <FileText size={16} />
                      </button>
                      <button
                        className="p-1 text-gray-300 hover:text-purple-500 transition-colors"
                        onClick={() => abrirModalClonar(catalogo.id)}
                        title="Clonar catálogo"
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        className="p-1 text-gray-300 hover:text-blue-500 transition-colors"
                        onClick={() => editarCatalogo(catalogo.id)}
                        title="Editar catálogo"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                        onClick={() => confirmarExclusao(catalogo.id)}
                        title="Excluir catálogo"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#f59e0b]">{catalogo.numero}</td>
                    <td className="px-4 py-3 font-medium text-white">{catalogo.nome}</td>
                    {/* CORRIGIDO: CPF/CNPJ formatado */}
                    <td className="px-4 py-3 font-mono">
                      {formatarCpfCnpj(catalogo.cpf_cnpj)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        catalogo.status === 'ATIVO'
                          ? 'bg-green-900/50 text-green-400 border border-green-700'
                          : 'bg-red-900/50 text-red-400 border border-red-700'
                      }`}>
                        {catalogo.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatarData(catalogo.ultima_alteracao)}</td>
                    <td className="px-4 py-3">
                      <EnvironmentBadge ambiente={catalogo.ambiente} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal de confirmação para exclusão */}
      {catalogoParaExcluir && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#151921] rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Confirmar Exclusão</h3>
            <p className="text-gray-300 mb-6">
              Tem certeza que deseja excluir este catálogo? Essa ação também removerá todos os produtos e fabricantes vinculados e não poderá ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={cancelarExclusao}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={excluirCatalogo}>
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para clonagem de catálogo */}
      {catalogoParaClonar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#151921] rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Clonar Catálogo</h3>
            <Input
              label="Novo nome"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              required
            />
            <MaskedInput
              label="Novo CNPJ"
              mask="cnpj"
              value={novoCpfCnpj}
              onChange={(val) => setNovoCpfCnpj(val)}
              required
            />
            <div className="flex justify-end gap-3 mt-2">
              <Button variant="outline" onClick={cancelarClonagem}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={confirmarClonagem}>
                Clonar
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}