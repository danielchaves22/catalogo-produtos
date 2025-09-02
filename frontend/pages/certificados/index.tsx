import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { FileInput } from '@/components/ui/FileInput';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import { Eye, Trash2 } from 'lucide-react';
import api from '@/lib/api';

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
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [certificadoParaExcluir, setCertificadoParaExcluir] = useState<Certificado | null>(null);
  const [catalogosVinculados, setCatalogosVinculados] = useState<{ id: number; nome: string }[]>([]);
  const [visualizando, setVisualizando] = useState<{ cert: Certificado; info?: CertificadoInfo } | null>(null);
  const { addToast } = useToast();

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f && !f.name.toLowerCase().endsWith('.pfx')) {
      addToast('Apenas arquivos .pfx são permitidos', 'error');
      e.target.value = '';
      setFile(null);
      return;
    }
    setFile(f || null);
    if (f) {
      setNome(f.name.replace(/\.pfx$/i, ''));
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function upload() {
    if (!file || !password || !nome) return;
    try {
      const fileContent = await fileToBase64(file);
      await api.post('/certificados', {
        nome,
        fileContent,
        password
      });
      setFile(null);
      setPassword('');
      setNome('');
      addToast('Certificado enviado com sucesso', 'success');
      carregar();
    } catch (error) {
      console.error('Erro ao enviar certificado:', error);
      addToast('Erro ao enviar certificado', 'error');
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

  return (
    <DashboardLayout title="Certificados">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Certificados' }
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Certificados</h1>
      </div>

      <Card className="mb-6">
        <div className="space-y-4">
          <Input label="Nome" value={nome} onChange={e => setNome(e.target.value)} />
          <FileInput label="Certificado (.pfx)" accept=".pfx" onChange={handleFileChange} />
          <Input label="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <Button onClick={upload} disabled={!file || !password || !nome}>Enviar</Button>
        </div>
      </Card>
      <Card>
        <ul className="space-y-2">
          {certificados.map(c => (
            <li key={c.id} className="text-white flex justify-between items-center">
              <span>{c.nome}</span>
              <div className="flex gap-2">
                <button
                  className="p-1 text-gray-300 hover:text-blue-500 transition-colors"
                  onClick={() => visualizarCertificado(c)}
                  title="Visualizar dados do certificado"
                >
                  <Eye size={16} />
                </button>
                <button
                  className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                  onClick={() => confirmarRemocao(c)}
                  title="Excluir certificado"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
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
