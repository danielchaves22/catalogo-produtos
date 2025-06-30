// frontend/pages/produtos/novo.tsx
import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';

interface AtributoEstrutura {
  codigo: string;
  nome: string;
  tipo: string;
  obrigatorio: boolean;
  dominio?: { codigo: string; descricao: string }[];
  validacoes?: Record<string, any>;
}

export default function NovoProdutoPage() {
  const [ncm, setNcm] = useState('');
  const [modalidade, setModalidade] = useState('IMPORTACAO');
  const [estrutura, setEstrutura] = useState<AtributoEstrutura[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});

  async function carregarEstrutura() {
    if (ncm.length < 8) return;
    const response = await api.get(
      `/siscomex/atributos/ncm/${ncm}?modalidade=${modalidade}`
    );
    setEstrutura(response.data.dados || []);
  }

  function handleValor(codigo: string, valor: string) {
    setValores(prev => ({ ...prev, [codigo]: valor }));
  }

  function renderCampo(attr: AtributoEstrutura) {
    const value = valores[attr.codigo] || '';

    switch (attr.tipo) {
      case 'LISTA_ESTATICA':
        return (
          <Select
            key={attr.codigo}
            label={attr.nome}
            required={attr.obrigatorio}
            options={
              attr.dominio?.map(d => ({ value: d.codigo, label: d.descricao })) ||
              []
            }
            value={value}
            onChange={e => handleValor(attr.codigo, e.target.value)}
          />
        );
      case 'BOOLEANO':
        return (
          <Select
            key={attr.codigo}
            label={attr.nome}
            required={attr.obrigatorio}
            options={[
              { value: 'true', label: 'Sim' },
              { value: 'false', label: 'Não' }
            ]}
            value={value}
            onChange={e => handleValor(attr.codigo, e.target.value)}
          />
        );
      case 'NUMERO_INTEIRO':
        return (
          <Input
            key={attr.codigo}
            label={attr.nome}
            type="number"
            required={attr.obrigatorio}
            value={value}
            onChange={e => handleValor(attr.codigo, e.target.value)}
          />
        );
      case 'NUMERO_REAL':
        return (
          <Input
            key={attr.codigo}
            label={attr.nome}
            type="number"
            step="0.01"
            required={attr.obrigatorio}
            value={value}
            onChange={e => handleValor(attr.codigo, e.target.value)}
          />
        );
      default:
        return (
          <Input
            key={attr.codigo}
            label={attr.nome}
            required={attr.obrigatorio}
            value={value}
            onChange={e => handleValor(attr.codigo, e.target.value)}
          />
        );
    }
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

        <div className="grid grid-cols-2 gap-4">
          {estrutura.map(attr => renderCampo(attr))}
        </div>

        <Button type="button" onClick={salvar} className="mt-4">Salvar Produto</Button>
      </Card>
    </DashboardLayout>
  );
}
