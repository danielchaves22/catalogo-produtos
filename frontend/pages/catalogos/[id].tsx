// frontend/pages/catalogos/[id].tsx (CORRIGIDO com MaskedInput)
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { FileInput } from '@/components/ui/FileInput';
import { MaskedInput } from '@/components/ui/MaskedInput';
import { Button } from '@/components/ui/Button';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { PageLoader } from '@/components/ui/PageLoader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import { ArrowLeft, Save } from 'lucide-react';
import api from '@/lib/api';
import { onlyNumbers, isValidCPFOrCNPJ } from '@/lib/validation';
import { Tabs } from '@/components/ui/Tabs';

interface CatalogoFormData {
  nome: string;
  cpf_cnpj: string;
  status: 'ATIVO' | 'INATIVO';
}

interface CatalogoCompleto extends CatalogoFormData {
  id: number;
  numero: number;
  ultima_alteracao: string;
  certificadoPfxPath?: string | null;
}

export default function CatalogoFormPage() {
  const [formData, setFormData] = useState<CatalogoFormData>({
    nome: '',
    cpf_cnpj: '',
    status: 'ATIVO'
  });
  
  const [catalogo, setCatalogo] = useState<CatalogoCompleto | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadMode, setUploadMode] = useState(false);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [uploadingCert, setUploadingCert] = useState(false);

  function handleCertFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const isPfx =
        file.name.toLowerCase().endsWith('.pfx') ||
        file.type === 'application/x-pkcs12';
      if (!isPfx) {
        addToast('Apenas arquivos .pfx são permitidos', 'error');
        e.target.value = '';
        setCertFile(null);
        return;
      }
    }
    setCertFile(file || null);
  }
  
  const router = useRouter();
  const { id } = router.query;
  const isNew = !id || id === 'novo';
  const { addToast } = useToast();

  // Carregar dados do catálogo se estiver editando
  useEffect(() => {
    if (!router.isReady) return;
    
    if (!isNew && typeof id === 'string') {
      carregarCatalogo(id);
    }
  }, [router.isReady, id, isNew]);

  async function carregarCatalogo(catalogoId: string) {
    try {
      setLoading(true);
      const response = await api.get(`/catalogos/${catalogoId}`);
      setCatalogo(response.data);
      setFormData({
        nome: response.data.nome,
        cpf_cnpj: onlyNumbers(response.data.cpf_cnpj || ''), // Armazena apenas números
        status: response.data.status
      });
    } catch (error) {
      console.error('Erro ao carregar catálogo:', error);
      addToast('Erro ao carregar dados do catálogo', 'error');
      router.push('/catalogos');
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Limpa o erro do campo quando o valor muda
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  }

  // Handler específico para MaskedInput
  function handleMaskedChange(name: string) {
    return (cleanValue: string, formattedValue: string) => {
      setFormData(prev => ({ ...prev, [name]: cleanValue }));
      
      // Limpa erro quando valor muda
      if (errors[name]) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
      }
    };
  }

  function formatarData(dataString: string) {
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR');
  }

  function validarFormulario(): boolean {
    const newErrors: Record<string, string> = {};
    
    if (!formData.nome.trim()) {
      newErrors.nome = 'O nome é obrigatório';
    }
    
    // Validação de CPF/CNPJ se preenchido
    if (formData.cpf_cnpj) {
      const validacao = isValidCPFOrCNPJ(formData.cpf_cnpj);
      if (!validacao.valid) {
        newErrors.cpf_cnpj = validacao.message || 'CPF ou CNPJ inválido';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!validarFormulario()) return;
    
    try {
      setSubmitting(true);
      
      if (isNew) {
        // Criar novo catálogo
        await api.post('/catalogos', formData);
        addToast('Catálogo criado com sucesso!', 'success');
      } else {
        // Atualizar catálogo existente
        await api.put(`/catalogos/${id}`, formData);
        addToast('Catálogo atualizado com sucesso!', 'success');
      }
      
      router.push('/catalogos');
    } catch (error) {
      console.error('Erro ao salvar catálogo:', error);
      addToast('Erro ao salvar catálogo', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function voltar() {
    router.push('/catalogos');
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

  async function handleUploadCertificado() {
    if (!certFile || !certPassword || !catalogo) return;
    try {
      setUploadingCert(true);
      const fileContent = await fileToBase64(certFile);
      const res = await api.post(`/catalogos/${catalogo.id}/certificado`, {
        fileContent,
        password: certPassword
      });
      setCatalogo(prev => (prev ? { ...prev, certificadoPfxPath: res.data.path } : prev));
      setUploadMode(false);
      setCertFile(null);
      setCertPassword('');
      addToast('Certificado enviado com sucesso', 'success');
    } catch (error) {
      console.error('Erro ao enviar certificado:', error);
      addToast('Erro ao enviar certificado', 'error');
    } finally {
      setUploadingCert(false);
    }
  }

  async function baixarCertificado() {
    if (!catalogo) return;
    try {
      const res = await api.get(`/catalogos/${catalogo.id}/certificado`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `certificado-${catalogo.id}.pfx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Erro ao baixar certificado:', error);
      addToast('Erro ao baixar certificado', 'error');
    }
  }

  const dadosContent = (
    <Card>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4">
          {!isNew && catalogo && (
            <>
              <Input
                label="Número"
                value={catalogo.numero.toString()}
                readOnly
                disabled
                className="bg-[#262b36] cursor-not-allowed"
              />
              <Input
                label="Última Alteração"
                value={formatarData(catalogo.ultima_alteracao)}
                readOnly
                disabled
                className="bg-[#262b36] cursor-not-allowed"
              />
            </>
          )}

          <Input
            label="Nome"
            name="nome"
            value={formData.nome}
            onChange={handleChange}
            error={errors.nome}
            required
            className="col-span-2"
          />

          <MaskedInput
            label="CPF/CNPJ"
            mask="cpf-cnpj"
            value={formData.cpf_cnpj}
            onChange={handleMaskedChange('cpf_cnpj')}
            error={errors.cpf_cnpj}
            placeholder="CPF: 000.000.000-00 ou CNPJ: 00.000.000/0000-00"
          />

          <CustomSelect
            label="Status"
            name="status"
            value={formData.status}
            onChange={(value) => setFormData(prev => ({ ...prev, status: value as 'ATIVO' | 'INATIVO' }))}
            options={[
              { value: 'ATIVO', label: 'Ativo' },
              { value: 'INATIVO', label: 'Inativo' }
            ]}
            required
            placeholder="Selecione o status"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={voltar}>
            Cancelar
          </Button>
          <Button type="submit" variant="accent" className="flex items-center gap-2" disabled={submitting}>
            <Save size={16} />
            {submitting ? 'Salvando...' : 'Salvar Catálogo'}
          </Button>
        </div>
      </form>
    </Card>
  );

  const certificadoContent = (
    <Card>
      {catalogo?.certificadoPfxPath && !uploadMode ? (
        <div className="space-y-4">
          <p className="text-white">Certificado já enviado.</p>
          <div className="flex gap-4">
            <Button type="button" onClick={baixarCertificado}>Baixar</Button>
            <Button type="button" variant="outline" onClick={() => setUploadMode(true)}>
              Enviar novo
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <FileInput label="Certificado (.pfx)" accept=".pfx" onChange={handleCertFileChange} />
          <Input label="Senha" type="password" value={certPassword} onChange={e => setCertPassword(e.target.value)} />
          <div className="flex gap-4">
            {catalogo?.certificadoPfxPath && (
              <Button type="button" variant="outline" onClick={() => { setUploadMode(false); setCertFile(null); setCertPassword(''); }}>
                Cancelar
              </Button>
            )}
            <Button type="button" onClick={handleUploadCertificado} disabled={uploadingCert || !certFile || !certPassword}>
              {uploadingCert ? 'Enviando...' : 'Enviar'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );

  const tabs = isNew
    ? [{ id: 'dados', label: 'Dados', content: dadosContent }]
    : [
        { id: 'dados', label: 'Dados', content: dadosContent },
        { id: 'certificado', label: 'Certificado', content: certificadoContent }
      ];

  if (loading) {
    return (
      <DashboardLayout title={isNew ? 'Novo Catálogo' : 'Editar Catálogo'}>
        <PageLoader message="Carregando dados do catálogo..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={isNew ? 'Novo Catálogo' : 'Editar Catálogo'}>
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Catálogos', href: '/catalogos' },
          { label: isNew ? 'Novo Catálogo' : 'Editar Catálogo' }
        ]}
      />

      <div className="mb-6 flex items-center gap-2">
        <button
          onClick={voltar}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-semibold text-white">
          {isNew ? 'Criar Novo Catálogo' : 'Editar Catálogo'}
        </h1>
      </div>
      <Tabs tabs={tabs} />
    </DashboardLayout>
  );
}