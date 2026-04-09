import React, { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import { Eye, Trash2, Download, Plus, Search } from 'lucide-react';
import api from '@/lib/api';
import { useRouter } from 'next/router';

type CompatibilidadeStatus =
  | 'NAO_VERIFICADO'
  | 'COMPATIVEL'
  | 'CORRIGIDO_AUTOMATICAMENTE';

interface Certificado {
  id: number;
  nome: string;
  compatibilidadeStatus: CompatibilidadeStatus;
  validadoEm?: string | null;
  detalheValidacao?: string | null;
}

interface CertificadoInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  serialNumber: string;
}

const statusConfig: Record<CompatibilidadeStatus, { label: string; className: string }> = {
  COMPATIVEL: {
    label: 'Compativel',
    className: 'bg-emerald-950/40 text-emerald-300 border border-emerald-700',
  },
  CORRIGIDO_AUTOMATICAMENTE: {
    label: 'Corrigido',
    className: 'bg-amber-950/40 text-amber-300 border border-amber-700',
  },
  NAO_VERIFICADO: {
    label: 'Nao verificado',
    className: 'bg-slate-800 text-slate-300 border border-slate-600',
  },
};

export default function CertificadosPage() {
  const [certificados, setCertificados] = useState<Certificado[]>([]);
  const [certificadoParaExcluir, setCertificadoParaExcluir] = useState<Certificado | null>(null);
  const [catalogosVinculados, setCatalogosVinculados] = useState<{ id: number; nome: string }[]>([]);
  const [visualizando, setVisualizando] = useState<{ cert: Certificado; info?: CertificadoInfo } | null>(null);
  const [filtro, setFiltro] = useState('');
  const { addToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      const res = await api.get('/certificados');
      setCertificados(res.data);
    } catch (error) {
      addToast('Erro ao carregar certificados', 'error');
    }
  }

  async function visualizarCertificado(cert: Certificado) {
    try {
      setVisualizando({ cert });
      const res = await api.get(`/certificados/${cert.id}/info`);
      setVisualizando({ cert, info: res.data });
    } catch (error) {
      addToast('Erro ao carregar informacoes do certificado', 'error');
      setVisualizando(null);
    }
  }

  async function confirmarRemocao(cert: Certificado) {
    try {
      const res = await api.get(`/certificados/${cert.id}/catalogos`);
      setCatalogosVinculados(res.data);
    } catch (error) {
      addToast('Erro ao carregar catalogos vinculados', 'error');
      setCatalogosVinculados([]);
    }

    setCertificadoParaExcluir(cert);
  }

  function cancelarRemocao() {
    setCertificadoParaExcluir(null);
    setCatalogosVinculados([]);
  }

  async function removerCertificado() {
    if (!certificadoParaExcluir) return;

    try {
      await api.delete(`/certificados/${certificadoParaExcluir.id}`);
      setCertificados(certificados.filter((c) => c.id !== certificadoParaExcluir.id));
      addToast('Certificado removido com sucesso', 'success');
    } catch (error) {
      addToast('Erro ao remover certificado', 'error');
    } finally {
      cancelarRemocao();
    }
  }

  async function baixarCertificado(cert: Certificado) {
    try {
      const response = await api.get(`/certificados/${cert.id}/download`, {
        responseType: 'blob',
      });

      const disposition = response.headers['content-disposition'] as string | undefined;
      let filename = cert.nome || 'certificado';

      if (disposition) {
        const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
        if (filenameMatch?.[1]) {
          filename = filenameMatch[1];
        }
      }

      if (!filename.toLowerCase().endsWith('.pfx')) {
        filename = `${filename}.pfx`;
      }

      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);

      addToast('Certificado baixado com sucesso', 'success');
    } catch (error) {
      addToast('Erro ao baixar certificado', 'error');
    }
  }

  const certificadosFiltrados = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    if (!termo) return certificados;
    return certificados.filter((c) => c.nome.toLowerCase().includes(termo));
  }, [filtro, certificados]);

  return (
    <DashboardLayout title="Certificados">
      <Breadcrumb items={[{ label: 'Inicio', href: '/' }, { label: 'Certificados' }]} />

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Lista de Certificados</h1>
        <Button
          variant="accent"
          className="flex items-center gap-2"
          onClick={() => router.push('/certificados/novo')}
        >
          <Plus size={16} />
          <span>Novo Certificado</span>
        </Button>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
          <div className="relative md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-300">Buscar por nome</label>
            <div className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 pl-3">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              className="w-full rounded-lg border border-gray-700 bg-[#1e2126] py-2 pl-10 pr-4 text-white focus:border-blue-500 focus:outline-none focus:ring"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              aria-label="Buscar por nome"
            />
          </div>
          <div className="text-sm text-gray-400">
            Exibindo {certificadosFiltrados.length} de {certificados.length} certificados
          </div>
        </div>
      </Card>

      <Card>
        {certificados.length === 0 ? (
          <div className="py-10 text-center">
            <p className="mb-4 text-gray-400">Nao ha certificados cadastrados.</p>
            <Button
              variant="primary"
              className="inline-flex items-center gap-2"
              onClick={() => router.push('/certificados/novo')}
            >
              <Plus size={16} />
              <span>Cadastrar Primeiro Certificado</span>
            </Button>
          </div>
        ) : certificadosFiltrados.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-gray-400">Nenhum certificado encontrado com os filtros aplicados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                <tr>
                  <th className="w-24 px-4 py-3 text-center">Acoes</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="w-52 px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {certificadosFiltrados.map((c) => {
                  const status = statusConfig[c.compatibilidadeStatus || 'NAO_VERIFICADO'];

                  return (
                    <tr key={c.id} className="border-b border-gray-700 transition-colors hover:bg-[#1a1f2b]">
                      <td className="flex gap-2 px-4 py-3">
                        <button
                          className="p-1 text-gray-300 transition-colors hover:text-blue-500"
                          onClick={() => visualizarCertificado(c)}
                          title="Visualizar dados do certificado"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="p-1 text-gray-300 transition-colors hover:text-green-500"
                          onClick={() => baixarCertificado(c)}
                          title="Baixar arquivo do certificado"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          className="p-1 text-gray-300 transition-colors hover:text-red-500"
                          onClick={() => confirmarRemocao(c)}
                          title="Excluir certificado"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-white">{c.nome}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {certificadoParaExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-gray-700 bg-[#151921] p-6">
            <h3 className="mb-4 text-xl font-semibold text-white">Confirmar Exclusao</h3>
            <p className="mb-4 text-gray-300">O certificado sera desvinculado dos seguintes catalogos:</p>
            <ul className="mb-6 max-h-40 list-inside list-disc overflow-y-auto text-gray-300">
              {catalogosVinculados.length > 0 ? (
                catalogosVinculados.map((cat) => <li key={cat.id}>{cat.nome}</li>)
              ) : (
                <li>Nenhum catalogo vinculado</li>
              )}
            </ul>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={cancelarRemocao}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={removerCertificado}>
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}

      {visualizando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg border border-gray-700 bg-[#151921] p-6 text-gray-300">
            <h3 className="mb-4 text-xl font-semibold text-white">Dados do Certificado - {visualizando.cert.nome}</h3>
            {!visualizando.info ? (
              <p className="text-gray-400">Carregando informacoes...</p>
            ) : (
              <div className="space-y-2">
                <div>
                  <span className="text-gray-400">Status: </span>
                  <span className="text-gray-100">
                    {statusConfig[visualizando.cert.compatibilidadeStatus || 'NAO_VERIFICADO'].label}
                  </span>
                </div>
                {visualizando.cert.detalheValidacao && (
                  <div>
                    <span className="text-gray-400">Detalhe: </span>
                    <span className="break-all text-gray-100">{visualizando.cert.detalheValidacao}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-400">Subject: </span>
                  <span className="break-all text-gray-100">{visualizando.info.subject}</span>
                </div>
                <div>
                  <span className="text-gray-400">Issuer: </span>
                  <span className="break-all text-gray-100">{visualizando.info.issuer}</span>
                </div>
                <div>
                  <span className="text-gray-400">Valido de: </span>
                  <span className="text-gray-100">{visualizando.info.validFrom}</span>
                </div>
                <div>
                  <span className="text-gray-400">Valido ate: </span>
                  <span className="text-gray-100">{visualizando.info.validTo}</span>
                </div>
                <div>
                  <span className="text-gray-400">Numero de serie: </span>
                  <span className="break-all text-gray-100">{visualizando.info.serialNumber}</span>
                </div>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setVisualizando(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
