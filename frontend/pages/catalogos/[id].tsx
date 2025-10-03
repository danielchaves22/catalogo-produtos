// frontend/pages/catalogos/[id].tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { MaskedInput } from '@/components/ui/MaskedInput';
import { EnvironmentBadge } from '@/components/ui/EnvironmentBadge';
import { Button } from '@/components/ui/Button';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { PageLoader } from '@/components/ui/PageLoader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { useToast } from '@/components/ui/ToastContext';
import { ArrowLeft, Save } from 'lucide-react';
import api from '@/lib/api';
import { onlyNumbers, isValidCPFOrCNPJ } from '@/lib/validation';

interface CatalogoFormData {
  nome: string;
  cpf_cnpj: string;
  status: 'ATIVO' | 'INATIVO';
}

interface CatalogoCompleto extends CatalogoFormData {
  id: number;
  numero: number;
  ultima_alteracao: string;
  ambiente: 'HOMOLOGACAO' | 'PRODUCAO';
  certificadoId?: number | null;
}

interface Certificado {
  id: number;
  nome: string;
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
  const [certificados, setCertificados] = useState<Certificado[]>([]);
  const [certificadoId, setCertificadoId] = useState<number | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [ambienteModalAberto, setAmbienteModalAberto] = useState(false);
  const [alterandoAmbiente, setAlterandoAmbiente] = useState(false);

  const router = useRouter();
  const { id } = router.query;
  const isNew = !id || id === 'novo';
  const { addToast } = useToast();
  const { workingCatalog, setWorkingCatalog } = useWorkingCatalog();
  const formId = 'catalogo-form';
  const salvarLabel = submitting ? 'Salvando...' : 'Salvar Catálogo';

  useEffect(() => {
    carregarCertificados();
  }, []);

  async function carregarCertificados() {
    try {
      const res = await api.get('/certificados');
      setCertificados(res.data);
    } catch (error) {
      addToast('Erro ao carregar certificados', 'error');
    }
  }

  useEffect(() => {
    if (!router.isReady) return;

    if (!isNew && typeof id === 'string') {
      carregarCatalogo(id);
    }
  }, [router.isReady, id, isNew]);

  async function carregarCatalogo(catalogoId: string) {
    try {
      setLoading(true);
      const response = await api.get<CatalogoCompleto>(`/catalogos/${catalogoId}`);
      setCatalogo(response.data);
      setCertificadoId(response.data.certificadoId || null);
      setFormData({
        nome: response.data.nome,
        cpf_cnpj: onlyNumbers(response.data.cpf_cnpj || ''),
        status: response.data.status
      });
      

      if (workingCatalog && workingCatalog.id === response.data.id && workingCatalog.ambiente !== response.data.ambiente) {
        setWorkingCatalog({ ...workingCatalog, ambiente: response.data.ambiente });
      }
    } catch (error) {
      console.error('Erro ao carregar catálogo:', error);
      addToast('Erro ao carregar dados do catálogo', 'error');
      router.push('/catalogos');
    } finally {
      setLoading(false);
    }
  }

  async function vincularCertificado() {
    if (!catalogo || !certificadoId) return;
    try {
      setVinculando(true);
      await api.put(`/catalogos/${catalogo.id}/certificado`, { certificadoId });
      setCatalogo(prev => (prev ? { ...prev, certificadoId } : prev));
      addToast('Certificado vinculado com sucesso', 'success');
    } catch (error) {
      console.error('Erro ao vincular certificado:', error);
      addToast('Erro ao vincular certificado', 'error');
    } finally {
      setVinculando(false);
    }
  }

  async function promoverParaProducao() {
    if (!catalogo) return;
    try {
      setAlterandoAmbiente(true);
      const response = await api.patch<CatalogoCompleto>(`/catalogos/${catalogo.id}/ambiente`, {
        ambiente: 'PRODUCAO'
      });
      addToast('Catalogo promovido para producao', 'success');

      if (workingCatalog && workingCatalog.id === response.data.id) {
        setWorkingCatalog({ ...workingCatalog, ambiente: response.data.ambiente });
      }

      setAmbienteModalAberto(false);
      router.push('/catalogos');
    } catch (error) {
      console.error('Erro ao alterar ambiente do catalogo:', error);
      addToast('Erro ao promover catalogo para producao', 'error');
    } finally {
      setAlterandoAmbiente(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  }

  function handleMaskedChange(name: string) {
    return (cleanValue: string) => {
      setFormData(prev => ({ ...prev, [name]: cleanValue }));

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

    if (formData.cpf_cnpj) {
      const validacao = isValidCPFOrCNPJ(formData.cpf_cnpj);
      if (!validacao.valid) {
        newErrors.cpf_cnpj = validacao.message || 'CPF ou CNPJ inválido';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleApiError(error: any) {
    if (error.response?.status === 400 && error.response?.data?.details) {
      const details = error.response.data.details
        .map((d: any) => `${d.field}: ${d.message}`)
        .join('; ');
      addToast(`Erro de validação: ${details}`, 'error');
    } else if (error.response?.data?.error) {
      addToast(error.response.data.error, 'error');
    } else {
      addToast('Erro ao salvar catálogo', 'error');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validarFormulario()) return;

    try {
      setSubmitting(true);

      if (isNew) {
        await api.post('/catalogos', formData);
        addToast('Catálogo criado com sucesso!', 'success');
      } else {
        await api.put(`/catalogos/${id}`, formData);
        addToast('Catálogo atualizado com sucesso!', 'success');
      }

      router.push('/catalogos');
    } catch (error: any) {
      console.error('Erro ao salvar catálogo:', error);
      handleApiError(error);
    } finally {
      setSubmitting(false);
    }
  }

  function voltar() {
    router.push('/catalogos');
  }

  const dadosContent = (
    <Card>
      <form id={formId} onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4">
          {!isNew && catalogo && (
            <>
              <div className="col-span-2 flex flex-wrap items-start justify-between gap-4 rounded-md border border-gray-700 bg-[#262b36] px-4 py-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-gray-300">Ambiente atual</span>
                  <EnvironmentBadge ambiente={catalogo.ambiente} size="sm" />
                </div>
                {catalogo.ambiente === 'HOMOLOGACAO' ? (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setAmbienteModalAberto(true)}
                    disabled={alterandoAmbiente}
                  >
                    {alterandoAmbiente ? 'Promovendo...' : 'Promover para produção'}
                  </Button>
                ) : (
                  <span className="text-xs font-semibold text-emerald-300">Catálogo em produção</span>
                )}
              </div>

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
          <Button type="button" variant="outline" onClick={voltar} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" variant="accent" className="flex items-center gap-2" disabled={submitting}>
            <Save size={16} />
            {salvarLabel}
          </Button>
        </div>
      </form>
    </Card>
  );

  const certificadoContent = (
    <Card>
      <div className="space-y-4">
        <CustomSelect
          label="Certificado"
          name="certificado"
          value={certificadoId ? String(certificadoId) : ''}
          onChange={(value) => setCertificadoId(Number(value))}
          options={certificados.map(c => ({ value: String(c.id), label: c.nome }))}
          placeholder="Selecione o certificado"
        />
        <Button type="button" onClick={vincularCertificado} disabled={!certificadoId || vinculando}>
          {vinculando ? 'Salvando...' : 'Vincular'}
        </Button>
      </div>
    </Card>
  );

  if (loading) {
    return (
      <DashboardLayout title={isNew ? 'Novo Catálogo' : 'Editar Catálogo'}>
        <PageLoader message="Carregando dados do catálogo..." />
      </DashboardLayout>
    );
  }

  return (
    <>
      <DashboardLayout title={isNew ? 'Novo Catálogo' : 'Editar Catálogo'}>
        <Breadcrumb
          items={[
            { label: 'Início', href: '/' },
            { label: 'Catálogos', href: '/catalogos' },
            { label: isNew ? 'Novo Catálogo' : 'Editar Catálogo' }
          ]}
        />

        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-3 self-end md:self-auto">
            <Button
              type="button"
              variant="outline"
              onClick={voltar}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="accent"
              className="flex items-center gap-2"
              disabled={submitting}
            >
              <Save size={16} />
              {salvarLabel}
            </Button>
          </div>
        </div>
        {dadosContent}
        {!isNew && certificadoContent}
      </DashboardLayout>

      {ambienteModalAberto && catalogo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#151921] rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-3">Confirmar promoção</h3>
            <p className="text-gray-300 mb-3">
              Ao promover o catálogo para produção, todas as alterações passarão a valer para o ambiente oficial e não será possível retornar para homologação.
            </p>
            <p className="text-gray-400 mb-6">
              Caso precise voltar a testar no ambiente de homologação, será necessário clonar o catálogo.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setAmbienteModalAberto(false)} disabled={alterandoAmbiente}>
                Cancelar
              </Button>
              <Button variant="accent" onClick={promoverParaProducao} disabled={alterandoAmbiente}>
                {alterandoAmbiente ? 'Promovendo...' : 'Promover'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
