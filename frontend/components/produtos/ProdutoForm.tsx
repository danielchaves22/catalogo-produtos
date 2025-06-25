import React, { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { CustomSelect } from '@/components/ui/CustomSelect';
import api from '@/lib/api';

interface Dominio {
  codigo: string;
  descricao: string;
}

interface Atributo {
  codigo: string;
  nome: string;
  formaPreenchimento: 'LISTA_ESTATICA' | 'BOOLEANO' | 'TEXTO' | 'NUMERO_REAL' | 'NUMERO_INTEIRO';
  obrigatorio?: boolean;
  dominio?: Dominio[];
}

interface EstruturaNcm {
  ncm: string;
  atributos: Atributo[];
}

interface Props {
  onSuccess?: () => void;
}

export default function ProdutoForm({ onSuccess }: Props) {
  const [codigo, setCodigo] = useState('');
  const [ncm, setNcm] = useState('');
  const [estrutura, setEstrutura] = useState<EstruturaNcm | null>(null);
  const [valores, setValores] = useState<Record<string, any>>({});
  const [loadingEstrutura, setLoadingEstrutura] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function buscarEstrutura() {
    if (ncm.length < 8) return;
    setLoadingEstrutura(true);
    try {
      const resp = await api.get(`/estruturas/ncm/${ncm}`);
      setEstrutura(resp.data);
      setValores({});
    } catch (err) {
      console.error(err);
      alert('Estrutura não encontrada');
    } finally {
      setLoadingEstrutura(false);
    }
  }

  function handleValor(cod: string, valor: any) {
    setValores(prev => ({ ...prev, [cod]: valor }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSubmitting(true);
      await api.post('/produtos', {
        codigo,
        ncmCodigo: ncm,
        valoresAtributos: valores
      });
      alert('Produto criado');
      onSuccess?.();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  }

  const renderCampo = (atr: Atributo) => {
    const valor = valores[atr.codigo] ?? '';
    switch (atr.formaPreenchimento) {
      case 'TEXTO':
        return (
          <Input
            key={atr.codigo}
            label={atr.nome}
            value={valor}
            onChange={e => handleValor(atr.codigo, e.target.value)}
          />
        );
      case 'NUMERO_INTEIRO':
        return (
          <Input
            key={atr.codigo}
            label={atr.nome}
            type="number"
            value={valor}
            onChange={e => handleValor(atr.codigo, e.target.value)}
          />
        );
      case 'NUMERO_REAL':
        return (
          <Input
            key={atr.codigo}
            label={atr.nome}
            type="number"
            step="0.01"
            value={valor}
            onChange={e => handleValor(atr.codigo, e.target.value)}
          />
        );
      case 'BOOLEANO':
        return (
          <div key={atr.codigo} className="mb-4">
            <label className="flex items-center space-x-2 text-gray-300">
              <input
                type="checkbox"
                checked={valor}
                onChange={e => handleValor(atr.codigo, e.target.checked)}
              />
              <span>{atr.nome}</span>
            </label>
          </div>
        );
      case 'LISTA_ESTATICA':
        return (
          <CustomSelect
            key={atr.codigo}
            label={atr.nome}
            options={atr.dominio?.map(d => ({ value: d.codigo, label: d.descricao })) || []}
            value={valor}
            onChange={v => handleValor(atr.codigo, v)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Código" value={codigo} onChange={e => setCodigo(e.target.value)} />
      <div className="flex space-x-2 items-end">
        <Input
          label="NCM"
          value={ncm}
          onChange={e => setNcm(e.target.value)}
        />
        <Button type="button" onClick={buscarEstrutura} disabled={loadingEstrutura}>
          Carregar
        </Button>
      </div>
      {estrutura && estrutura.atributos.map(renderCampo)}
      <Button type="submit" disabled={submitting}>
        Salvar
      </Button>
    </form>
  );
}
