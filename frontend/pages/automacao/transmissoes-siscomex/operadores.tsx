// frontend/pages/automacao/transmissoes-siscomex/operadores.tsx
import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { useOperadorEstrangeiro, OperadorEstrangeiro } from '@/hooks/useOperadorEstrangeiro';
import { AlertCircle, Check, Download, Search } from 'lucide-react';
import api from '@/lib/api';

interface CatalogoResumo {
  id: number;
  numero: number;
  nome: string;
}

interface OperadorParaTransmissao extends OperadorEstrangeiro {
  status?: 'PENDENTE' | 'APROVADO' | 'PROCESSANDO' | 'TRANSMITIDO' | 'ERRO';
}

export default function NovaTransmissaoOperadoresPage() {
  const [operadores, setOperadores] = useState<OperadorParaTransmissao[]>([]);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<'ATIVADO' | 'RASCUNHO' | ''>('ATIVADO');
  const [catalogoId, setCatalogoId] = useState('');
  const [catalogos, setCatalogos] = useState<CatalogoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [transmitindo, setTransmitindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { addToast } = useToast();
  const { workingCatalog } = useWorkingCatalog();
  const { buscarOperadores } = useOperadorEstrangeiro();

  const catalogoBloqueado = Boolean(workingCatalog?.id);

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
        console.error('Erro ao carregar catálogos para transmissão de operadores estrangeiros:', error);
      }
    }

    carregarCatalogos();
  }, []);

  useEffect(() => {
    async function carregarOperadores() {
      try {
        setCarregando(true);
        const params = catalogoId ? { catalogoId: Number(catalogoId) } : undefined;
        const dados = await buscarOperadores(params);
        const aprovados = dados.filter(op => ((op as OperadorParaTransmissao).status ?? 'APROVADO') === 'APROVADO');
        setOperadores(aprovados);
        setErro(null);
      } catch (error) {
        console.error('Erro ao carregar operadores estrangeiros aprovados:', error);
        setErro('Não foi possível carregar os operadores aguardando transmissão.');
      } finally {
        setCarregando(false);
      }
    }

    carregarOperadores();
  }, [buscarOperadores, catalogoId]);

  const operadoresFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return operadores.filter(op => {
      const atendeBusca =
        !termo ||
        op.nome.toLowerCase().includes(termo) ||
        (op.tin || '').toLowerCase().includes(termo) ||
        (op.pais?.nome || '').toLowerCase().includes(termo);
      const atendeSituacao = !situacao || op.situacao === situacao;
      return atendeBusca && atendeSituacao;
    });
  }, [busca, operadores, situacao]);

  const todosSelecionados = operadoresFiltrados.length > 0 && selecionados.size === operadoresFiltrados.length;

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
      return new Set(operadoresFiltrados.map(op => op.id));
    });
  };

  const transmitir = async () => {
    if (selecionados.size === 0) return;
    setTransmitindo(true);
    try {
      const registros = operadoresFiltrados.filter(op => selecionados.has(op.id));
      const payload = {
        modalidade: 'OPERADORES_ESTRANGEIROS',
        catalogoId: catalogoId || workingCatalog?.id || null,
        registros,
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transmissao-operadores-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      addToast('Exportação JSON gerada para testes. Processo assíncrono será conectado futuramente.', 'success');
      setSelecionados(new Set());
    } catch (error) {
      console.error('Erro ao exportar operadores estrangeiros para transmissão:', error);
      addToast('Não foi possível iniciar a transmissão.', 'error');
    } finally {
      setTransmitindo(false);
    }
  };

  return (
    <DashboardLayout title="Nova transmissão de operadores estrangeiros">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao' },
          { label: 'Transmissões ao SISCOMEX', href: '/automacao/transmissoes-siscomex' },
          { label: 'Operadores Estrangeiros' },
        ]}
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Selecionar operadores aprovados</h1>
          <p className="text-gray-400 text-sm">
            Apenas operadores aprovados e ainda não enviados são exibidos. Ajuste filtros e confirme o envio.
          </p>
        </div>
        <Button
          variant="primary"
          className="flex items-center gap-2"
          disabled={selecionados.size === 0 || transmitindo}
          onClick={transmitir}
        >
          {transmitindo ? <Check size={16} className="animate-spin" /> : <Download size={16} />}
          Transmitir registros ao SISCOMEX
        </Button>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Input
            label="Busca por nome, TIN ou país"
            placeholder="Digite para filtrar"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />

          <Select
            label="Situação"
            value={situacao}
            onChange={e => setSituacao(e.target.value as typeof situacao)}
            options={[
              { value: 'ATIVADO', label: 'Ativado' },
              { value: 'RASCUNHO', label: 'Rascunho' },
            ]}
            placeholder="Selecione a situação"
          />

          <Select
            label="Catálogo"
            value={catalogoId}
            disabled={catalogoBloqueado}
            onChange={e => setCatalogoId(e.target.value)}
            options={
              catalogoBloqueado && workingCatalog
                ? [
                    {
                      value: String(workingCatalog.id),
                      label: `${workingCatalog.numero ?? '—'} · ${workingCatalog.nome}`,
                    },
                  ]
                : catalogos.map(c => ({ value: String(c.id), label: `${c.numero} · ${c.nome}` }))
            }
            placeholder="Selecione o catálogo"
          />

          <div className="flex items-end text-sm text-gray-300">
            Somente operadores com status Aprovado são exibidos.
          </div>
        </div>
      </Card>

      {erro && (
        <div className="bg-red-500/10 border border-red-700 text-red-200 p-4 rounded flex items-center gap-3 mb-4">
          <AlertCircle size={18} />
          <span>{erro}</span>
        </div>
      )}

      {carregando ? (
        <PageLoader message="Carregando operadores estrangeiros aprovados..." />
      ) : operadoresFiltrados.length === 0 ? (
        <Card>
          <div className="text-center py-10 text-gray-400">
            Nenhum operador aprovado encontrado com os filtros selecionados.
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
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">TIN</th>
                  <th className="px-4 py-3">País</th>
                  <th className="px-4 py-3">Situação</th>
                </tr>
              </thead>
              <tbody>
                {operadoresFiltrados.map(op => (
                  <tr key={op.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selecionados.has(op.id)}
                        onChange={() => alternarSelecao(op.id)}
                        aria-label={`Selecionar operador ${op.nome}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-200">{op.nome}</td>
                    <td className="px-4 py-3 text-gray-200">{op.tin || '-'}</td>
                    <td className="px-4 py-3 text-gray-200">{op.pais?.nome || '-'}</td>
                    <td className="px-4 py-3 text-gray-200">{op.situacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-sm text-gray-400">
            {selecionados.size} operador(es) selecionado(s) de {operadoresFiltrados.length} exibidos.
          </div>
        </Card>
      )}
    </DashboardLayout>
  );
}
