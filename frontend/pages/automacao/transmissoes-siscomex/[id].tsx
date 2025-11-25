// frontend/pages/automacao/transmissoes-siscomex/[id].tsx
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/PageLoader';
import { Button } from '@/components/ui/Button';
import { Eye } from 'lucide-react';
import { transmissoesSiscomexMock, TransmissaoSiscomex } from '@/constants/transmissoesSiscomexMocks';

function obterClasseItem(status: TransmissaoSiscomex['itens'][number]['status']) {
  switch (status) {
    case 'TRANSMITIDO':
      return 'text-emerald-400 bg-emerald-400/10 border border-emerald-500/40';
    case 'ERRO':
      return 'text-red-400 bg-red-400/10 border border-red-500/40';
    case 'PROCESSANDO':
      return 'text-amber-400 bg-amber-400/10 border border-amber-500/40';
    default:
      return 'text-gray-300 bg-slate-700/40 border border-slate-600/60';
  }
}

export default function DetalheTransmissaoSiscomexPage() {
  const router = useRouter();
  const { id } = router.query;
  const [transmissao, setTransmissao] = useState<TransmissaoSiscomex | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!id) return;
    const identificador = Array.isArray(id) ? Number(id[0]) : Number(id);
    const encontrada = transmissoesSiscomexMock.find(item => item.id === identificador) || null;
    setTransmissao(encontrada);
    setCarregando(false);
  }, [id]);

  const resumo = useMemo(() => {
    if (!transmissao) return { sucesso: 0, erros: 0, processando: 0, total: 0 };
    return transmissao.itens.reduce(
      (acc, item) => {
        if (item.status === 'TRANSMITIDO') acc.sucesso += 1;
        else if (item.status === 'ERRO') acc.erros += 1;
        else if (item.status === 'PROCESSANDO') acc.processando += 1;
        acc.total += 1;
        return acc;
      },
      { sucesso: 0, erros: 0, processando: 0, total: 0 }
    );
  }, [transmissao]);

  if (carregando) {
    return (
      <DashboardLayout title="Detalhes da transmissão">
        <PageLoader message="Carregando detalhes da transmissão..." />
      </DashboardLayout>
    );
  }

  if (!transmissao) {
    return (
      <DashboardLayout title="Transmissão não encontrada">
        <Card className="p-6 text-gray-300">Nenhuma transmissão localizada para o identificador informado.</Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={`Transmissão #${transmissao.id}`}>
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao' },
          { label: 'Transmissões ao SISCOMEX', href: '/automacao/transmissoes-siscomex' },
          { label: transmissao.titulo },
        ]}
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">{transmissao.titulo}</h1>
          <p className="text-gray-400 text-sm">
            {transmissao.modalidade === 'PRODUTOS'
              ? 'Envio de produtos aprovados ao SISCOMEX.'
              : 'Envio de operadores estrangeiros aprovados ao SISCOMEX.'}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/automacao/transmissoes-siscomex')}>
          Voltar para transmissões
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="text-sm text-gray-400">Itens totais</div>
          <div className="text-2xl font-semibold text-white">{resumo.total}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400">Transmitidos</div>
          <div className="text-2xl font-semibold text-emerald-400">{resumo.sucesso}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400">Processando</div>
          <div className="text-2xl font-semibold text-amber-400">{resumo.processando}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400">Com erro</div>
          <div className="text-2xl font-semibold text-red-400">{resumo.erros}</div>
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
              <tr>
                <th className="w-16 px-4 py-3 text-center">#</th>
                <th className="px-4 py-3">Referência</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {transmissao.itens.map(item => (
                <tr key={item.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-center text-gray-200">{item.id}</td>
                  <td className="px-4 py-3 text-gray-200 flex items-center gap-2">
                    <Eye size={14} className="text-gray-400" />
                    {item.referencia}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${obterClasseItem(item.status)}`}>
                      {item.status === 'TRANSMITIDO'
                        ? 'Transmitido'
                        : item.status === 'ERRO'
                        ? 'Erro'
                        : item.status === 'PROCESSANDO'
                        ? 'Processando'
                        : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-200">
                    {item.mensagem || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </DashboardLayout>
  );
}
