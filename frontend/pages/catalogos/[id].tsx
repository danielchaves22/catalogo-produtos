// frontend/pages/catalogos/[id].tsx (atualizado com breadcrumb)
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { PageLoader } from '@/components/ui/PageLoader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import { ArrowLeft, Save } from 'lucide-react';
import api from '@/lib/api';

interface CatalogoFormData {
  nome: string;
  cpf_cnpj: string;
  status: 'ATIVO' | 'INATIVO';
}

interface CatalogoCompleto extends CatalogoFormData {
  id: number;
  numero: number;
  ultima_alteracao: string;
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
        cpf_cnpj: response.data.cpf_cnpj || '',
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

  function formatarData(dataString: string) {
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR');
  }

  function validarFormulario(): boolean {
    const newErrors: Record<string, string> = {};
    
    if (!formData.nome.trim()) {
      newErrors.nome = 'O nome é obrigatório';
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

  if (loading) {
    return (
      <DashboardLayout title={isNew ? 'Novo Catálogo' : 'Editar Catálogo'}>
        <PageLoader message="Carregando dados do catálogo..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={isNew ? 'Novo Catálogo' : 'Editar Catálogo'}>
      {/* Breadcrumb substituindo os cabeçalhos anteriores */}
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

      <Card>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-6">
            {/* Número e Data (somente leitura) */}
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
            
            {/* Campos editáveis */}
            <Input
              label="Nome"
              name="nome"
              value={formData.nome}
              onChange={handleChange}
              error={errors.nome}
              required
              className="col-span-2"
            />
            
            <Input
              label="CPF/CNPJ"
              name="cpf_cnpj"
              value={formData.cpf_cnpj}
              onChange={handleChange}
              error={errors.cpf_cnpj}
            />
            
            <Select
              label="Status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              options={[
                { value: 'ATIVO', label: 'Ativo' },
                { value: 'INATIVO', label: 'Inativo' }
              ]}
            />
          </div>
          
          <div className="mt-6 flex justify-end gap-3">
            <Button 
              type="button" 
              variant="outline"
              onClick={voltar}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              variant="accent"
              className="flex items-center gap-2"
              disabled={submitting}
            >
              <Save size={16} />
              {submitting ? 'Salvando...' : 'Salvar Catálogo'}
            </Button>
          </div>
        </form>
      </Card>
    </DashboardLayout>
  );
}