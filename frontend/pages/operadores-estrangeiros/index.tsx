// frontend/pages/operadores-estrangeiros/index.tsx - filtro de situação com múltipla escolha
import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/PageLoader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import { useOperadorEstrangeiro, OperadorEstrangeiro } from '@/hooks/useOperadorEstrangeiro';
import { AlertCircle, Globe, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { LegendInfoModal } from '@/components/ui/LegendInfoModal';
import { useRouter } from 'next/router';
import { formatCPFOrCNPJ } from '@/lib/validation';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { operadorStatusLegend } from '@/constants/statusLegends';

type Situacao = 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';

export default function OperadoresEstrangeirosPage() {
  const [operadores, setOperadores] = useState<OperadorEstrangeiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operadorParaExcluir, setOperadorParaExcluir] = useState<number | null>(null);
  const [filtros, setFiltros] = useState({
    busca: '',
    // Padrão: todos marcados exceto DESATIVADO
    situacoes: ['RASCUNHO', 'ATIVADO'] as Situacao[],
  });

  const { addToast } = useToast();
  const router = useRouter();
  const { buscarOperadores, desativarOperador, getCatalogoNome } = useOperadorEstrangeiro();
  const { workingCatalog } = useWorkingCatalog();

  useEffect(() => {
    carregarOperadores();
  }, [workingCatalog]);

  async function carregarOperadores() {
    try {
      setLoading(true);
      const params = workingCatalog?.id ? { catalogoId: workingCatalog.id } : undefined;
      const dados = await buscarOperadores(params);
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
      setOperadores(prev => prev.filter(op => op.id !== operadorParaExcluir));
      addToast('Operador estrangeiro desativado com sucesso', 'success');
    } catch (err) {
      console.error('Erro ao desativar operador estrangeiro:', err);
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

  const operadoresFiltrados = operadores.filter(op => {
    const termo = filtros.busca.trim().toLowerCase();
    const matchBusca =
      !termo ||
      op.nome.toLowerCase().includes(termo) ||
      (op.tin || '').toLowerCase().includes(termo) ||
      op.pais.nome.toLowerCase().includes(termo);

    const matchSituacao = filtros.situacoes.length === 0 || filtros.situacoes.includes(op.situacao);
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
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Operadores Estrangeiros' }]} />

      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-white">Lista de Operadores Estrangeiros</h1>
        <Button variant="accent" className="flex items-center gap-2" onClick={novoOperador}>
          <Plus size={16} />
          <span>Novo Operador</span>
        </Button>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <label className="block text-sm font-medium mb-2 text-gray-300">Busca por nome, TIN ou país</label>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 pl-3 pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              className="pl-10 pr-4 py-2 w-full bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
              value={filtros.busca}
              onChange={(e) => setFiltros(prev => ({ ...prev, busca: e.target.value }))}
              aria-label="Busca por nome, TIN ou país"
            />
          </div>

          <MultiSelect
            label="Situação"
            options={[
              { value: 'RASCUNHO', label: 'Rascunho' },
              { value: 'ATIVADO', label: 'Ativado' },
              { value: 'DESATIVADO', label: 'Desativado' },
            ]}
            values={filtros.situacoes}
            onChange={(vals) => setFiltros(prev => ({ ...prev, situacoes: vals as Situacao[] }))}
            placeholder="Situação"
          />

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
                ? 'Não há operadores estrangeiros cadastrados.'
                : 'Nenhum operador encontrado com os filtros aplicados.'}
            </p>
            <Button variant="primary" className="inline-flex items-center gap-2" onClick={novoOperador}>
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
                  <th className="px-4 py-3">Número</th>
                  <th className="px-4 py-3">Catálogo</th>
                  <th className="px-4 py-3">CPF/CNPJ</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">País</th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">TIN</th>
                  <th className="px-4 py-3">
                    <span className="inline-flex items-center gap-1">
                      Status
                      <LegendInfoModal
                        title="Status dos Operadores Estrangeiros"
                        legend={operadorStatusLegend}
                        triggerAriaLabel="Ver detalhes sobre os status dos operadores estrangeiros"
                      />
                    </span>
                  </th>
                  <th className="px-4 py-3">Última Alteração</th>
                </tr>
              </thead>
              <tbody>
                {operadoresFiltrados.map((operador) => (
                  <tr key={operador.id} className="border-b border-gray-700 hover:bg-[#1a1f2b] transition-colors">
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        className="p-1 text-gray-300 hover:text-blue-500 transition-colors"
                        onClick={() => editarOperador(operador.id)}
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                        onClick={() => confirmarExclusao(operador.id)}
                        disabled={operador.situacao === 'DESATIVADO'}
                        title="Desativar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#f59e0b]">{operador.numero ?? '-'}</td>
                    <td className="px-4 py-3">{getCatalogoNome(operador.catalogoId)}</td>
                    <td className="px-4 py-3 font-mono">{formatCPFOrCNPJ(operador.catalogo.cpf_cnpj || '')}</td>
                    <td className="px-4 py-3 font-medium text-white">{operador.nome}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-gray-700 px-2 py-1 rounded">{operador.pais.sigla}</span>
                        <span>{operador.pais.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{operador.codigo || '-'}</td>
                    <td className="px-4 py-3 font-mono text-[#f59e0b]">{operador.tin || '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          operador.situacao === 'ATIVADO'
                            ? 'bg-[#27f58a]/20 text-[#27f58a] border border-[#27f58a]'
                            : operador.situacao === 'RASCUNHO'
                            ? 'bg-[#e4a835]/20 text-[#e4a835] border border-[#e4a835]'
                            : 'bg-[#f2545f]/20 text-[#f2545f] border border-[#f2545f]'
                        }`}
                      >
                        {operador.situacao}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatarData(operador.dataUltimaAlteracao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {operadorParaExcluir && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#151921] rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Confirmar Desativação</h3>
            <p className="text-gray-300 mb-6">
              A desativação deste Operador Estrangeiro ação irá desvincular o fabricante de todos os produtos relacionados. Deseja continuar?
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
