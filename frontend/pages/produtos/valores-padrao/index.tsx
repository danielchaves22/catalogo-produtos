// frontend/pages/produtos/valores-padrao/index.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';

interface NcmValorPadrao {
  id: number;
  ncmCodigo: string;
  modalidade?: string | null;
  criadoEm: string;
  atualizadoEm: string;
  catalogos: Array<{ id: number; nome: string; cpf_cnpj: string | null }>;
}

function formatarNCM(ncm: string) {
  const digits = ncm.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return digits.replace(/(\d{4})(\d{1,2})/, '$1.$2');
  return digits.replace(/(\d{4})(\d{2})(\d{1,2})/, '$1.$2.$3');
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

export default function ValoresPadraoNcmListaPage() {
  const [registros, setRegistros] = useState<NcmValorPadrao[]>([]);
  const [loading, setLoading] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [registroParaExcluir, setRegistroParaExcluir] = useState<NcmValorPadrao | null>(null);
  const { addToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setLoading(true);
      setErroCarregamento(false);
      const resposta = await api.get('/ncm-valores-padrao');
      setRegistros(resposta.data || []);
    } catch (error) {
      console.error('Erro ao carregar valores padrão de NCM:', error);
      setErroCarregamento(true);
      addToast('Erro ao carregar valores padrão de NCM', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function remover() {
    if (!registroParaExcluir) return;
    try {
      await api.delete(`/ncm-valores-padrao/${registroParaExcluir.id}`);
      setRegistros(prev => prev.filter(item => item.id !== registroParaExcluir.id));
      addToast('Valores padrão removidos com sucesso', 'success');
    } catch (error) {
      console.error('Erro ao remover valores padrão de NCM:', error);
      addToast('Erro ao remover valores padrão de NCM', 'error');
    } finally {
      setRegistroParaExcluir(null);
    }
  }

  const registrosFiltrados = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    if (!termo) return registros;
    return registros.filter(item => {
      const ncmMatch = formatarNCM(item.ncmCodigo).replace(/\./g, '').includes(termo.replace(/\D/g, ''));
      const modalidadeMatch = (item.modalidade || '').toLowerCase().includes(termo);
      const catalogoMatch = item.catalogos?.some(catalogo =>
        catalogo.nome.toLowerCase().includes(termo)
      );
      return ncmMatch || modalidadeMatch || catalogoMatch;
    });
  }, [filtro, registros]);

  return (
    <DashboardLayout title="Valores Padrão por NCM">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Produtos', href: '/produtos' },
          { label: 'Valores Padrão por NCM' }
        ]}
      />

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold text-white">Valores Padrão por NCM</h1>
        <Button
          variant="accent"
          className="flex items-center gap-2 self-end md:self-auto"
          onClick={() => router.push('/produtos/valores-padrao/novo')}
        >
          <Plus size={16} />
          Novo Grupo
        </Button>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="relative md:col-span-2">
            <label className="block text-sm font-medium mb-2 text-gray-300">Filtrar por NCM ou modalidade</label>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 pl-3 pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              className="pl-10 pr-4 py-2 w-full bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
              value={filtro}
              onChange={event => setFiltro(event.target.value)}
              placeholder="Digite a NCM ou modalidade"
            />
          </div>
          <div className="text-sm text-gray-400">
            Exibindo {registrosFiltrados.length} de {registros.length} grupos
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="py-10 text-center text-gray-400">Carregando valores padrão...</div>
        ) : erroCarregamento ? (
          <div className="py-10 text-center text-gray-400">
            Não foi possível carregar os valores padrão. <br />
            <button className="text-blue-400 hover:underline" onClick={carregar}>
              Tentar novamente
            </button>
          </div>
        ) : registros.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            Nenhum valor padrão cadastrado.
          </div>
        ) : registrosFiltrados.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            Nenhum registro encontrado com os filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                <tr>
                  <th className="w-20 px-4 py-3 text-center">Ações</th>
                  <th className="px-4 py-3">NCM</th>
                  <th className="px-4 py-3">Modalidade</th>
                  <th className="px-4 py-3">Catálogos</th>
                  <th className="px-4 py-3">Criado em</th>
                  <th className="px-4 py-3">Atualizado em</th>
                </tr>
              </thead>
              <tbody>
                {registrosFiltrados.map(item => (
                  <tr key={item.id} className="border-b border-gray-700 hover:bg-[#1a1f2b] transition-colors">
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          className="p-1 text-gray-300 hover:text-blue-500 transition-colors"
                          onClick={() => router.push(`/produtos/valores-padrao/${item.id}`)}
                          title="Editar valores padrão"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                          onClick={() => setRegistroParaExcluir(item)}
                          title="Excluir valores padrão"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{formatarNCM(item.ncmCodigo)}</td>
                    <td className="px-4 py-3 text-gray-200">{item.modalidade ? item.modalidade : '-'}</td>
                    <td className="px-4 py-3 text-gray-200">
                      {item.catalogos?.length
                        ? item.catalogos.map(c => c.nome).join(', ')
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-200">{formatarData(item.criadoEm)}</td>
                    <td className="px-4 py-3 text-gray-200">{formatarData(item.atualizadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {registroParaExcluir && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Confirmar exclusão</h3>
            <p className="text-gray-300 mb-6">
              Deseja remover os valores padrão da NCM {formatarNCM(registroParaExcluir.ncmCodigo)}?
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRegistroParaExcluir(null)}>
                Cancelar
              </Button>
              <Button variant="accent" onClick={remover}>
                Remover
              </Button>
            </div>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
