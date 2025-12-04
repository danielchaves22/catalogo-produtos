// frontend/pages/automacao/transmissoes-siscomex/index.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Eye, FileDown, Loader2, PlayCircle } from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import api from '@/lib/api';
import { useToast } from '@/components/ui/ToastContext';

interface CatalogoResumo {
  nome: string;
  numero: number | null;
}

type TransmissaoStatus = 'EM_FILA' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHO' | 'PARCIAL';

type ModalidadeTransmissao = 'PRODUTOS' | 'OPERADORES_ESTRANGEIROS';

interface TransmissaoListagem {
  id: number;
  modalidade: ModalidadeTransmissao;
  catalogo: CatalogoResumo;
  totalItens: number;
  totalSucesso: number;
  totalErro: number;
  status: TransmissaoStatus;
  iniciadoEm?: string | null;
  concluidoEm?: string | null;
  payloadEnvioUrl?: string | null;
  payloadRetornoUrl?: string | null;
}

function formatarData(dataIso?: string | null) {
  if (!dataIso) return '-';
  const data = new Date(dataIso);
  return data.toLocaleString('pt-BR');
}

function obterEtiquetaStatus(status: TransmissaoStatus) {
  switch (status) {
    case 'CONCLUIDO':
      return 'Concluído';
    case 'FALHO':
      return 'Erro';
    case 'PARCIAL':
      return 'Parcial';
    case 'PROCESSANDO':
      return 'Processando';
    default:
      return 'Em fila';
  }
}

function obterClasseStatus(status: TransmissaoStatus) {
  switch (status) {
    case 'CONCLUIDO':
      return 'text-emerald-400 bg-emerald-400/10 border border-emerald-500/40';
    case 'FALHO':
      return 'text-red-400 bg-red-400/10 border border-red-500/40';
    case 'PARCIAL':
      return 'text-amber-300 bg-amber-400/10 border border-amber-500/40';
    case 'PROCESSANDO':
      return 'text-blue-300 bg-blue-400/10 border border-blue-500/40';
    default:
      return 'text-amber-400 bg-amber-400/10 border border-amber-500/40';
  }
}

export default function TransmissoesSiscomexPage() {
  const [transmissoes, setTransmissoes] = useState<TransmissaoListagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const { addToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    async function carregarTransmissoes() {
      try {
        const resposta = await api.get<{ itens: TransmissaoListagem[] }>('/siscomex/transmissoes');
        setTransmissoes(resposta.data?.itens ?? []);
      } catch (error) {
        console.error('Erro ao carregar transmissões SISCOMEX:', error);
        addToast('Não foi possível carregar as transmissões.', 'error');
      } finally {
        setCarregando(false);
      }
    }

    carregarTransmissoes();
  }, [addToast]);

  const baixarArquivo = async (transmissaoId: number, tipo: 'envio' | 'retorno', url?: string | null) => {
    try {
      if (url) {
        window.open(url, '_blank');
        return;
      }

      const resposta = await api.get(`/siscomex/transmissoes/${transmissaoId}/arquivos/${tipo}`, {
        responseType: 'blob',
      });

      const contentType = resposta.headers['content-type'] as string | undefined;
      if (contentType?.includes('application/json')) {
        const texto = await (resposta.data as Blob).text();
        try {
          const json = JSON.parse(texto);
          if (json.url) {
            window.open(json.url, '_blank');
            return;
          }
        } catch (_) {}
      }

      const blobUrl = URL.createObjectURL(resposta.data as Blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `payload-${tipo}-${transmissaoId}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Erro ao baixar payload da transmissão:', error);
      addToast('Não foi possível baixar o payload solicitado.', 'error');
    }
  };

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
                    <th className="w-24 px-4 py-3 text-center">Ações</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Modalidade</th>
                    <th className="px-4 py-3">Catálogo</th>
                    <th className="px-4 py-3">Totais</th>
                    <th className="px-4 py-3">Iniciada em</th>
                    <th className="px-4 py-3">Concluída em</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transmissoes.map(transmissao => (
                    <tr key={transmissao.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                      <td className="px-4 py-3 text-center flex items-center gap-2 justify-center">
                        <button
                          className="p-2 rounded bg-slate-800 text-gray-200 hover:text-white hover:bg-slate-700"
                          title="Visualizar detalhes"
                          onClick={() => router.push(`/automacao/transmissoes-siscomex/${transmissao.id}`)}
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          className="p-2 rounded bg-slate-800 text-gray-200 hover:text-white hover:bg-slate-700"
                          title="Baixar payload de envio"
                          disabled={transmissao.status === 'EM_FILA' || transmissao.status === 'PROCESSANDO'}
                          onClick={() => baixarArquivo(transmissao.id, 'envio', transmissao.payloadEnvioUrl)}
                        >
                          <FileDown size={18} />
                        </button>
                        <button
                          className="p-2 rounded bg-slate-800 text-gray-200 hover:text-white hover:bg-slate-700"
                          title="Baixar retorno"
                          disabled={!transmissao.payloadRetornoUrl}
                          onClick={() => baixarArquivo(transmissao.id, 'retorno', transmissao.payloadRetornoUrl)}
                        >
                          <Loader2 size={18} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-200">Transmissão #{transmissao.id}</td>
                      <td className="px-4 py-3 text-gray-200">
                        {transmissao.modalidade === 'PRODUTOS' ? 'Produtos' : 'Operadores Estrangeiros'}
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        <span className="font-medium">{transmissao.catalogo.nome}</span>
                        <span className="text-gray-400 block text-xs">
                          Catálogo Nº {transmissao.catalogo.numero ?? '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        {transmissao.totalSucesso}/{transmissao.totalItens} concluídos
                        {transmissao.totalErro > 0 && (
                          <span className="text-red-400 ml-1">({transmissao.totalErro} com erro)</span>
                        )}
                      </td>
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
