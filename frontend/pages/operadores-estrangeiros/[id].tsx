// frontend/pages/operadores-estrangeiros/[id].tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { MaskedInput } from '@/components/ui/MaskedInput';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { PageLoader } from '@/components/ui/PageLoader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { isValidCEP, onlyNumbers, validationMessages } from '@/lib/validation';
import { CustomSelect } from '@/components/ui/CustomSelect';

interface Pais {
  codigo: string;
  sigla: string;
  nome: string;
}

interface Subdivisao {
  codigo: string;
  sigla: string;
  nome: string;
}

interface AgenciaEmissora {
  codigo: string;
  sigla: string;
  nome: string;
}

interface CnpjCatalogo {
  cnpjRaiz: string;
  nome: string;
}

interface IdentificacaoAdicional {
  numero: string;
  agenciaEmissoraCodigo: string;
}

interface OperadorEstrangeiroFormData {
  cnpjRaizResponsavel: string;
  paisCodigo: string;
  tin?: string;
  nome: string;
  email?: string;
  codigoInterno?: string;
  codigoPostal?: string;
  logradouro?: string;
  cidade?: string;
  subdivisaoCodigo?: string;
  situacao: 'ATIVO' | 'INATIVO' | 'DESATIVADO';
  identificacoesAdicionais: IdentificacaoAdicional[];
}

interface OperadorEstrangeiroCompleto extends OperadorEstrangeiroFormData {
  id: number;
  codigo?: string;
  versao: number;
  dataInclusao: string;
  dataUltimaAlteracao: string;
}

export default function OperadorEstrangeiroFormPage() {
  const [formData, setFormData] = useState<OperadorEstrangeiroFormData>({
    cnpjRaizResponsavel: '',
    paisCodigo: '',
    tin: '',
    nome: '',
    email: '',
    codigoInterno: '',
    codigoPostal: '',
    logradouro: '',
    cidade: '',
    subdivisaoCodigo: '',
    situacao: 'ATIVO',
    identificacoesAdicionais: []
  });
  
  const [operador, setOperador] = useState<OperadorEstrangeiroCompleto | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Dados para dropdowns
  const [paises, setPaises] = useState<Pais[]>([]);
  const [subdivisoes, setSubdivisoes] = useState<Subdivisao[]>([]);
  const [agenciasEmissoras, setAgenciasEmissoras] = useState<AgenciaEmissora[]>([]);
  const [cnpjsCatalogos, setCnpjsCatalogos] = useState<CnpjCatalogo[]>([]);
  const [loadingSubdivisoes, setLoadingSubdivisoes] = useState(false);
  
  const router = useRouter();
  const { id } = router.query;
  const isNew = !id || id === 'novo';
  const { addToast } = useToast();

  // Carregar dados auxiliares
  useEffect(() => {
    carregarDadosAuxiliares();
  }, []);

  // Debug: Log para verificar mudanças no país
  useEffect(() => {
    console.log('País selecionado:', formData.paisCodigo);
    if (formData.paisCodigo) {
      console.log('Carregando subdivisões para:', formData.paisCodigo);
      carregarSubdivisoesPorPais(formData.paisCodigo);
    }
  }, [formData.paisCodigo]);

  // Carregar dados do operador se estiver editando
  useEffect(() => {
    if (!router.isReady) return;
    
    if (!isNew && typeof id === 'string') {
      carregarOperador(id);
    }
  }, [router.isReady, id, isNew]);

  async function carregarDadosAuxiliares() {
    try {
      const [paisesRes, agenciasRes, cnpjsRes] = await Promise.all([
        api.get('/operadores-estrangeiros/aux/paises'),
        api.get('/operadores-estrangeiros/aux/agencias-emissoras'),
        api.get('/operadores-estrangeiros/aux/cnpjs-catalogos')
      ]);
      
      setPaises(paisesRes.data);
      setAgenciasEmissoras(agenciasRes.data);
      setCnpjsCatalogos(cnpjsRes.data);
      
      // Não carrega todas as subdivisões inicialmente
      // Elas serão carregadas quando um país for selecionado
    } catch (error) {
      console.error('Erro ao carregar dados auxiliares:', error);
      addToast('Erro ao carregar dados auxiliares', 'error');
    }
  }

  async function carregarOperador(operadorId: string) {
    try {
      setLoading(true);
      const response = await api.get(`/operadores-estrangeiros/${operadorId}`);
      const data = response.data;
      
      setOperador(data);
      setFormData({
        cnpjRaizResponsavel: data.cnpjRaizResponsavel,
        paisCodigo: data.paisCodigo,
        tin: data.tin || '',
        nome: data.nome,
        email: data.email || '',
        codigoInterno: data.codigoInterno || '',
        codigoPostal: onlyNumbers(data.codigoPostal || ''), // Armazena apenas números
        logradouro: data.logradouro || '',
        cidade: data.cidade || '',
        subdivisaoCodigo: data.subdivisaoCodigo || '',
        situacao: data.situacao,
        identificacoesAdicionais: data.identificacoesAdicionais?.map((item: any) => ({
          numero: item.numero,
          agenciaEmissoraCodigo: item.agenciaEmissora.codigo
        })) || []
      });

      // Carregar subdivisões do país selecionado
      if (data.paisCodigo) {
        carregarSubdivisoesPorPais(data.paisCodigo);
      }
    } catch (error) {
      console.error('Erro ao carregar operador estrangeiro:', error);
      addToast('Erro ao carregar dados do operador estrangeiro', 'error');
      router.push('/operadores-estrangeiros');
    } finally {
      setLoading(false);
    }
  }

  async function carregarSubdivisoesPorPais(paisCodigo: string) {
    if (!paisCodigo) {
      setSubdivisoes([]);
      return;
    }

    try {
      console.log(`Fazendo requisição para: /operadores-estrangeiros/aux/subdivisoes/${paisCodigo}`);
      setLoadingSubdivisoes(true);
      const response = await api.get(`/operadores-estrangeiros/aux/subdivisoes/${paisCodigo}`);
      console.log('Subdivisões recebidas:', response.data);
      setSubdivisoes(response.data);
    } catch (error) {
      console.error(`Erro ao carregar subdivisões do país ${paisCodigo}:`, error);
      setSubdivisoes([]);
      addToast('Erro ao carregar subdivisões', 'error');
    } finally {
      setLoadingSubdivisoes(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Se mudou o país, carregar subdivisões e limpar subdivisão selecionada
    if (name === 'paisCodigo') {
      setFormData(prev => ({ ...prev, subdivisaoCodigo: '' }));
      carregarSubdivisoesPorPais(value);
    }
    
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

  function adicionarIdentificacao() {
    setFormData(prev => ({
      ...prev,
      identificacoesAdicionais: [
        ...prev.identificacoesAdicionais,
        { numero: '', agenciaEmissoraCodigo: '' }
      ]
    }));
  }

  function removerIdentificacao(index: number) {
    setFormData(prev => ({
      ...prev,
      identificacoesAdicionais: prev.identificacoesAdicionais.filter((_, i) => i !== index)
    }));
  }

  function handleIdentificacaoChange(index: number, field: keyof IdentificacaoAdicional, value: string) {
    setFormData(prev => ({
      ...prev,
      identificacoesAdicionais: prev.identificacoesAdicionais.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  }

  function formatarData(dataString: string) {
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR');
  }

  function validarFormulario(): boolean {
    const newErrors: Record<string, string> = {};
    
    if (!formData.cnpjRaizResponsavel.trim()) {
      newErrors.cnpjRaizResponsavel = 'CNPJ Raiz é obrigatório';
    }
    
    if (!formData.paisCodigo) {
      newErrors.paisCodigo = 'País é obrigatório';
    }
    
    if (!formData.nome.trim()) {
      newErrors.nome = 'Nome é obrigatório';
    }
    
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    // Validação de CEP se preenchido
    if (formData.codigoPostal && !isValidCEP(formData.codigoPostal)) {
      newErrors.codigoPostal = validationMessages.cep.invalid;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!validarFormulario()) return;
    
    try {
      setSubmitting(true);
      
      const payload = {
        ...formData,
        identificacoesAdicionais: formData.identificacoesAdicionais.filter(
          item => item.numero.trim() && item.agenciaEmissoraCodigo
        )
      };
      
      if (isNew) {
        await api.post('/operadores-estrangeiros', payload);
        addToast('Operador estrangeiro criado com sucesso!', 'success');
      } else {
        await api.put(`/operadores-estrangeiros/${id}`, payload);
        addToast('Operador estrangeiro atualizado com sucesso!', 'success');
      }
      
      router.push('/operadores-estrangeiros');
    } catch (error) {
      console.error('Erro ao salvar operador estrangeiro:', error);
      addToast('Erro ao salvar operador estrangeiro', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function voltar() {
    router.push('/operadores-estrangeiros');
  }

  if (loading) {
    return (
      <DashboardLayout title={isNew ? 'Novo Operador Estrangeiro' : 'Editar Operador Estrangeiro'}>
        <PageLoader message="Carregando dados do operador estrangeiro..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={isNew ? 'Novo Operador Estrangeiro' : 'Editar Operador Estrangeiro'}>
      <Breadcrumb 
        items={[
          { label: 'Início', href: '/' },
          { label: 'Operadores Estrangeiros', href: '/operadores-estrangeiros' },
          { label: isNew ? 'Novo Operador' : 'Editar Operador' }
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
          {isNew ? 'Cadastrar Novo Operador Estrangeiro' : 'Editar Operador Estrangeiro'}
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Dados Básicos */}
        <Card className="mb-6" headerTitle="Dados Básicos">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Informações do sistema (somente leitura) */}
            {!isNew && operador && (
              <>
                <Input
                  label="Código do Sistema"
                  value={operador.codigo || 'Não gerado'}
                  readOnly
                  disabled
                  className="bg-[#262b36] cursor-not-allowed"
                />
                <Input
                  label="Versão"
                  value={operador.versao.toString()}
                  readOnly
                  disabled
                  className="bg-[#262b36] cursor-not-allowed"
                />
              </>
            )}
            
            {/* Campos editáveis */}
            {isNew ? (
              <CustomSelect
                label="CNPJ Raiz da Empresa Responsável"
                name="cnpjRaizResponsavel"
                value={formData.cnpjRaizResponsavel}
                onChange={(value) => setFormData(prev => ({ ...prev, cnpjRaizResponsável: value }))}
                options={[
                  { value: '', label: 'Selecione uma empresa' },
                  ...cnpjsCatalogos.map(cnpj => ({ 
                    value: cnpj.cnpjRaiz, 
                    label: `${cnpj.cnpjRaiz} - ${cnpj.nome}` 
                  }))
                ]}
                className={errors.cnpjRaizResponsavel ? 'border-red-500' : ''}
                error={errors.cnpjRaizResponsável}
                required
                placeholder="Selecione uma empresa"
              />
            ) : (
              <Input
                label="CNPJ Raiz da Empresa Responsável"
                value={formData.cnpjRaizResponsavel}
                readOnly
                disabled
                className="bg-[#262b36] cursor-not-allowed"
              />
            )}
            {errors.cnpjRaizResponsavel && <p className="text-red-400 text-sm mt-1">{errors.cnpjRaizResponsavel}</p>}
            
            <CustomSelect
              label="País do Fabricante/Produtor"
              name="paisCodigo"
              value={formData.paisCodigo}
              onChange={(value) => {
                setFormData(prev => ({ ...prev, paisCodigo: value, subdivisaoCodigo: '' }));
                carregarSubdivisoesPorPais(value);
              }}
              options={[
                { value: '', label: 'Selecione um país' },
                ...paises.map(pais => ({ 
                  value: pais.codigo, 
                  label: `${pais.sigla} - ${pais.nome}` 
                }))
              ]}
              className={errors.paisCodigo ? 'border-red-500' : ''}
              error={errors.paisCodigo}
              required
              placeholder="Selecione um país"
            />
            {errors.paisCodigo && <p className="text-red-400 text-sm mt-1">{errors.paisCodigo}</p>}
            
            <Input
              label="Número de Identificação (TIN)"
              name="tin"
              value={formData.tin}
              onChange={handleChange}
              error={errors.tin}
              placeholder="Ex: BR12345678000101"
            />
            
            <Input
              label="Nome"
              name="nome"
              value={formData.nome}
              onChange={handleChange}
              error={errors.nome}
              required
            />
            
            <Input
              label="E-mail"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              error={errors.email}
            />
            
            <Input
              label="Código Interno"
              name="codigoInterno"
              value={formData.codigoInterno}
              onChange={handleChange}
              error={errors.codigoInterno}
            />
          </div>
        </Card>

        {/* Endereço */}
        <Card className="mb-6" headerTitle="Endereço">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <MaskedInput
              label="Código Postal"
              mask="cep"
              value={formData.codigoPostal}
              onChange={handleMaskedChange('codigoPostal')}
              error={errors.codigoPostal}
              placeholder="00000-000"
            />
            
            <Input
              label="Cidade"
              name="cidade"
              value={formData.cidade}
              onChange={handleChange}
              error={errors.cidade}
            />
            
            <Input
              label="Logradouro"
              name="logradouro"
              value={formData.logradouro}
              onChange={handleChange}
              error={errors.logradouro}
              className="md:col-span-2"
            />
            
            <CustomSelect
              label="Subdivisão (Estado, província)"
              name="subdivisaoCodigo"
              value={formData.subdivisaoCodigo}
              onChange={(value) => setFormData(prev => ({ ...prev, subdivisaoCodigo: value }))}
              disabled={!formData.paisCodigo || loadingSubdivisoes}
              options={[
                { 
                  value: '', 
                  label: !formData.paisCodigo 
                    ? 'Selecione um país primeiro' 
                    : loadingSubdivisoes 
                      ? 'Carregando...' 
                      : 'Selecione uma subdivisão' 
                },
                ...subdivisoes.map(sub => ({ 
                  value: sub.codigo, 
                  label: `${sub.sigla} - ${sub.nome}` 
                }))
              ]}
              placeholder={
                !formData.paisCodigo 
                  ? 'Selecione um país primeiro'
                  : loadingSubdivisoes 
                    ? 'Carregando subdivisões...'
                    : 'Selecione uma subdivisão'
              }
            />
            
            <Select
              label="Situação"
              name="situacao"
              value={formData.situacao}
              onChange={handleChange}
              options={[
                { value: 'ATIVO', label: 'Ativo' },
                { value: 'INATIVO', label: 'Inativo' },
                { value: 'DESATIVADO', label: 'Desativado' }
              ]}
            />
          </div>
        </Card>

        {/* Identificações Adicionais */}
        <Card className="mb-6" headerTitle="Identificação Adicional">
          <div className="mb-4">
            <Button 
              type="button" 
              variant="outline"
              onClick={adicionarIdentificacao}
              className="flex items-center gap-2"
            >
              <Plus size={16} />
              Adicionar Identificação
            </Button>
          </div>
          
          {formData.identificacoesAdicionais.length === 0 ? (
            <p className="text-gray-400 text-center py-4">
              Nenhuma identificação adicional cadastrada
            </p>
          ) : (
            <div className="space-y-4">
              {formData.identificacoesAdicionais.map((identificacao, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-[#1a1f2b] rounded-lg">
                  <Input
                    label="Número"
                    value={identificacao.numero}
                    onChange={(e) => handleIdentificacaoChange(index, 'numero', e.target.value)}
                    placeholder="Ex: 123456789"
                  />
                  
                  <Select
                    label="Agência Emissora"
                    value={identificacao.agenciaEmissoraCodigo}
                    onChange={(e) => handleIdentificacaoChange(index, 'agenciaEmissoraCodigo', e.target.value)}
                    options={[
                      { value: '', label: 'Selecione uma agência' },
                      ...agenciasEmissoras.map(agencia => ({ 
                        value: agencia.codigo, 
                        label: `${agencia.sigla} - ${agencia.nome}` 
                      }))
                    ]}
                  />
                  
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => removerIdentificacao(index)}
                      className="flex items-center gap-2"
                    >
                      <Trash2 size={16} />
                      Remover
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Informações do Sistema (apenas para edição) */}
        {!isNew && operador && (
          <Card className="mb-6" headerTitle="Informações do Sistema">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Data de Inclusão"
                value={formatarData(operador.dataInclusao)}
                readOnly
                disabled
                className="bg-[#262b36] cursor-not-allowed"
              />
              <Input
                label="Última Alteração"
                value={formatarData(operador.dataUltimaAlteracao)}
                readOnly
                disabled
                className="bg-[#262b36] cursor-not-allowed"
              />
            </div>
          </Card>
        )}
        
        {/* Botões de Ação */}
        <div className="flex justify-end gap-3">
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
            {submitting ? 'Salvando...' : 'Salvar Operador'}
          </Button>
        </div>
      </form>
    </DashboardLayout>
  );
}