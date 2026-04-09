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
import { Save } from 'lucide-react';

type CompatibilidadeStatus =
  | 'NAO_VERIFICADO'
  | 'COMPATIVEL'
  | 'CORRIGIDO_AUTOMATICAMENTE';

type UploadFeedback = {
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  description: string;
};

interface UploadCertificadoResponse {
  id: number;
  nome: string;
  compatibilidadeStatus: CompatibilidadeStatus;
  validadoEm?: string | null;
  detalheValidacao?: string | null;
}

const uploadErrorMessages: Record<string, string> = {
  CERTIFICADO_SENHA_INVALIDA: 'A senha informada para o certificado esta incorreta.',
  CERTIFICADO_INCOMPATIVEL:
    'O certificado usa um formato legado e nao e compativel sem correcao automatica.',
  CERTIFICADO_INVALIDO: 'O arquivo de certificado esta invalido ou corrompido.',
  CERTIFICADO_CORRECAO_FALHOU:
    'Nao foi possivel corrigir automaticamente o certificado enviado.',
};

export default function NovoCertificadoPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [tentarCorrigir, setTentarCorrigir] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<UploadFeedback | null>(null);
  const { addToast } = useToast();
  const router = useRouter();
  const podeEnviar = Boolean(file && password && nome);
  const submitLabel = enviando ? 'Enviando...' : 'Enviar';

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f && !f.name.toLowerCase().endsWith('.pfx')) {
      addToast('Apenas arquivos .pfx sao permitidos', 'error');
      e.target.value = '';
      setFile(null);
      return;
    }

    setFile(f || null);
    setFeedback(null);

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

  function feedbackClasses(type: UploadFeedback['type']) {
    if (type === 'success') {
      return 'border-emerald-600 bg-emerald-950/40 text-emerald-200';
    }
    if (type === 'warning') {
      return 'border-amber-500 bg-amber-950/40 text-amber-200';
    }
    if (type === 'error') {
      return 'border-red-600 bg-red-950/40 text-red-200';
    }

    return 'border-sky-600 bg-sky-950/40 text-sky-200';
  }

  function montarFeedbackSucesso(data: UploadCertificadoResponse): UploadFeedback {
    if (data.compatibilidadeStatus === 'CORRIGIDO_AUTOMATICAMENTE') {
      return {
        type: 'warning',
        title: 'Certificado corrigido automaticamente',
        description:
          data.detalheValidacao ||
          'O arquivo foi convertido para um formato compativel antes do salvamento.',
      };
    }

    if (data.compatibilidadeStatus === 'COMPATIVEL') {
      return {
        type: 'success',
        title: 'Certificado valido e compativel',
        description: data.detalheValidacao || 'Nenhuma correcao foi necessaria.',
      };
    }

    return {
      type: 'info',
      title: 'Certificado salvo',
      description: data.detalheValidacao || 'Status de compatibilidade nao informado.',
    };
  }

  async function upload() {
    if (!file || !password || !nome) return;

    try {
      setEnviando(true);
      setFeedback(null);
      const fileContent = await fileToBase64(file);
      const { data } = await api.post<UploadCertificadoResponse>('/certificados', {
        nome,
        fileContent,
        password,
        tentarCorrigir,
      });

      const resultado = montarFeedbackSucesso(data);
      setFeedback(resultado);
      addToast('Certificado enviado com sucesso', 'success');
    } catch (error) {
      console.error('Erro ao enviar certificado:', error);
      const apiError = error as any;
      const code = apiError?.response?.data?.code as string | undefined;
      const apiMessage = apiError?.response?.data?.error as string | undefined;
      const message = code ? uploadErrorMessages[code] || apiMessage : apiMessage;

      setFeedback({
        type: 'error',
        title: 'Falha ao validar certificado',
        description: message || 'Erro ao enviar certificado',
      });
      addToast(message || 'Erro ao enviar certificado', 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <DashboardLayout title="Novo Certificado">
      <Breadcrumb
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Certificados', href: '/certificados' },
          { label: 'Novo' },
        ]}
      />

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold text-white">Cadastrar Certificado</h1>
        <div className="flex items-center gap-3 self-end md:self-auto">
          <Button variant="outline" onClick={() => router.push('/certificados')} disabled={enviando}>
            Voltar para lista
          </Button>
          <Button
            variant="accent"
            className="flex items-center gap-2"
            onClick={upload}
            disabled={!podeEnviar || enviando}
          >
            <Save size={16} />
            {submitLabel}
          </Button>
        </div>
      </div>

      <Card>
        <div className="space-y-4">
          <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <FileInput label="Certificado (.pfx)" accept=".pfx" onChange={handleFileChange} />
          <Input
            label="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <label className="flex items-start gap-3 rounded-lg border border-gray-700 bg-[#141821] p-3 text-sm text-gray-200">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={tentarCorrigir}
              onChange={(e) => setTentarCorrigir(e.target.checked)}
            />
            <span>
              Tentar corrigir certificado automaticamente (recomendado)
            </span>
          </label>

          {feedback && (
            <div className={`rounded-lg border px-4 py-3 ${feedbackClasses(feedback.type)}`}>
              <p className="text-sm font-semibold">{feedback.title}</p>
              <p className="mt-1 text-sm">{feedback.description}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => router.push('/certificados')} disabled={enviando}>
              Cancelar
            </Button>
            <Button
              onClick={upload}
              disabled={!podeEnviar || enviando}
              variant="accent"
              className="flex items-center gap-2"
            >
              <Save size={16} />
              {submitLabel}
            </Button>
          </div>
        </div>
      </Card>
    </DashboardLayout>
  );
}
