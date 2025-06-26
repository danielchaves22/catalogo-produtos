// frontend/pages/produtos/novo.tsx
import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';

interface AtributoEstrutura {
  codigo: string;
  nome: string;
  forma_preenchimento: string;
  obrigatorio: boolean;
  dominio?: { codigo: string; descricao: string }[];
}

export default function NovoProdutoPage() {
  const [ncm, setNcm] = useState('');
  const [modalidade, setModalidade] = useState('IMPORTACAO');
  const [estrutura, setEstrutura] = useState<AtributoEstrutura[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});

  async function carregarEstrutura() {
    if (ncm.length < 8) return;
    const response = await api.get(`/siscomex/atributos/ncm/${ncm}`);
    setEstrutura(response.data.dados || []);
  }

  function handleValor(codigo: string, valor: string) {
    setValores(prev => ({ ...prev, [codigo]: valor }));
  }

  async function salvar() {
    await api.post('/produtos', {
      codigo: `PROD-${Date.now()}`,
      ncmCodigo: ncm,
      modalidade,
      valoresAtributos: valores
    });
    alert('Produto salvo');
  }

  return (
    <DashboardLayout title="Novo Produto">
      <Card>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Input label="NCM" value={ncm} onChange={e => setNcm(e.target.value)} />
          <Input label="Modalidade" value={modalidade} onChange={e => setModalidade(e.target.value)} />
          <Button type="button" onClick={carregarEstrutura}>Carregar Estrutura</Button>
        </div>

        {estrutura.map(attr => (
          <Input
            key={attr.codigo}
            label={attr.nome}
            onChange={e => handleValor(attr.codigo, e.target.value)}
          />
        ))}

        <Button type="button" onClick={salvar} className="mt-4">Salvar Produto</Button>
      </Card>
    </DashboardLayout>
  );
}
