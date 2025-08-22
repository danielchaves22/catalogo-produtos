// frontend/pages/operadores-estrangeiros/index.tsx - CORRIGIDO
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/PageLoader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import { useOperadorEstrangeiro } from '@/hooks/useOperadorEstrangeiro';
import { Plus, Trash2, AlertCircle, Search, Globe, Pencil } from 'lucide-react';
import { useRouter } from 'next/router';
import { formatCPFOrCNPJ } from '@/lib/validation';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';

interface OperadorEstrangeiro {
  id: number;
  cnpjRaizResponsavel: string;
  tin?: string;
  nome: string;
  email?: string;
  codigoInterno?: string;
  codigo?: string;
  versao: number;
  situacao: 'ATIVO' | 'INATIVO' | 'DESATIVADO';
  dataInclusao: string;
  dataUltimaAlteracao: string;
  pais: {
    codigo: string;
    sigla: string;
    nome: string;
  };
  subdivisao?: {
    codigo: string;
    sigla: string;
    nome: string;
  };
  cidade?: string;
  logradouro?: string;
}

export default function OperadoresEstrangeirosPage() {
  const [operadores, setOperadores] = useState<OperadorEstrangeiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operadorParaExcluir, setOperadorParaExcluir] = useState<number | null>(null);
  const [filtros, setFiltros] = useState({
    busca: '',
    situacao: 'TODOS'
  });
  const { addToast } = useToast();
  const router = useRouter();
  const { buscarOperadores, desativarOperador, getCnpjCatalogoNome, extrairCnpjRaiz } = useOperadorEstrangeiro();
  const { workingCatalog } = useWorkingCatalog();

  useEffect(() => {
    carregarOperadores();
  }, [workingCatalog]);

  async function carregarOperadores() {
    try {
      setLoading(true);
      const filtros = workingCatalog?.cpf_cnpj
        ? { cnpjRaiz: extrairCnpjRaiz(workingCatalog.cpf_cnpj) }
        : undefined;
      const dados = await buscarOperadores(filtros);
      setOperadores(dados);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar operadores estrangeiros:', err);
      setError('Não foi possível carregar os operadores estrangeiros. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function formatarData(dataString: string) {
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR');
  }

  function confirmarExclusao(id: number) {
    setOperadorParaExcluir(id);
  }

  function cancelarExclusao() {
    setOperadorParaExcluir(null);
  }

  async function excluirOperador() {
    if (!operadorParaExcluir) return;

    try {
      await desativarOperador(operadorParaExcluir);
      setOperadores(operadores.filter(op => op.id !== operadorParaExcluir));
      addToast('Operador estrangeiro desativado com sucesso', 'success');
    } catch (err) {
      console.error('Erro ao excluir operador estrangeiro:', err);
      addToast('Erro ao desativar operador estrangeiro', 'error');
    } finally {
      setOperadorParaExcluir(null);
    }
  }

  function editarOperador(id: number) {
    router.push(`/operadores-estrangeiros/${id}`);
  }

  function novoOperador() {
    router.push('/operadores-estrangeiros/novo');
  }

  // Filtrar operadores conforme busca e situação
  const operadoresFiltrados = operadores.filter(operador => {
    const matchBusca = filtros.busca === '' || 
      operador.nome.toLowerCase().includes(filtros.busca.toLowerCase()) ||
      operador.tin?.toLowerCase().includes(filtros.busca.toLowerCase()) ||
      operador.pais.nome.toLowerCase().includes(filtros.busca.toLowerCase());
    
    const matchSituacao = filtros.situacao === 'TODOS' || operador.situacao === filtros.situacao;
    
    return matchBusca && matchSituacao;
  });

  if (loading) {
    return (
      <DashboardLayout title="Operadores Estrangeiros">
        <PageLoader message="Carregando operadores estrangeiros..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Operadores Estrangeiros">
      <Breadcrumb 
        items={[
          { label: 'Início', href: '/' },
          { label: 'Operadores Estrangeiros' }
        ]} 
      />

      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-white">Lista de Operadores Estrangeiros</h1>
        <Button 
          variant="accent" 
          className="flex items-center gap-2"
          onClick={novoOperador}
        >
          <Plus size={16} />
          <span>Novo Operador</span>
        </Button>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nome, TIN ou país..."
              className="pl-10 pr-4 py-2 w-full bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
              value={filtros.busca}
              onChange={(e) => setFiltros({...filtros, busca: e.target.value})}
            />
          </div>
          
          <select
            className="bg-[#1e2126] border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring focus:border-blue-500"
            value={filtros.situacao}
            onChange={(e) => setFiltros({...filtros, situacao: e.target.value})}
          >
            <option value="TODOS">Todas as situações</option>
            <option value="ATIVO">Ativo</option>
            <option value="INATIVO">Inativo</option>
            <option value="DESATIVADO">Desativado</option>
          </select>

          <div className="text-sm text-gray-400 self-center">
            Exibindo {operadoresFiltrados.length} de {operadores.length} operadores
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
        {operadoresFiltrados.length === 0 ? (
          <div className="text-center py-10">
            <Globe size={48} className="mx-auto text-gray-500 mb-4" />
            <p className="text-gray-400 mb-4">
              {operadores.length === 0 
                ? "Não há operadores estrangeiros cadastrados." 
                : "Nenhum operador encontrado com os filtros aplicados."
              }
            </p>
            <Button 
              variant="primary" 
              className="inline-flex items-center gap-2"
              onClick={novoOperador}
            >
              <Plus size={16} />
              <span>Cadastrar Primeiro Operador</span>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                <tr>
                  <th className="w-16 px-4 py-3 text-center">Ações</th>
                  <th className="px-4 py-3">TIN</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Empresa Responsável</th>
                  <th className="px-4 py-3">País</th>
                  <th className="px-4 py-3">Cidade</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Versão</th>
                  <th className="px-4 py-3">Última Alteração</th>
                </tr>
              </thead>
              <tbody>
                {operadoresFiltrados.map((operador) => (
                  <tr
                    key={operador.id}
                    className="border-b border-gray-700 hover:bg-[#1a1f2b] transition-colors"
                  >
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        className="p-1 text-gray-300 hover:text-blue-500 transition-colors"
                        onClick={() => editarOperador(operador.id)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                        onClick={() => confirmarExclusao(operador.id)}
                        disabled={operador.situacao === 'DESATIVADO'}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#f59e0b]">
                      {operador.tin || '-'}
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{operador.nome}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <div className="font-medium text-white">{getCnpjCatalogoNome(operador.cnpjRaizResponsavel)}</div>
                        <div className="text-gray-400 font-mono">{formatCPFOrCNPJ(operador.cnpjRaizResponsavel)}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-gray-700 px-2 py-1 rounded">
                          {operador.pais.sigla}
                        </span>
                        <span>{operador.pais.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{operador.cidade || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        operador.situacao === 'ATIVO' 
                          ? 'bg-green-900/50 text-green-400 border border-green-700' 
                          : operador.situacao === 'INATIVO'
                          ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-700'
                          : 'bg-red-900/50 text-red-400 border border-red-700'
                      }`}>
                        {operador.situacao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">{operador.versao}</td>
                    <td className="px-4 py-3">{formatarData(operador.dataUltimaAlteracao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal de confirmação para exclusão */}
      {operadorParaExcluir && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#151921] rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Confirmar Desativação</h3>
            <p className="text-gray-300 mb-6">
              Tem certeza que deseja desativar este operador estrangeiro? Esta ação irá desvinculá-lo de todos os produtos relacionados.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={cancelarExclusao}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={excluirOperador}>
                Desativar
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}