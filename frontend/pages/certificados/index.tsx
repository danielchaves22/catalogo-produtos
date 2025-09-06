import React, { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import { Eye, Trash2, Download, Plus, Search } from 'lucide-react';
import api from '@/lib/api';
import { useRouter } from 'next/router';

interface Certificado {
  id: number;
  nome: string;
}

interface CertificadoInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  serialNumber: string;
}

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
      addToast('Erro ao carregar informações do certificado', 'error');
      setVisualizando(null);
    }
  }

  async function confirmarRemocao(cert: Certificado) {
    try {
      const res = await api.get(`/certificados/${cert.id}/catalogos`);
      setCatalogosVinculados(res.data);
    } catch (error) {
      addToast('Erro ao carregar catálogos vinculados', 'error');
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
      setCertificados(certificados.filter(c => c.id !== certificadoParaExcluir.id));
      addToast('Certificado removido com sucesso', 'success');
    } catch (error) {
      addToast('Erro ao remover certificado', 'error');
    } finally {
      cancelarRemocao();
    }
  }

  function baixarCertificado(cert: Certificado) {
    const url = `${api.defaults.baseURL}/certificados/${cert.id}/download`;
    window.open(url, '_blank');
  }

  const certificadosFiltrados = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    if (!termo) return certificados;
    return certificados.filter(c => c.nome.toLowerCase().includes(termo));
  }, [filtro, certificados]);

  return (
    <DashboardLayout title="Certificados">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Certificados' }
        ]}
      />

      <div className="mb-6 flex justify-between items-center">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="relative md:col-span-2">
            <label className="block text-sm font-medium mb-2 text-gray-300">Buscar por nome</label>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 pl-3 pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              className="pl-10 pr-4 py-2 w-full bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              aria-label="Buscar por nome"
            />
          </div>
          <div className="text-sm text-gray-400">Exibindo {certificadosFiltrados.length} de {certificados.length} certificados</div>
        </div>
      </Card>

      <Card>
        {certificados.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-400 mb-4">Não há certificados cadastrados.</p>
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
          <div className="text-center py-10">
            <p className="text-gray-400">Nenhum certificado encontrado com os filtros aplicados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                <tr>
                  <th className="w-20 px-4 py-3 text-center">Ações</th>
                  <th className="px-4 py-3">Nome</th>
                </tr>
              </thead>
              <tbody>
                {certificadosFiltrados.map((c) => (
                  <tr key={c.id} className="border-b border-gray-700 hover:bg-[#1a1f2b] transition-colors">
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        className="p-1 text-gray-300 hover:text-blue-500 transition-colors"
                        onClick={() => visualizarCertificado(c)}
                        title="Visualizar dados do certificado"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        className="p-1 text-gray-300 hover:text-green-500 transition-colors"
                        onClick={() => baixarCertificado(c)}
                        title="Baixar arquivo do certificado"
                      >
                        <Download size={16} />
                      </button>
                      <button
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                        onClick={() => confirmarRemocao(c)}
                        title="Excluir certificado"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{c.nome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {certificadoParaExcluir && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#151921] rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Confirmar Exclusão</h3>
            <p className="text-gray-300 mb-4">
              O certificado será desvinculado dos seguintes catálogos:
            </p>
            <ul className="text-gray-300 mb-6 list-disc list-inside max-h-40 overflow-y-auto">
              {catalogosVinculados.length > 0 ? (
                catalogosVinculados.map(cat => <li key={cat.id}>{cat.nome}</li>)
              ) : (
                <li>Nenhum catálogo vinculado</li>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#151921] rounded-lg max-w-lg w-full p-6 border border-gray-700 text-gray-300">
            <h3 className="text-xl font-semibold text-white mb-4">
              Dados do Certificado — {visualizando.cert.nome}
            </h3>
            {!visualizando.info ? (
              <p className="text-gray-400">Carregando informações…</p>
            ) : (
              <div className="space-y-2">
                <div>
                  <span className="text-gray-400">Subject: </span>
                  <span className="text-gray-100 break-all">{visualizando.info.subject}</span>
                </div>
                <div>
                  <span className="text-gray-400">Issuer: </span>
                  <span className="text-gray-100 break-all">{visualizando.info.issuer}</span>
                </div>
                <div>
                  <span className="text-gray-400">Válido de: </span>
                  <span className="text-gray-100">{visualizando.info.validFrom}</span>
                </div>
                <div>
                  <span className="text-gray-400">Válido até: </span>
                  <span className="text-gray-100">{visualizando.info.validTo}</span>
                </div>
                <div>
                  <span className="text-gray-400">Número de série: </span>
                  <span className="text-gray-100 break-all">{visualizando.info.serialNumber}</span>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3 mt-6">
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

