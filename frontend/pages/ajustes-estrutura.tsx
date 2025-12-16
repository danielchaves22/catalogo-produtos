import React, { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ListFilter } from 'lucide-react';
import { useProtectedRoute } from '@/hooks/useProtectedRoute';

interface DiferencaAtributo {
  codigo: string;
  tipo: 'ADICIONADO' | 'REMOVIDO' | 'MODIFICADO';
  campo?: string;
  valorAtual?: unknown;
  valorLegado?: unknown;
  caminho?: string[];
}

interface GrupoCatalogo {
  catalogoId: number;
  catalogoNome: string | null;
  produtos: Array<{ id: number; denominacao: string }>;
}

interface PendenciaAjuste {
  ncmCodigo: string;
  modalidade: string;
  diferencas?: DiferencaAtributo[];
  catalogos: GrupoCatalogo[];
}

interface PendenciasResponse {
  itens: PendenciaAjuste[];
  totalProdutos: number;
}

export default function AjustesEstruturaPage() {
  useProtectedRoute();
  const { addToast } = useToast();
  const [carregando, setCarregando] = useState(true);
  const [pendencias, setPendencias] = useState<PendenciaAjuste[]>([]);
  const [total, setTotal] = useState(0);
  const [painelAberto, setPainelAberto] = useState<Record<string, boolean>>({});
  const [ajustando, setAjustando] = useState<number | null>(null);

  useEffect(() => {
    const carregar = async () => {
      try {
        const resposta = await api.get<PendenciasResponse>(
          '/produtos/pendencias/ajuste-estrutura/detalhes'
        );
        setPendencias(resposta.data.itens);
        setTotal(resposta.data.totalProdutos);
      } catch (error) {
        console.error('Erro ao buscar pendências de ajuste', error);
        addToast('Não foi possível carregar os ajustes pendentes.', 'error');
      } finally {
        setCarregando(false);
      }
    };

    carregar();
  }, [addToast]);

  const togglePainel = (chave: string) => {
    setPainelAberto((anterior) => ({
      ...anterior,
      [chave]: !anterior[chave],
    }));
  };

  const ajustarCatalogo = async (ncmCodigo: string, modalidade: string, catalogoId: number) => {
    try {
      setAjustando(catalogoId);
      await api.post('/produtos/ajuste-estrutura/ajustar-catalogo', {
        ncmCodigo,
        modalidade,
        catalogoId,
      });
      addToast('Estrutura ajustada com sucesso para o catálogo.', 'success');

      const resposta = await api.get<PendenciasResponse>(
        '/produtos/pendencias/ajuste-estrutura/detalhes'
      );
      setPendencias(resposta.data.itens);
      setTotal(resposta.data.totalProdutos);
    } catch (error) {
      console.error('Erro ao ajustar estrutura por catálogo', error);
      addToast('Não foi possível ajustar as estruturas deste catálogo.', 'error');
    } finally {
      setAjustando(null);
    }
  };

  const pendenciasOrdenadas = useMemo(() => (
    pendencias.map(item => ({
      ...item,
      catalogos: [...item.catalogos].sort((a, b) => a.catalogoId - b.catalogoId),
    }))
  ), [pendencias]);

  if (carregando) {
    return (
      <DashboardLayout title="Ajuste de Estrutura">
        <PageLoader message="Carregando pendências" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Ajuste de Estrutura">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Ajuste de Estrutura', href: '/ajustes-estrutura' },
        ]}
      />

      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-slate-400 text-sm">Pendências</p>
          <h1 className="text-2xl font-semibold text-slate-100">Ajuste de Estrutura</h1>
          <p className="text-slate-400 text-sm mt-1">
            Produtos marcados como "AJUSTAR ESTRUTURA" aguardando revisão.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-200">
          {total > 0 ? (
            <span className="inline-flex items-center gap-2 bg-rose-500/10 text-rose-200 px-3 py-1 rounded-full border border-rose-700/50">
              <AlertTriangle className="h-4 w-4" /> {total} pendente(s)
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-200 px-3 py-1 rounded-full border border-emerald-700/50">
              <CheckCircle2 className="h-4 w-4" /> Nenhuma pendência
            </span>
          )}
        </div>
      </div>

      {total === 0 ? (
        <Card className="p-6 text-center text-slate-300">
          Não há produtos aguardando ajuste de estrutura.
        </Card>
      ) : (
        <div className="space-y-4">
          {pendenciasOrdenadas.map((grupo) => {
            const chave = `${grupo.ncmCodigo}-${grupo.modalidade}`;
            const aberto = painelAberto[chave] ?? true;

            return (
              <Card key={chave} className="p-4 border border-slate-800">
                <button
                  className="w-full flex items-center justify-between"
                  onClick={() => togglePainel(chave)}
                  aria-expanded={aberto}
                >
                  <div className="flex items-center gap-3 text-slate-100">
                    {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div className="flex items-center gap-2">
                      <ListFilter className="h-4 w-4" />
                      <span className="font-semibold">NCM {grupo.ncmCodigo}</span>
                      <span className="text-xs text-slate-400">{grupo.modalidade}</span>
                    </div>
                  </div>
                  <span className="text-sm text-slate-400">{grupo.catalogos.reduce((acc, item) => acc + item.produtos.length, 0)} produto(s)</span>
                </button>

                {aberto && (
                  <div className="mt-4 space-y-4">
                    <div className="bg-slate-900 border border-slate-800 rounded p-3">
                      <p className="text-sm text-slate-300 font-semibold mb-2">Diferenças na estrutura</p>
                      {grupo.diferencas && grupo.diferencas.length > 0 ? (
                        <ul className="space-y-2 text-sm text-slate-200">
                          {grupo.diferencas.map((dif, idx) => (
                            <li key={`${dif.codigo}-${idx}`} className="bg-slate-800/60 rounded px-3 py-2">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{dif.codigo}</span>
                                <span className="text-xs uppercase tracking-wide text-amber-300">{dif.tipo}</span>
                              </div>
                              {dif.campo && (
                                <p className="text-xs text-slate-400">Campo: {dif.campo}</p>
                              )}
                              {dif.caminho && dif.caminho.length > 0 && (
                                <p className="text-xs text-slate-400">Caminho: {dif.caminho.join(' > ')}</p>
                              )}
                              {(dif.valorAtual !== undefined || dif.valorLegado !== undefined) && (
                                <p className="text-xs text-slate-400 mt-1">
                                  Atual: <span className="text-slate-200">{JSON.stringify(dif.valorAtual)}</span> | Anterior: <span className="text-slate-200">{JSON.stringify(dif.valorLegado)}</span>
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-400">Nenhuma diferença registrada para esta NCM.</p>
                      )}
                    </div>

                    <div className="space-y-3">
                      {grupo.catalogos.map((catalogo) => (
                        <div key={catalogo.catalogoId} className="border border-slate-800 rounded">
                          <div className="flex items-center justify-between bg-slate-900 px-4 py-2 border-b border-slate-800">
                            <div>
                              <p className="text-slate-100 font-semibold">Catálogo #{catalogo.catalogoId}</p>
                              <p className="text-slate-400 text-xs">{catalogo.catalogoNome || 'Sem descrição'}</p>
                            </div>
                            <button
                              className="text-sm bg-amber-500 hover:bg-amber-600 text-black font-semibold px-3 py-1 rounded disabled:opacity-60 disabled:cursor-not-allowed"
                              onClick={() => ajustarCatalogo(grupo.ncmCodigo, grupo.modalidade, catalogo.catalogoId)}
                              disabled={ajustando === catalogo.catalogoId}
                            >
                              {ajustando === catalogo.catalogoId ? 'Ajustando...' : 'Ajustar'}
                            </button>
                          </div>
                          <div className="divide-y divide-slate-800">
                            {catalogo.produtos.map((produto) => (
                              <div key={produto.id} className="px-4 py-3 flex items-center justify-between">
                                <div>
                                  <p className="text-slate-100 font-medium">{produto.denominacao}</p>
                                  <p className="text-slate-400 text-xs">ID {produto.id}</p>
                                </div>
                                <Link
                                  href={`/produtos/${produto.id}`}
                                  className="text-sky-400 hover:text-sky-300 text-sm"
                                >
                                  Abrir produto
                                </Link>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
