// frontend/pages/perfil.tsx
import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastContext';

export default function PerfilPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Limpa o erro do campo ao digitar
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Nome é obrigatório';
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email é obrigatório';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }
    
    // Validação de senha apenas se o usuário estiver tentando alterá-la
    if (formData.newPassword) {
      if (!formData.currentPassword) {
        newErrors.currentPassword = 'Senha atual é obrigatória para alterar a senha';
      }
      
      if (formData.newPassword.length < 6) {
        newErrors.newPassword = 'Nova senha deve ter pelo menos 6 caracteres';
      }
      
      if (formData.newPassword !== formData.confirmPassword) {
        newErrors.confirmPassword = 'As senhas não conferem';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    
    try {
      // Simular uma chamada à API para atualização de perfil
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      addToast('Perfil atualizado com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      addToast('Erro ao atualizar perfil. Tente novamente.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout title="Meu Perfil">
      <div className="max-w-3xl mx-auto">
        <Card 
          className="mb-6" 
          headerTitle="Informações do Perfil" 
          headerSubtitle="Atualize suas informações pessoais"
        >
          <form onSubmit={handleSubmit}>
            <Input
              label="Nome Completo"
              name="name"
              value={formData.name}
              onChange={handleChange}
              error={errors.name}
              className="mb-4"
            />
            
            <Input
              label="Email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              error={errors.email}
              className="mb-6"
            />
            
            <button
              type="submit"
              className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 transition-colors"
              disabled={loading}
            >
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </form>
        </Card>
        
        <Card 
          headerTitle="Alterar Senha" 
          headerSubtitle="Atualizar sua senha de acesso"
        >
          <form onSubmit={handleSubmit}>
            <Input
              label="Senha Atual"
              type="password"
              name="currentPassword"
              value={formData.currentPassword}
              onChange={handleChange}
              error={errors.currentPassword}
              className="mb-4"
            />
            
            <Input
              label="Nova Senha"
              type="password"
              name="newPassword"
              value={formData.newPassword}
              onChange={handleChange}
              error={errors.newPassword}
              className="mb-4"
            />
            
            <Input
              label="Confirmar Nova Senha"
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              error={errors.confirmPassword}
              className="mb-6"
            />
            
            <button
              type="submit"
              className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 transition-colors"
              disabled={loading}
            >
              {loading ? 'Atualizando...' : 'Atualizar Senha'}
            </button>
          </form>
        </Card>
      </div>
    </DashboardLayout>
  );
}