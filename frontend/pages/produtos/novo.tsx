import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';

interface Atributo {
  codigo: string;
  nome: string;
  tipo: string;
  valores?: string[];
}

export default function NovoProdutoPage() {
  const [ncm, setNcm] = useState('');
  const [nome, setNome] = useState('');
  const [estrutura, setEstrutura] = useState<Atributo[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const router = useRouter();
  const { addToast } = useToast();

  async function carregarAtributos() {
    if (!ncm) return;
    try {
      const res = await api.get(`/produtos/atributos/${ncm}`);
      setEstrutura(res.data);
    } catch (error) {
      console.error(error);
      addToast('Erro ao carregar atributos', 'error');
    }
  }

  function handleValorChange(codigo: string, value: string) {
    setValores(prev => ({ ...prev, [codigo]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/produtos', { nome, ncmCodigo: ncm, valores });
      addToast('Produto salvo com sucesso', 'success');
      router.push('/produtos');
    } catch (error) {
      console.error(error);
      addToast('Erro ao salvar produto', 'error');
    }
  }

  return (
    <DashboardLayout title="Novo Produto">
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Produtos', href: '/produtos' }, { label: 'Novo' }]} />
      <Card>
        <form onSubmit={handleSubmit}>
          <Input label="NCM" value={ncm} onChange={e => setNcm(e.target.value)} />
          <Button type="button" onClick={carregarAtributos} className="mb-4">Carregar Atributos</Button>
          <Input label="Nome" value={nome} onChange={e => setNome(e.target.value)} />
          {estrutura.map(attr => (
            <Input
              key={attr.codigo}
              label={attr.nome}
              value={valores[attr.codigo] || ''}
              onChange={e => handleValorChange(attr.codigo, e.target.value)}
            />
          ))}
          <div className="mt-6 flex justify-end">
            <Button type="submit" variant="accent">Salvar</Button>
          </div>
        </form>
      </Card>
    </DashboardLayout>
  );
}
