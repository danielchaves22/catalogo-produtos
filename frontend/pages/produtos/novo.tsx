// frontend/pages/produtos/novo.tsx
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/ToastContext';
import { useRouter } from 'next/router';
import api from '@/lib/api';

interface AtributoEstrutura {
  codigo: string;
  nome: string;
  tipo: string;
  obrigatorio: boolean;
  dominio?: { codigo: string; descricao: string }[];
  validacoes?: Record<string, any>;
  descricaoCondicao?: string;
  condicao?: any;
  parentCodigo?: string;
  subAtributos?: AtributoEstrutura[];
}

export default function NovoProdutoPage() {
  const [catalogoId, setCatalogoId] = useState('');
  const [codigo] = useState(() => `PROD-${Date.now()}`);
  const [catalogos, setCatalogos] = useState<Array<{ id: number; nome: string }>>([]);
  const [ncm, setNcm] = useState('');
  const [modalidade, setModalidade] = useState('IMPORTACAO');
  const [estrutura, setEstrutura] = useState<AtributoEstrutura[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const { addToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    async function carregarCatalogos() {
      const res = await api.get('/catalogos');
      setCatalogos(res.data);
    }
    carregarCatalogos();
  }, []);

  const mapaEstrutura = React.useMemo(() => {
    const map = new Map<string, AtributoEstrutura>();
    function coletar(lista: AtributoEstrutura[]) {
      for (const a of lista) {
        map.set(a.codigo, a);
        if (a.subAtributos) coletar(a.subAtributos);
      }
    }
    coletar(estrutura);
    return map;
  }, [estrutura]);

  function ordenarAtributos(lista: AtributoEstrutura[]): AtributoEstrutura[] {
    const map = new Map(lista.map(a => [a.codigo, a]));
    const resultado: AtributoEstrutura[] = [];
    const visitados = new Set<string>();

    function inserir(attr: AtributoEstrutura) {
      if (visitados.has(attr.codigo)) return;
      visitados.add(attr.codigo);
      if (attr.subAtributos) {
        attr.subAtributos = ordenarAtributos(attr.subAtributos);
      }
      resultado.push(attr);
      for (const a of lista) {
        if (a.parentCodigo === attr.codigo && map.get(attr.codigo)?.tipo !== 'COMPOSTO') {
          inserir(a);
        }
      }
    }

    for (const attr of lista) {
      if (!attr.parentCodigo || map.get(attr.parentCodigo)?.tipo === 'COMPOSTO') {
        inserir(attr);
      }
    }

    for (const attr of lista) if (!visitados.has(attr.codigo)) inserir(attr);

    return resultado;
  }

  async function carregarEstrutura() {
    if (ncm.length < 8) return;
    const response = await api.get(
      `/siscomex/atributos/ncm/${ncm}?modalidade=${modalidade}`
    );
    const dados: AtributoEstrutura[] = response.data.dados || [];
    setEstrutura(ordenarAtributos(dados));
  }

  function handleValor(codigo: string, valor: string) {
    setValores(prev => ({ ...prev, [codigo]: valor }));
  }

  function avaliarExpressao(cond: any, valor: string): boolean {
    if (!cond) return true;
    const esperado = cond.valor;
    let ok = true;
    switch (cond.operador) {
      case '==':
        ok = valor === esperado;
        break;
      case '!=':
        ok = valor !== esperado;
        break;
      case '>':
        ok = Number(valor) > Number(esperado);
        break;
      case '>=':
        ok = Number(valor) >= Number(esperado);
        break;
      case '<':
        ok = Number(valor) < Number(esperado);
        break;
      case '<=':
        ok = Number(valor) <= Number(esperado);
        break;
    }
    if (cond.condicao) {
      const next = avaliarExpressao(cond.condicao, valor);
      return cond.composicao === '||' ? ok || next : ok && next;
    }
    return ok;
  }

  // A visibilidade dos atributos condicionados é verificada a cada alteração
  // pois o componente re-renderiza sempre que 'valores' é atualizado.
  function condicaoAtendida(attr: AtributoEstrutura): boolean {
    if (!attr.parentCodigo) return true;

    const pai = mapaEstrutura.get(attr.parentCodigo);
    if (pai && !condicaoAtendida(pai)) return false;

    const atual = valores[attr.parentCodigo];
    if (atual === undefined || atual === '') return false;

    if (attr.condicao) {
      return avaliarExpressao(attr.condicao, String(atual));
    }

    if (!attr.descricaoCondicao) return true;
    const regex = /valor\s*=\s*'?"?(\w+)"?'?/i;
    const match = attr.descricaoCondicao.match(regex);
    if (!match) return true;
    const esperado = match[1];
    return atual === esperado;
  }

  function renderCampo(attr: AtributoEstrutura): React.ReactNode {
    if (!condicaoAtendida(attr)) return null;

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
            placeholder="Selecione..."
            value={value}
            onChange={e => handleValor(attr.codigo, e.target.value)}
          />
        );
      case 'BOOLEANO':
        return (
          <RadioGroup
            key={attr.codigo}
            label={attr.nome}
            required={attr.obrigatorio}
            options={[
              { value: 'true', label: 'Sim' },
              { value: 'false', label: 'Não' }
            ]}
            value={value}
            onChange={v => handleValor(attr.codigo, v)}
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
      case 'COMPOSTO':
        return (
          <div key={attr.codigo} className="col-span-3">
            <p className="font-medium mb-2 text-sm">{attr.nome}</p>
            <div className="grid grid-cols-3 gap-4 pl-4">
              {attr.subAtributos?.map(sa => renderCampo(sa))}
            </div>
          </div>
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
    try {
      await api.post('/produtos', {
        codigo: `PROD-${Date.now()}`,
        ncmCodigo: ncm,
        modalidade,
        catalogoId: Number(catalogoId),
        valoresAtributos: valores
      });
      addToast('Produto salvo com sucesso!', 'success');
      router.push('/produtos');
    } catch (error: any) {
      handleApiError(error);
    }
  }

  function handleApiError(error: any) {
    if (error.response?.status === 400 && error.response?.data?.details) {
      const details = error.response.data.details
        .map((d: any) => `${d.field}: ${d.message}`)
        .join('; ');
      addToast(`Erro de valida\u00e7\u00e3o: ${details}`, 'error');
    } else if (error.response?.data?.error) {
      addToast(error.response.data.error, 'error');
    } else {
      addToast('Erro ao salvar produto', 'error');
    }
  }

  return (
    <DashboardLayout title="Novo Produto">
      <Card className="mb-6" headerTitle="Seleção do Catálogo">
        <Select
          label="Catálogo"
          options={catalogos.map(c => ({ value: String(c.id), label: c.nome }))}
          value={catalogoId}
          onChange={e => setCatalogoId(e.target.value)}
        />
      </Card>

      {catalogoId && (
        <>
          <Card className="mb-6" headerTitle="Dados da NCM">
            <div className="grid grid-cols-3 gap-4">
              <Input label="NCM" value={ncm} onChange={e => setNcm(e.target.value)} />
              <Input label="Modalidade" value={modalidade} onChange={e => setModalidade(e.target.value)} />
              <div className="flex items-end">
                <Button type="button" onClick={carregarEstrutura}>Carregar Estrutura</Button>
              </div>
            </div>
          </Card>

          <Card className="mb-6" headerTitle="Dados do Produto">
            <Tabs
              tabs={[
                {
                  id: 'fixos',
                  label: 'Dados Fixos',
                  content: (
                    <div className="grid grid-cols-3 gap-4">
                      <Input label="Código" value={codigo} disabled />
                    </div>
                  )
                },
                {
                  id: 'dinamicos',
                  label: 'Atributos Dinâmicos',
                  content: (
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      {estrutura.map(attr => renderCampo(attr))}
                    </div>
                  )
                }
              ]}
            />
          </Card>

          <Button type="button" onClick={salvar}>Salvar Produto</Button>
        </>
      )}
    </DashboardLayout>
  );
}
