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
import { Trash2 } from 'lucide-react';
import { useOperadorEstrangeiro, OperadorEstrangeiro } from '@/hooks/useOperadorEstrangeiro';
import { OperadorEstrangeiroSelector } from '@/components/operadores-estrangeriros/OperadorEstrangeiroSelector';

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
  const [codigosInternos, setCodigosInternos] = useState<string[]>([]);
  const [novoCodigoInterno, setNovoCodigoInterno] = useState('');
  const [operadores, setOperadores] = useState<Array<{ paisCodigo: string; conhecido: string; operador?: OperadorEstrangeiro | null }>>([]);
  const [novoOperador, setNovoOperador] = useState<{ paisCodigo: string; conhecido: string; operador?: OperadorEstrangeiro | null }>({ paisCodigo: '', conhecido: 'nao', operador: undefined });
  const [selectorOpen, setSelectorOpen] = useState(false);
  const { getPaisOptions } = useOperadorEstrangeiro();
  const [ncm, setNcm] = useState('');
  const [ncmDescricao, setNcmDescricao] = useState('');
  const [modalidade, setModalidade] = useState('IMPORTACAO');
  const [estrutura, setEstrutura] = useState<AtributoEstrutura[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const router = useRouter();
  const { id } = router.query;

  // Texto do cabeçalho removido conforme novo layout

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

  function adicionarCodigoInterno() {
    if (!novoCodigoInterno.trim()) return;
    setCodigosInternos(prev => [...prev, novoCodigoInterno.trim()]);
    setNovoCodigoInterno('');
  }

  function adicionarOperador() {
    if (!novoOperador.paisCodigo) return;
    if (novoOperador.conhecido === 'sim' && !novoOperador.operador) return;
    setOperadores(prev => [...prev, { ...novoOperador }]);
    setNovoOperador({ paisCodigo: '', conhecido: 'nao', operador: undefined });
  }

  function removerOperador(index: number) {
    setOperadores(prev => prev.filter((_, i) => i !== index));
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
      setCodigosInternos(dados.codigosInternos || []);
      setOperadores(
        (dados.operadoresEstrangeiros || []).map((o: any) => ({
          paisCodigo: o.paisCodigo,
          conhecido: o.conhecido ? 'sim' : 'nao',
          operador: o.operadorEstrangeiro || null
        }))
      );
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
        valoresAtributos: valores,
        codigosInternos,
        operadoresEstrangeiros: operadores.map(o => ({
          paisCodigo: o.paisCodigo,
          conhecido: o.conhecido === 'sim',
          operadorEstrangeiroId: o.operador?.id
        }))
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
      <Card className="mb-6" headerTitle="Seleção do Catálogo">
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
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <Input label="Código" value={codigo || '-'} disabled />

                  <div className="col-span-3 mt-2">
                    <label className="block text-sm font-medium mb-1 text-gray-300">
                      Código Interno
                    </label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={novoCodigoInterno}
                        onChange={e => setNovoCodigoInterno(e.target.value)}
                        className="mb-0 flex-1"
                      />
                      <Button type="button" onClick={adicionarCodigoInterno}>+ Incluir</Button>
                    </div>
                    {codigosInternos.length > 0 && (
                      <ul className="list-disc list-inside text-gray-300">
                        {codigosInternos.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <Card headerTitle="Operadores Estrangeiros" className="mt-4">
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <Select
                        label="País"
                        options={getPaisOptions()}
                        value={novoOperador.paisCodigo}
                        onChange={e => setNovoOperador(prev => ({ ...prev, paisCodigo: e.target.value }))}
                        className="mb-0"
                      />
                      <RadioGroup
                        label="Conhecido?"
                        options={[{ value: 'nao', label: 'Não' }, { value: 'sim', label: 'Sim' }]}
                        value={novoOperador.conhecido}
                        onChange={v => setNovoOperador(prev => ({ ...prev, conhecido: v }))}
                        className="mb-0"
                      />
                      {novoOperador.conhecido === 'sim' && (
                        <div className="flex items-end gap-2">
                          <Input label="Operador" value={novoOperador.operador?.nome || ''} readOnly className="flex-1" />
                          <Button type="button" onClick={() => setSelectorOpen(true)}>Buscar</Button>
                        </div>
                      )}
                    </div>
                    <Button type="button" onClick={adicionarOperador}>Vincular Operador</Button>

                    {operadores.length > 0 && (
                      <div className="overflow-x-auto mt-4">
                        <table className="w-full text-sm text-left">
                          <tbody>
                            {operadores.map((op, i) => (
                              <tr key={i} className="border-b border-gray-700">
                                <td className="px-4 py-2 w-16 text-center">
                                  <button className="p-1 text-gray-300 hover:text-red-500 transition-colors" onClick={() => removerOperador(i)}>
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                                <td className="px-4 py-2">
                                  {op.conhecido === 'sim' ? op.operador?.nome : 'Não informado'} - {op.paisCodigo}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
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
      {selectorOpen && (
        <OperadorEstrangeiroSelector
          onSelect={op => { setNovoOperador(prev => ({ ...prev, operador: op })); setSelectorOpen(false); }}
          onCancel={() => setSelectorOpen(false)}
          selectedOperadores={[]}
        />
      )}
    </DashboardLayout>
  );
}
