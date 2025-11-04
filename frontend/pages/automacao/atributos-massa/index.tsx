import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { Eye, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { formatCPFOrCNPJ } from '@/lib/validation';

type AsyncJobStatus = 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHO' | 'CANCELADO';

interface CatalogoResumo {
  id: number;
  nome: string | null;
  numero: number | null;
  cpf_cnpj: string | null;
}

interface ProdutoResumo {
  id: number;
  codigo: string | null;
  denominacao: string;
  catalogo?: CatalogoResumo | null;
}

interface RegistroPreenchimentoMassa {
  id: number;
  ncmCodigo: string;
  modalidade: string | null;
  catalogos: CatalogoResumo[];
  produtosImpactados: number;
  criadoEm: string;
  criadoPor: string | null;
  valoresAtributos: Record<string, unknown>;
  estruturaSnapshot: any;
  produtosExcecao: ProdutoResumo[];
  jobId: number | null;
  jobStatus: AsyncJobStatus | null;
  jobFinalizadoEm: string | null;
}

function formatarNCM(ncm: string) {
  const digits = ncm.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return digits.replace(/(\d{4})(\d{1,2})/, '$1.$2');
  return digits.replace(/(\d{4})(\d{2})(\d{1,2})/, '$1.$2.$3');
}

function formatarModalidade(modalidade?: string | null) {
  if (!modalidade) return '-';
  const valor = modalidade.toUpperCase();
  if (valor === 'IMPORTACAO') return 'Importação';
  if (valor === 'EXPORTACAO') return 'Exportação';
  return modalidade;
}

function formatarData(dataIso: string) {
  if (!dataIso) return '-';
  const data = new Date(dataIso);
  if (Number.isNaN(data.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(data);
}

function descreverCatalogos(lista: CatalogoResumo[]) {
  if (!lista || lista.length === 0) {
    return 'Todos os catálogos';
  }
  return lista
    .map(item => {
      const partes: string[] = [];
      if (item.nome) partes.push(item.nome);
      if (item.cpf_cnpj) partes.push(formatCPFOrCNPJ(item.cpf_cnpj));
      return partes.join(' • ') || `Catálogo #${item.id}`;
    })
    .join(', ');
}

function traduzirStatusProcesso(status?: AsyncJobStatus | null) {
  switch (status) {
    case 'CONCLUIDO':
      return 'Concluído';
    case 'PROCESSANDO':
      return 'Em processamento';
    case 'FALHO':
      return 'Falho';
    case 'CANCELADO':
      return 'Cancelado';
    default:
      return 'Pendente';
  }
}

function classeStatusProcesso(status?: AsyncJobStatus | null) {
  switch (status) {
    case 'CONCLUIDO':
      return 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40';
    case 'PROCESSANDO':
      return 'bg-sky-500/10 text-sky-300 border border-sky-500/40';
    case 'FALHO':
    case 'CANCELADO':
      return 'bg-rose-500/10 text-rose-300 border border-rose-500/40';
    default:
      return 'bg-slate-500/10 text-slate-300 border border-slate-500/40';
  }
}

export default function PreenchimentoMassaListaPage() {
  const [registros, setRegistros] = useState<RegistroPreenchimentoMassa[]>([]);
  const [loading, setLoading] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState(false);
  const [filtro, setFiltro] = useState('');
  const { addToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setLoading(true);
      setErroCarregamento(false);
      const resposta = await api.get('/automacao/atributos-massa');
      const dados = (resposta.data || []) as RegistroPreenchimentoMassa[];
      setRegistros(dados);
    } catch (error) {
      console.error('Erro ao carregar histórico de preenchimento em massa:', error);
      setErroCarregamento(true);
      addToast('Erro ao carregar histórico de preenchimento em massa', 'error');
    } finally {
      setLoading(false);
    }
  }

  const registrosFiltrados = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    if (!termo) return registros;
    return registros.filter(item => {
      const ncmMatch = formatarNCM(item.ncmCodigo).replace(/\./g, '').includes(termo.replace(/\D/g, ''));
      const modalidadeMatch = (item.modalidade || '').toLowerCase().includes(termo);
      const catalogoMatch = item.catalogos?.some(catalogo => {
        const nome = catalogo.nome?.toLowerCase() || '';
        const numero = catalogo.numero ? String(catalogo.numero) : '';
        const documento = catalogo.cpf_cnpj?.replace(/\D/g, '') || '';
        const termoNumerico = termo.replace(/\D/g, '');
        return (
          nome.includes(termo) ||
          (numero && numero.includes(termo)) ||
          (documento && termoNumerico && documento.includes(termoNumerico))
        );
      });
      return ncmMatch || modalidadeMatch || Boolean(catalogoMatch);
    });
  }, [filtro, registros]);

  return (
    <DashboardLayout title="Preencher Atributos em Massa">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao/importar-produto' },
          { label: 'Preencher Atributos em Massa' }
        ]}
      />

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Histórico de Preenchimento em Massa</h1>
          <p className="text-sm text-gray-400">
            Consulte as atribuições em massa realizadas e inicie novas ações quando necessário.
          </p>
        </div>
        <Button
          variant="accent"
          className="flex items-center gap-2"
          onClick={() => router.push('/automacao/atributos-massa/nova')}
        >
          <Plus size={16} />
          Nova atribuição
        </Button>
      </div>

      <Card className="mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-gray-300">
            <Search size={16} />
            <Input
              value={filtro}
              onChange={event => setFiltro(event.target.value)}
              placeholder="Filtrar por NCM, modalidade ou catálogo"
              className="border-none bg-transparent p-0 focus:ring-0"
            />
          </div>
          <Button variant="outline" onClick={carregar} disabled={loading}>
            Recarregar
          </Button>
        </div>
      </Card>

      <Card>
        {loading && <p className="text-gray-300">Carregando histórico...</p>}
        {!loading && erroCarregamento && (
          <p className="text-red-400">Não foi possível carregar o histórico. Tente novamente mais tarde.</p>
        )}
        {!loading && !erroCarregamento && registrosFiltrados.length === 0 && (
          <p className="text-gray-300">Nenhuma atribuição em massa registrada até o momento.</p>
        )}

        {!loading && !erroCarregamento && registrosFiltrados.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase text-gray-400">
                  <th className="w-16 px-4 py-3 text-center">Ações</th>
                  <th className="px-4 py-3">NCM</th>
                  <th className="px-4 py-3">Modalidade</th>
                  <th className="px-4 py-3">Catálogos</th>
                  <th className="px-4 py-3">Status do processo</th>
                  <th className="px-4 py-3">Produtos atualizados</th>
                  <th className="px-4 py-3">Executado em</th>
                  <th className="px-4 py-3">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-sm text-gray-200">
                {registrosFiltrados.map(item => (
                  <tr key={item.id} className="hover:bg-gray-900/50">
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        className="p-1 text-gray-300 hover:text-blue-500 transition-colors"
                        onClick={() => router.push(`/automacao/atributos-massa/${item.id}`)}
                        title="Ver detalhes"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium">{formatarNCM(item.ncmCodigo)}</td>
                    <td className="px-4 py-3">{formatarModalidade(item.modalidade)}</td>
                    <td className="px-4 py-3">{descreverCatalogos(item.catalogos)}</td>
                    <td className="px-4 py-3">
                      {item.jobStatus ? (
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classeStatusProcesso(item.jobStatus)}`}
                        >
                          {traduzirStatusProcesso(item.jobStatus)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{item.produtosImpactados}</td>
                    <td className="px-4 py-3">{formatarData(item.criadoEm)}</td>
                    <td className="px-4 py-3">{item.criadoPor || '-'}</td>
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
