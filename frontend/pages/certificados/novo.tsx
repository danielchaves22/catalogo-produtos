import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { FileInput } from '@/components/ui/FileInput';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { useRouter } from 'next/router';

export default function NovoCertificadoPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [enviando, setEnviando] = useState(false);
  const { addToast } = useToast();
  const router = useRouter();

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
      setEnviando(true);
      const fileContent = await fileToBase64(file);
      await api.post('/certificados', {
        nome,
        fileContent,
        password
      });
      addToast('Certificado enviado com sucesso', 'success');
      router.push('/certificados');
    } catch (error) {
      console.error('Erro ao enviar certificado:', error);
      addToast('Erro ao enviar certificado', 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <DashboardLayout title="Novo Certificado">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Certificados', href: '/certificados' },
          { label: 'Novo' }
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Cadastrar Certificado</h1>
      </div>

      <Card>
        <div className="space-y-4">
          <Input label="Nome" value={nome} onChange={e => setNome(e.target.value)} />
          <FileInput label="Certificado (.pfx)" accept=".pfx" onChange={handleFileChange} />
          <Input label="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => router.push('/certificados')}>Cancelar</Button>
            <Button onClick={upload} disabled={!file || !password || !nome || enviando}>
              {enviando ? 'Enviando...' : 'Enviar'}
            </Button>
          </div>
        </div>
      </Card>
    </DashboardLayout>
  );
}

