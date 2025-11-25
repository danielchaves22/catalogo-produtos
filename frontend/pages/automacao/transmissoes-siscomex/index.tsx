// frontend/pages/automacao/transmissoes-siscomex/index.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Eye, FileDown, PlayCircle } from 'lucide-react';
import { transmissoesSiscomexMock, TransmissaoSiscomex } from '@/constants/transmissoesSiscomexMocks';
import { PageLoader } from '@/components/ui/PageLoader';

function formatarData(dataIso?: string) {
  if (!dataIso) return '-';
  const data = new Date(dataIso);
  return data.toLocaleString('pt-BR');
}

function obterEtiquetaStatus(status: TransmissaoSiscomex['status']) {
  switch (status) {
    case 'CONCLUIDO':
      return 'Concluído';
    case 'ERRO':
      return 'Erro';
    default:
      return 'Em andamento';
  }
}

function obterClasseStatus(status: TransmissaoSiscomex['status']) {
  switch (status) {
    case 'CONCLUIDO':
      return 'text-emerald-400 bg-emerald-400/10 border border-emerald-500/40';
    case 'ERRO':
      return 'text-red-400 bg-red-400/10 border border-red-500/40';
    default:
      return 'text-amber-400 bg-amber-400/10 border border-amber-500/40';
  }
}

export default function TransmissoesSiscomexPage() {
  const [transmissoes, setTransmissoes] = useState<TransmissaoSiscomex[]>([]);
  const [carregando, setCarregando] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Nesta fase inicial utilizamos dados mockados apenas para estruturar a tela.
    setTransmissoes(transmissoesSiscomexMock);
    setCarregando(false);
  }, []);

  return (
    <DashboardLayout title="Transmissões ao SISCOMEX">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao' },
          { label: 'Transmissões ao SISCOMEX' },
        ]}
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Transmissões ao SISCOMEX</h1>
          <p className="text-gray-400 text-sm">Acompanhe as transmissões de produtos e operadores estrangeiros.</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="accent"
            className="flex items-center gap-2"
            onClick={() => router.push('/automacao/transmissoes-siscomex/produtos')}
          >
            <PlayCircle size={18} />
            Nova transmissão de Produtos
          </Button>
          <Button
            variant="primary"
            className="flex items-center gap-2"
            onClick={() => router.push('/automacao/transmissoes-siscomex/operadores')}
          >
            <PlayCircle size={18} />
            Nova transmissão de Operadores
          </Button>
        </div>
      </div>

      {carregando ? (
        <PageLoader message="Carregando transmissões..." />
      ) : (
        <Card>
          {transmissoes.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
              <FileDown className="mx-auto mb-3" size={32} />
              Nenhuma transmissão registrada até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                  <tr>
                    <th className="w-16 px-4 py-3 text-center">Ações</th>
                    <th className="px-4 py-3">Título</th>
                    <th className="px-4 py-3">Modalidade</th>
                    <th className="px-4 py-3">Catálogo</th>
                    <th className="px-4 py-3">Quantidade</th>
                    <th className="px-4 py-3">Iniciada em</th>
                    <th className="px-4 py-3">Concluída em</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transmissoes.map(transmissao => (
                    <tr key={transmissao.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                      <td className="px-4 py-3 text-center">
                        <button
                          className="p-2 rounded bg-slate-800 text-gray-200 hover:text-white hover:bg-slate-700"
                          title="Visualizar detalhes"
                          onClick={() => router.push(`/automacao/transmissoes-siscomex/${transmissao.id}`)}
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-200">{transmissao.titulo}</td>
                      <td className="px-4 py-3 text-gray-200">
                        {transmissao.modalidade === 'PRODUTOS' ? 'Produtos' : 'Operadores Estrangeiros'}
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        <span className="font-medium">{transmissao.catalogo.nome}</span>
                        <span className="text-gray-400 block text-xs">Catálogo Nº {transmissao.catalogo.numero}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-200">{transmissao.quantidadeTotal}</td>
                      <td className="px-4 py-3 text-gray-200">{formatarData(transmissao.iniciadoEm)}</td>
                      <td className="px-4 py-3 text-gray-200">{formatarData(transmissao.concluidoEm)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${obterClasseStatus(transmissao.status)}`}>
                          {obterEtiquetaStatus(transmissao.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </DashboardLayout>
  );
}
