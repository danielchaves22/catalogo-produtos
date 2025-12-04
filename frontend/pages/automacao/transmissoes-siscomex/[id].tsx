// frontend/pages/automacao/transmissoes-siscomex/[id].tsx
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/PageLoader';
import { AlertCircle, ArrowLeft, Download } from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/ToastContext';
import { Button } from '@/components/ui/Button';

interface CatalogoResumo {
  nome: string;
  numero: number | null;
}

type TransmissaoStatus = 'EM_FILA' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHO' | 'PARCIAL';

type TransmissaoItemStatus = 'PENDENTE' | 'PROCESSANDO' | 'SUCESSO' | 'ERRO';

interface TransmissaoItem {
  id: number;
  produtoId: number;
  status: TransmissaoItemStatus;
  mensagem?: string | null;
  retornoCodigo?: string | null;
  produto?: {
    id: number;
    codigo?: string | null;
    denominacao?: string | null;
  } | null;
}

interface TransmissaoDetalhe {
  id: number;
  catalogo: CatalogoResumo;
  modalidade: 'PRODUTOS' | 'OPERADORES_ESTRANGEIROS';
  status: TransmissaoStatus;
  totalItens: number;
  totalSucesso: number;
  totalErro: number;
  iniciadoEm?: string | null;
  concluidoEm?: string | null;
  payloadEnvioUrl?: string | null;
  payloadRetornoUrl?: string | null;
  itens: TransmissaoItem[];
}

function obterClasseItem(status: TransmissaoItemStatus) {
  switch (status) {
    case 'SUCESSO':
      return 'text-emerald-400 bg-emerald-400/10 border border-emerald-500/40';
    case 'ERRO':
      return 'text-red-400 bg-red-400/10 border border-red-500/40';
    case 'PROCESSANDO':
      return 'text-amber-400 bg-amber-400/10 border border-amber-500/40';
    default:
      return 'text-gray-300 bg-slate-700/40 border border-slate-600/60';
  }
}

function formatarData(dataIso?: string | null) {
  if (!dataIso) return '-';
  return new Date(dataIso).toLocaleString('pt-BR');
}

export default function DetalheTransmissaoSiscomexPage() {
  const router = useRouter();
  const { id } = router.query;
  const { addToast } = useToast();
  const [transmissao, setTransmissao] = useState<TransmissaoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!id) return;
    const identificador = Array.isArray(id) ? Number(id[0]) : Number(id);

    async function carregarDetalhe() {
      try {
        const resposta = await api.get<TransmissaoDetalhe>(`/siscomex/transmissoes/${identificador}`);
        setTransmissao(resposta.data);
      } catch (error) {
        console.error('Erro ao carregar detalhes da transmissão:', error);
        addToast('Não foi possível carregar os detalhes da transmissão.', 'error');
      } finally {
        setCarregando(false);
      }
    }

    carregarDetalhe();
  }, [id, addToast]);

  const resumo = useMemo(() => {
    if (!transmissao) return { sucesso: 0, erros: 0, processando: 0, total: 0 };
    return transmissao.itens.reduce(
      (acc, item) => {
        if (item.status === 'SUCESSO') acc.sucesso += 1;
        else if (item.status === 'ERRO') acc.erros += 1;
        else if (item.status === 'PROCESSANDO') acc.processando += 1;
        acc.total += 1;
        return acc;
      },
      { sucesso: 0, erros: 0, processando: 0, total: 0 }
    );
  }, [transmissao]);

  const baixarArquivo = async (tipo: 'envio' | 'retorno', url?: string | null) => {
    if (!transmissao) return;
    try {
      if (url) {
        window.open(url, '_blank');
        return;
      }

      const download = await api.get(`/siscomex/transmissoes/${transmissao.id}/arquivos/${tipo}`, {
        responseType: 'blob',
      });

      const contentType = download.headers['content-type'] as string | undefined;
      if (contentType?.includes('application/json')) {
        const texto = await (download.data as Blob).text();
        try {
          const json = JSON.parse(texto);
          if (json.url) {
            window.open(json.url, '_blank');
            return;
          }
        } catch (_) {}
      }

      const blobUrl = URL.createObjectURL(download.data as Blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `payload-${tipo}-${transmissao.id}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Erro ao baixar payload da transmissão:', error);
      addToast('Não foi possível baixar o payload solicitado.', 'error');
    }
  };

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
          { label: `Transmissão #${transmissao.id}` },
        ]}
      />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/automacao/transmissoes-siscomex')}
            className="text-gray-400 transition-colors hover:text-white"
            aria-label="Voltar para a listagem de transmissões"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-white">Transmissão #{transmissao.id}</h1>
            <p className="text-gray-400 text-sm">
              {transmissao.modalidade === 'PRODUTOS'
                ? 'Envio de produtos aprovados ao SISCOMEX.'
                : 'Envio de operadores estrangeiros aprovados ao SISCOMEX.'}
            </p>
            <p className="text-gray-500 text-xs">Iniciada em: {formatarData(transmissao.iniciadoEm)}</p>
            <p className="text-gray-500 text-xs">Concluída em: {formatarData(transmissao.concluidoEm)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex items-center gap-2"
            disabled={transmissao.status === 'EM_FILA' || transmissao.status === 'PROCESSANDO'}
            onClick={() => baixarArquivo('envio', transmissao.payloadEnvioUrl)}
          >
            <Download size={16} />
            Payload de envio
          </Button>
          <Button
            variant="accent"
            className="flex items-center gap-2"
            disabled={!transmissao.payloadRetornoUrl}
            onClick={() => baixarArquivo('retorno', transmissao.payloadRetornoUrl)}
          >
            <Download size={16} />
            Retorno
          </Button>
        </div>
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
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {transmissao.itens.map(item => (
                <tr key={item.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-center text-gray-200">{item.id}</td>
                  <td className="px-4 py-3 text-gray-200">
                    <div className="font-semibold">{item.produto?.denominacao ?? 'Produto sem descrição'}</div>
                    <div className="text-xs text-gray-400">ID interno: {item.produtoId}</div>
                    {item.retornoCodigo && (
                      <div className="text-xs text-gray-400">Código SISCOMEX: {item.retornoCodigo}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${obterClasseItem(item.status)}`}>
                      {item.status === 'SUCESSO'
                        ? 'Transmitido'
                        : item.status === 'ERRO'
                        ? 'Erro'
                        : item.status === 'PROCESSANDO'
                        ? 'Processando'
                        : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-200 flex items-start gap-2">
                    {item.mensagem ? <AlertCircle size={14} className="mt-0.5 text-red-400" /> : null}
                    <span>{item.mensagem || '—'}</span>
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
