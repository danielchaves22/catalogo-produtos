import React, { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ListFilter } from 'lucide-react';
import { useProtectedRoute } from '@/hooks/useProtectedRoute';

interface ProdutoAjuste {
  id: number;
  denominacao: string;
  ncmCodigo: string;
  catalogoId: number;
  catalogoNome?: string | null;
}

interface ListaProdutosResponse {
  items: Array<{
    id: number;
    denominacao: string;
    ncmCodigo: string;
    catalogoId: number;
    catalogoNome?: string | null;
  }>;
  total: number;
}

export default function AjustesEstruturaPage() {
  useProtectedRoute();
  const { addToast } = useToast();
  const [carregando, setCarregando] = useState(true);
  const [pendencias, setPendencias] = useState<ProdutoAjuste[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const carregar = async () => {
      try {
        const resposta = await api.get<ListaProdutosResponse>(
          '/produtos',
          { params: { status: 'AJUSTAR_ESTRUTURA', pageSize: 200 } }
        );
        setPendencias(resposta.data.items.map(item => ({
          id: item.id,
          denominacao: item.denominacao,
          ncmCodigo: item.ncmCodigo,
          catalogoId: item.catalogoId,
          catalogoNome: item.catalogoNome,
        })));
        setTotal(resposta.data.total);
      } catch (error) {
        console.error('Erro ao buscar pendências de ajuste', error);
        addToast('Não foi possível carregar os ajustes pendentes.', 'error');
      } finally {
        setCarregando(false);
      }
    };

    carregar();
  }, [addToast]);

  const agrupados = useMemo(() => {
    const mapa = new Map<string, ProdutoAjuste[]>();
    pendencias.forEach(item => {
      const chave = item.ncmCodigo;
      const lista = mapa.get(chave) ?? [];
      lista.push(item);
      mapa.set(chave, lista);
    });
    return Array.from(mapa.entries());
  }, [pendencias]);

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
          {agrupados.map(([ncm, itens]) => (
            <Card key={ncm} className="p-4 border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-slate-100">
                  <ListFilter className="h-4 w-4" />
                  <span className="font-semibold">NCM {ncm}</span>
                </div>
                <span className="text-sm text-slate-400">{itens.length} produto(s)</span>
              </div>

              <div className="divide-y divide-slate-800">
                {itens.map(item => (
                  <div key={item.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-slate-100 font-medium">{item.denominacao}</p>
                      <p className="text-slate-400 text-sm">
                        Catálogo #{item.catalogoId} {item.catalogoNome ? `• ${item.catalogoNome}` : ''}
                      </p>
                    </div>
                    <Link
                      href={`/produtos/${item.id}`}
                      className="text-sky-400 hover:text-sky-300 text-sm"
                    >
                      Abrir produto
                    </Link>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
