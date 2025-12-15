// frontend/pages/ajuste-estrutura.tsx
import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/router';
import api from '@/lib/api';
import { DiferencasEstrutura } from '@/components/produtos/DiferencasEstrutura';
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/ToastContext';

interface Produto {
  id: number;
  codigo: string;
  denominacao: string;
}

interface ProdutosPorCatalogo {
  catalogoId: number;
  catalogoNome: string;
  catalogoNumero: number;
  produtos: Produto[];
}

interface NcmDivergente {
  ncmCodigo: string;
  modalidade: string;
  totalProdutos: number;
  produtosPorCatalogo: ProdutosPorCatalogo[];
}

export default function AjusteEstruturaPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [ncms, setNcms] = useState<NcmDivergente[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNcms, setExpandedNcms] = useState<Set<string>>(new Set());
  const [ajustandoCatalogo, setAjustandoCatalogo] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    fetchNcmsDivergentes();
  }, [isAuthenticated]);

  const fetchNcmsDivergentes = async () => {
    try {
      setLoading(true);
      const response = await api.get('/ajuste-estrutura/ncms-divergentes');
      setNcms(response.data.ncms || []);
    } catch (error) {
      console.error('Erro ao buscar NCMs divergentes:', error);
      showToast('Erro ao carregar NCMs divergentes', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleNcm = (chave: string) => {
    const newExpanded = new Set(expandedNcms);
    if (newExpanded.has(chave)) {
      newExpanded.delete(chave);
    } else {
      newExpanded.add(chave);
    }
    setExpandedNcms(newExpanded);
  };

  const handleAjustarCatalogo = async (
    ncmCodigo: string,
    modalidade: string,
    catalogoId: number,
    produtoIds: number[]
  ) => {
    const chave = `${ncmCodigo}-${modalidade}-${catalogoId}`;

    if (!confirm(`Deseja ajustar a estrutura de ${produtoIds.length} produto(s)?`)) {
      return;
    }

    try {
      setAjustandoCatalogo(prev => ({ ...prev, [chave]: true }));

      const response = await api.post('/ajuste-estrutura/lote', {
        produtoIds
      });

      const resultado = response.data;

      showToast(
        `${resultado.totalAjustados} produto(s) ajustado(s). ` +
        `${resultado.totalAprovados} aprovado(s), ${resultado.totalPendentes} pendente(s).`,
        'success'
      );

      // Atualizar lista
      await fetchNcmsDivergentes();
    } catch (error: any) {
      console.error('Erro ao ajustar catálogo:', error);
      showToast(
        error.response?.data?.error || 'Erro ao ajustar estrutura dos produtos',
        'error'
      );
    } finally {
      setAjustandoCatalogo(prev => ({ ...prev, [chave]: false }));
    }
  };

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <DashboardLayout title="Ajuste de Estrutura de Atributos">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">
            Ajuste de Estrutura de Atributos
          </h1>
          <p className="text-gray-400 text-sm">
            Gerencie produtos com estrutura de atributos divergente do SISCOMEX
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin mr-3">
              <RefreshCw size={24} className="text-gray-400" />
            </div>
            <span className="text-gray-400">Carregando...</span>
          </div>
        ) : ncms.length === 0 ? (
          <div className="bg-green-900/20 border border-green-700 rounded-lg p-8 text-center">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-400 mb-2">
              Tudo sincronizado!
            </h3>
            <p className="text-gray-400">
              Não há produtos que necessitam ajuste de estrutura no momento.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {ncms.map((ncm) => {
              const chave = `${ncm.ncmCodigo}-${ncm.modalidade}`;
              const expandido = expandedNcms.has(chave);

              return (
                <div key={chave} className="bg-[#1e2126] border border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleNcm(chave)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#262b36] transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="text-red-500">
                        <AlertTriangle size={20} />
                      </div>
                      <div className="text-left">
                        <div className="flex items-center space-x-3">
                          <span className="text-white font-semibold">
                            NCM {ncm.ncmCodigo}
                          </span>
                          <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-1 rounded">
                            {ncm.modalidade}
                          </span>
                        </div>
                        <div className="text-sm text-gray-400 mt-1">
                          {ncm.totalProdutos} produto(s) afetado(s)
                        </div>
                      </div>
                    </div>
                    <div className="text-gray-400">
                      {expandido ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                  </button>

                  {expandido && (
                    <div className="border-t border-gray-700 p-6">
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-gray-300 mb-3">
                          Diferenças detectadas:
                        </h3>
                        <DiferencasEstrutura
                          ncmCodigo={ncm.ncmCodigo}
                          modalidade={ncm.modalidade}
                        />
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-gray-300">
                          Produtos afetados:
                        </h3>

                        {ncm.produtosPorCatalogo.map((grupo) => {
                          const chaveGrupo = `${chave}-${grupo.catalogoId}`;
                          const ajustando = ajustandoCatalogo[chaveGrupo];

                          return (
                            <div
                              key={grupo.catalogoId}
                              className="bg-[#151921] border border-gray-700 rounded p-4"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <h4 className="font-semibold text-white">
                                    📦 {grupo.catalogoNome}
                                  </h4>
                                  <p className="text-xs text-gray-400 mt-1">
                                    Catálogo #{grupo.catalogoNumero}
                                  </p>
                                </div>
                                <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">
                                  {grupo.produtos.length} produto(s)
                                </span>
                              </div>

                              <ul className="text-sm text-gray-400 mb-3 space-y-1 max-h-40 overflow-y-auto">
                                {grupo.produtos.map((produto) => (
                                  <li key={produto.id}>
                                    • {produto.codigo} - {produto.denominacao}
                                  </li>
                                ))}
                              </ul>

                              <button
                                onClick={() =>
                                  handleAjustarCatalogo(
                                    ncm.ncmCodigo,
                                    ncm.modalidade,
                                    grupo.catalogoId,
                                    grupo.produtos.map(p => p.id)
                                  )
                                }
                                disabled={ajustando}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center"
                              >
                                {ajustando ? (
                                  <>
                                    <RefreshCw size={16} className="mr-2 animate-spin" />
                                    Ajustando...
                                  </>
                                ) : (
                                  <>
                                    Ajustar {grupo.produtos.length} produto(s)
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
