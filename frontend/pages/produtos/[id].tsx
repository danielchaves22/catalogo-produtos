// frontend/pages/produtos/[id].tsx - edição de produto
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
import { PageLoader } from '@/components/ui/PageLoader';
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

export default function EditarProdutoPage() {
  const [catalogoNome, setCatalogoNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [ncm, setNcm] = useState('');
  const [ncmDescricao, setNcmDescricao] = useState('');
  const [modalidade, setModalidade] = useState('IMPORTACAO');
  const [estrutura, setEstrutura] = useState<AtributoEstrutura[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const router = useRouter();
  const { id } = router.query;

  const tituloSelecionado = React.useMemo(() => {
    if (!catalogoNome) return 'Catálogo / NCM';
    if (!ncm) return `Catálogo ${catalogoNome} / NCM`;
    if (!ncmDescricao) return `Catálogo ${catalogoNome} / NCM ${ncm}`;
    return `Catálogo ${catalogoNome} / NCM ${ncm} - ${ncmDescricao}`;
  }, [catalogoNome, ncm, ncmDescricao]);

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
    const response = await api.get(`/siscomex/atributos/ncm/${ncm}?modalidade=${modalidade}`);
    const dados: AtributoEstrutura[] = response.data.dados || [];
    setNcmDescricao(response.data.descricaoNcm || '');
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
              attr.dominio?.map(d => ({ value: d.codigo, label: d.descricao })) || []
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

  async function carregarProduto(produtoId: string) {
    try {
      const response = await api.get(`/produtos/${produtoId}`);
      const dados = response.data;
      setCodigo(dados.codigo);
      setCatalogoNome(dados.catalogo?.nome || '');
      setNcm(dados.ncmCodigo);
      setModalidade(dados.modalidade);
      try {
        const resp = await api.get(
          `/siscomex/atributos/ncm/${dados.ncmCodigo}?modalidade=${dados.modalidade}`
        );
        setNcmDescricao(resp.data.descricaoNcm || '');
      } catch (e) {
        setNcmDescricao('');
      }
      const estr = dados.atributos?.[0]?.estruturaSnapshotJson || [];
      setEstrutura(ordenarAtributos(estr));
      setValores(dados.atributos?.[0]?.valoresJson || {});
    } catch (error) {
      console.error('Erro ao carregar produto:', error);
      addToast('Erro ao carregar produto', 'error');
      router.push('/produtos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (router.isReady && typeof id === 'string') {
      carregarProduto(id);
    }
  }, [router.isReady, id]);

  async function salvar() {
    try {
      await api.put(`/produtos/${id}`, {
        modalidade,
        valoresAtributos: valores
      });
      addToast('Produto atualizado com sucesso!', 'success');
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
      addToast(`Erro de validação: ${details}`, 'error');
    } else if (error.response?.data?.error) {
      addToast(error.response.data.error, 'error');
    } else {
      addToast('Erro ao salvar produto', 'error');
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Editar Produto">
        <PageLoader message="Carregando produto..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Editar Produto">
      <Card className="mb-6" headerTitle="Seleção do Catálogo" headerSubtitle={tituloSelecionado}>
        <div className="grid grid-cols-3 gap-4">
          <Input label="Catálogo" value={catalogoNome} disabled />
          <Input label="NCM" value={ncm} disabled />
          <Select
            label="Modalidade"
            options={[
              { value: 'IMPORTACAO', label: 'IMPORTACAO' },
              { value: 'EXPORTACAO', label: 'EXPORTACAO' }
            ]}
            value={modalidade}
            onChange={e => setModalidade(e.target.value)}
          />
          <div className="flex items-end">
            <Button type="button" onClick={carregarEstrutura}>Carregar Estrutura</Button>
          </div>
        </div>
      </Card>

      <Card className="mb-6">
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

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.push('/produtos')}>Cancelar</Button>
        <Button type="button" onClick={salvar}>Salvar Produto</Button>
      </div>
    </DashboardLayout>
  );
}
