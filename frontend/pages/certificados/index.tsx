import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { FileInput } from '@/components/ui/FileInput';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';

interface Certificado {
  id: number;
  nome: string;
}

export default function CertificadosPage() {
  const [certificados, setCertificados] = useState<Certificado[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
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
    if (!file || !password) return;
    try {
      const fileContent = await fileToBase64(file);
      await api.post('/certificados', {
        nome: file.name.replace(/\.pfx$/i, ''),
        fileContent,
        password
      });
      setFile(null);
      setPassword('');
      addToast('Certificado enviado com sucesso', 'success');
      carregar();
    } catch (error) {
      console.error('Erro ao enviar certificado:', error);
      addToast('Erro ao enviar certificado', 'error');
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
          <FileInput label="Certificado (.pfx)" accept=".pfx" onChange={handleFileChange} />
          <Input label="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <Button onClick={upload} disabled={!file || !password}>Enviar</Button>
        </div>
      </Card>
      <Card>
        <ul className="space-y-2">
          {certificados.map(c => (
            <li key={c.id} className="text-white">{c.nome}</li>
          ))}
        </ul>
      </Card>
    </DashboardLayout>
  );
}
