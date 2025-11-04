import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import ReactDOM from 'react-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MaskedInput } from '@/components/ui/MaskedInput';
import { Select } from '@/components/ui/Select';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import {
  algumValorIgual,
  algumValorSatisfazCondicao,
  isValorPreenchido,
  normalizarValoresMultivalorados
} from '@/lib/atributos';
import useDebounce from '@/hooks/useDebounce';
import { ArrowLeft, CheckCircle2, Loader2, Plus, Save, Search, X } from 'lucide-react';
import { formatCPFOrCNPJ } from '@/lib/validation';

interface AtributoEstrutura {
  codigo: string;
  nome: string;
  tipo: string;
  obrigatorio: boolean;
  multivalorado?: boolean;
  dominio?: { codigo: string; descricao: string }[];
  validacoes?: {
    tamanho_maximo?: number;
    mascara?: string;
    [key: string]: any;
  };
  descricaoCondicao?: string;
  condicao?: any;
  parentCodigo?: string;
  condicionanteCodigo?: string;
  orientacaoPreenchimento?: string;
  subAtributos?: AtributoEstrutura[];
}

interface CatalogoResumo {
  id: number;
  nome: string;
  numero: number;
  cpf_cnpj: string | null;
}

interface ProdutoBuscaItem {
  id: number;
  codigo: string | null;
  denominacao: string;
  catalogoId: number;
  catalogoNome?: string | null;
  catalogoNumero?: number | null;
  catalogoCpfCnpj?: string | null;
}

interface ProdutosResponse {
  items: ProdutoBuscaItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface PreenchimentoMassaAgendamentoResponse {
  jobId: number;
  mensagem?: string;
}

function formatarNCMExibicao(codigo?: string) {
  if (!codigo) return '';
  const digits = String(codigo).replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return digits.replace(/(\d{4})(\d{1,2})/, '$1.$2');
  return digits.replace(/(\d{4})(\d{2})(\d{1,2})/, '$1.$2.$3');
}

function ordenarAtributos(estrutura: AtributoEstrutura[]): AtributoEstrutura[] {
  const resultado: AtributoEstrutura[] = [];
  const visitados = new Set<string>();
  const mapa = new Map<string, AtributoEstrutura>();

  for (const attr of estrutura) {
    mapa.set(attr.codigo, attr);
  }

  function inserir(attr: AtributoEstrutura) {
    if (visitados.has(attr.codigo)) return;
    if (attr.parentCodigo && mapa.has(attr.parentCodigo)) {
      const parent = mapa.get(attr.parentCodigo)!;
      inserir(parent);
      if (!visitados.has(attr.codigo)) {
        visitados.add(attr.codigo);
        resultado.push(attr);
      }
      return;
    }
    visitados.add(attr.codigo);
    resultado.push(attr);
  }

  for (const attr of estrutura) {
    inserir(attr);
    if (attr.subAtributos?.length) {
      const filhosOrdenados = ordenarAtributos(attr.subAtributos);
      attr.subAtributos = filhosOrdenados;
    }
  }

  return resultado;
}

function coletarAtributos(estrutura: AtributoEstrutura[]) {
  const lista: AtributoEstrutura[] = [];
  const percorrer = (itens: AtributoEstrutura[]) => {
    for (const atributo of itens) {
      lista.push(atributo);
      if (atributo.subAtributos && atributo.subAtributos.length > 0) {
        percorrer(atributo.subAtributos);
      }
    }
  };
  percorrer(estrutura);
  return lista;
}

function formatarValorAtributo(atributo: AtributoEstrutura | undefined, valor: unknown): string {
  const valores = Array.isArray(valor) ? valor : [valor];
  return valores
    .map(item => {
      if (item === undefined || item === null) return '';
      const texto = String(item);
      if (!atributo) return texto;
      if (atributo.tipo === 'BOOLEANO') {
        if (texto === 'true') return 'Sim';
        if (texto === 'false') return 'Não';
      }
      if (atributo.tipo === 'LISTA_ESTATICA' && atributo.dominio) {
        const opcao = atributo.dominio.find(d => d.codigo === texto);
        if (opcao) return `${opcao.codigo} - ${opcao.descricao}`;
      }
      return texto;
    })
    .filter(Boolean)
    .join(', ');
}

export default function PreenchimentoMassaNovoPage() {
  const router = useRouter();
  const { addToast } = useToast();

  const [ncm, setNcm] = useState('');
  const [ncmDescricao, setNcmDescricao] = useState('');
  const [unidadeMedida, setUnidadeMedida] = useState('');
  const [modalidade, setModalidade] = useState<'IMPORTACAO' | 'EXPORTACAO'>('IMPORTACAO');
  const [estrutura, setEstrutura] = useState<AtributoEstrutura[]>([]);
  const [valores, setValores] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadingEstrutura, setLoadingEstrutura] = useState(false);
  const [estruturaCarregada, setEstruturaCarregada] = useState(false);
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);

  const [catalogos, setCatalogos] = useState<CatalogoResumo[]>([]);
  const [catalogosSelecionados, setCatalogosSelecionados] = useState<string[]>([]);
  const [carregandoCatalogos, setCarregandoCatalogos] = useState(false);

  const [ncmSugestoes, setNcmSugestoes] = useState<Array<{ codigo: string; descricao: string | null }>>([]);
  const [mostrarSugestoesNcm, setMostrarSugestoesNcm] = useState(false);
  const [carregandoSugestoesNcm, setCarregandoSugestoesNcm] = useState(false);
  const [ncmSugestoesMontadas, setNcmSugestoesMontadas] = useState(false);
  const debouncedNcm = useDebounce(ncm, 800);
  const ncmInputContainerRef = useRef<HTMLDivElement>(null);
  const ncmSugestoesPortalRef = useRef<HTMLDivElement>(null);
  const [ncmSugestoesPosicao, setNcmSugestoesPosicao] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0
  });

  const [produtoBusca, setProdutoBusca] = useState('');
  const [produtoSugestoes, setProdutoSugestoes] = useState<ProdutoBuscaItem[]>([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(false);
  const debouncedProdutoBusca = useDebounce(produtoBusca, 600);
  const [produtosExcecao, setProdutosExcecao] = useState<ProdutoBuscaItem[]>([]);

  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);

  const mapaEstrutura = useMemo(() => {
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

  const catalogoOptions = useMemo(
    () =>
      catalogos.map(catalogo => {
        const partes: string[] = [catalogo.nome];
        if (catalogo.numero) {
          partes.push(`Catálogo ${catalogo.numero}`);
        }
        if (catalogo.cpf_cnpj) {
          partes.push(formatCPFOrCNPJ(catalogo.cpf_cnpj));
        }

        return {
          value: String(catalogo.id),
          label: partes.join(' • ')
        };
      }),
    [catalogos]
  );

  useEffect(() => {
    let ativo = true;
    async function carregarCatalogosDisponiveis() {
      try {
        setCarregandoCatalogos(true);
        const resposta = await api.get<Array<CatalogoResumo>>('/catalogos');
        if (!ativo) return;
        setCatalogos(resposta.data || []);
      } catch (error) {
        if (!ativo) return;
        console.error('Erro ao carregar catálogos:', error);
        addToast('Erro ao carregar lista de catálogos', 'error');
      } finally {
        if (ativo) {
          setCarregandoCatalogos(false);
        }
      }
    }

    carregarCatalogosDisponiveis();
    return () => {
      ativo = false;
    };
  }, [addToast]);

  useEffect(() => {
    if (debouncedNcm.length >= 4 && debouncedNcm.length < 8) {
      let ativo = true;
      setCarregandoSugestoesNcm(true);
      setMostrarSugestoesNcm(true);

      api
        .get('/siscomex/ncm/sugestoes', { params: { prefixo: debouncedNcm } })
        .then(response => {
          if (!ativo) return;
          const lista = (response.data?.dados as Array<{ codigo: string; descricao: string | null }> | undefined) || [];
          setNcmSugestoes(lista);
          setMostrarSugestoesNcm(true);
        })
        .catch(error => {
          if (!ativo) return;
          console.error('Erro ao buscar sugestões de NCM:', error);
          setMostrarSugestoesNcm(false);
          setNcmSugestoes([]);
        })
        .finally(() => {
          if (!ativo) return;
          setCarregandoSugestoesNcm(false);
        });

      return () => {
        ativo = false;
      };
    }

    setNcmSugestoes([]);
    setMostrarSugestoesNcm(false);
    setCarregandoSugestoesNcm(false);
  }, [debouncedNcm]);

  useEffect(() => {
    setNcmSugestoesMontadas(true);
  }, []);

  const ncmSugestoesVisiveis = (carregandoSugestoesNcm || mostrarSugestoesNcm) && debouncedNcm.length >= 4;

  useLayoutEffect(() => {
    if (!ncmSugestoesVisiveis || typeof window === 'undefined') return;

    function atualizarPosicao() {
      const container = ncmInputContainerRef.current;
      if (!container) return;
      const input = container.querySelector('input');
      const referencia = input || container;
      const rect = referencia.getBoundingClientRect();
      setNcmSugestoesPosicao({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      });
    }

    atualizarPosicao();
    window.addEventListener('resize', atualizarPosicao);
    window.addEventListener('scroll', atualizarPosicao, true);
    return () => {
      window.removeEventListener('resize', atualizarPosicao);
      window.removeEventListener('scroll', atualizarPosicao, true);
    };
  }, [ncmSugestoesVisiveis]);

  useEffect(() => {
    if (!ncmSugestoesVisiveis || typeof document === 'undefined') return;

    function handleClickFora(event: MouseEvent) {
      const alvo = event.target as Node;
      if (ncmInputContainerRef.current?.contains(alvo)) return;
      if (ncmSugestoesPortalRef.current?.contains(alvo)) return;
      setMostrarSugestoesNcm(false);
    }

    document.addEventListener('mousedown', handleClickFora);
    return () => {
      document.removeEventListener('mousedown', handleClickFora);
    };
  }, [ncmSugestoesVisiveis]);

  useEffect(() => {
    let ativo = true;
    if (!debouncedProdutoBusca.trim()) {
      setProdutoSugestoes([]);
      return () => {
        ativo = false;
      };
    }

    async function carregarProdutos() {
      try {
        setCarregandoProdutos(true);
        const params: Record<string, string | number> = {
          busca: debouncedProdutoBusca,
          page: 1,
          pageSize: 5
        };
        if (ncm.replace(/\D/g, '').length === 8) {
          params.ncm = ncm.replace(/\D/g, '');
        }
        const resposta = await api.get<ProdutosResponse>('/produtos', { params });
        if (!ativo) return;
        setProdutoSugestoes(resposta.data.items || []);
      } catch (error) {
        if (!ativo) return;
        console.error('Erro ao buscar produtos para exceção:', error);
        setProdutoSugestoes([]);
      } finally {
        if (ativo) {
          setCarregandoProdutos(false);
        }
      }
    }

    carregarProdutos();
    return () => {
      ativo = false;
    };
  }, [debouncedProdutoBusca, ncm]);

  async function carregarEstrutura(ncmCodigo: string, modalidadeSelecionada: string) {
    if (ncmCodigo.length < 8) return;
    setLoadingEstrutura(true);
    try {
      const response = await api.get(`/siscomex/atributos/ncm/${ncmCodigo}?modalidade=${modalidadeSelecionada}`);
      if (!response.data.descricaoNcm) {
        addToast('NCM não encontrada', 'error');
        setEstruturaCarregada(false);
        setNcmDescricao('');
        setUnidadeMedida('');
        setEstrutura([]);
        setValores({});
        return;
      }

      const dados: AtributoEstrutura[] = response.data.dados || [];
      setNcmDescricao(response.data.descricaoNcm);
      setUnidadeMedida(response.data.unidadeMedida || '');
      const estruturaOrdenada = ordenarAtributos(dados);
      setEstrutura(estruturaOrdenada);
      setValores({});
      setEstruturaCarregada(true);
    } catch (error) {
      console.error('Erro ao carregar atributos da NCM:', error);
      addToast('Erro ao carregar atributos da NCM', 'error');
      setEstruturaCarregada(false);
      setEstrutura([]);
      setValores({});
    } finally {
      setLoadingEstrutura(false);
    }
  }

  useEffect(() => {
    const digits = ncm.replace(/\D/g, '');
    if (digits.length === 8) {
      carregarEstrutura(digits, modalidade);
    } else {
      setEstruturaCarregada(false);
      setEstrutura([]);
      setValores({});
    }
  }, [ncm, modalidade]);

  function handleValor(codigo: string, valor: string | string[]) {
    setValores(prev => ({ ...prev, [codigo]: valor }));
  }

  function condicaoAtendida(attr: AtributoEstrutura): boolean {
    const codigoCondicionante = attr.condicionanteCodigo || attr.parentCodigo;
    if (!codigoCondicionante) return true;

    const pai = mapaEstrutura.get(codigoCondicionante);
    if (pai && !condicaoAtendida(pai)) return false;

    const atual = valores[codigoCondicionante];
    if (!isValorPreenchido(atual)) return false;

    if (attr.condicao) {
      return algumValorSatisfazCondicao(attr.condicao, atual);
    }

    if (!attr.descricaoCondicao) return true;
    const regex = /valor\s*=\s*'?"?(\w+)"?'?/i;
    const match = attr.descricaoCondicao.match(regex);
    if (!match) return true;
    const esperado = match[1];
    return algumValorIgual(atual, esperado);
  }

  function renderCampo(attr: AtributoEstrutura): React.ReactNode {
    if (!condicaoAtendida(attr)) return null;

    const rawValue = valores[attr.codigo];
    const value = rawValue !== undefined && !Array.isArray(rawValue) ? String(rawValue) : '';

    switch (attr.tipo) {
      case 'LISTA_ESTATICA':
        if (attr.multivalorado) {
          return (
            <MultiSelect
              key={attr.codigo}
              label={attr.nome}
              hint={attr.orientacaoPreenchimento}
              required={attr.obrigatorio}
              options={
                attr.dominio?.map(d => ({
                  value: d.codigo,
                  label: `${d.codigo} - ${d.descricao}`
                })) || []
              }
              placeholder="Selecione..."
              values={normalizarValoresMultivalorados(rawValue)}
              onChange={vals => handleValor(attr.codigo, vals)}
            />
          );
        }
        return (
          <Select
            key={attr.codigo}
            label={attr.nome}
            hint={attr.orientacaoPreenchimento}
            required={attr.obrigatorio}
            value={value}
            options={
              attr.dominio?.map(opcao => ({
                value: opcao.codigo,
                label: `${opcao.codigo} - ${opcao.descricao}`
              })) || []
            }
            onChange={event => handleValor(attr.codigo, event.target.value)}
          />
        );
      case 'BOOLEANO':
        return (
          <RadioGroup
            key={attr.codigo}
            label={attr.nome}
            hint={attr.orientacaoPreenchimento}
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
      case 'NUMERO_REAL':
        return (
          <Input
            key={attr.codigo}
            type="number"
            label={attr.nome}
            hint={attr.orientacaoPreenchimento}
            required={attr.obrigatorio}
            value={value}
            step={attr.tipo === 'NUMERO_REAL' ? '0.01' : '1'}
            onChange={event => handleValor(attr.codigo, event.target.value)}
          />
        );
      case 'COMPOSTO':
        return (
          <div className="space-y-4">
            {attr.subAtributos?.map(sub => (
              <div key={sub.codigo}>{renderCampo(sub)}</div>
            ))}
          </div>
        );
      case 'TEXTO': {
        const max = attr.validacoes?.tamanho_maximo ?? undefined;
        const pattern = attr.validacoes?.mascara;
        if (pattern) {
          return (
            <MaskedInput
              key={attr.codigo}
              label={attr.nome}
              hint={attr.orientacaoPreenchimento}
              required={attr.obrigatorio}
              pattern={pattern}
              value={value}
              onChange={(valorLimpo, _formatado) => handleValor(attr.codigo, valorLimpo)}
            />
          );
        }
        return (
          <Input
            key={attr.codigo}
            label={attr.nome}
            hint={attr.orientacaoPreenchimento}
            required={attr.obrigatorio}
            value={value}
            maxLength={max}
            onChange={event => handleValor(attr.codigo, event.target.value)}
          />
        );
      }
      default:
        return (
          <Input
            key={attr.codigo}
            label={attr.nome}
            hint={attr.orientacaoPreenchimento}
            required={attr.obrigatorio}
            value={value}
            onChange={event => handleValor(attr.codigo, event.target.value)}
          />
        );
    }
  }

  function adicionarProdutoExcecao(produto: ProdutoBuscaItem) {
    if (produtosExcecao.some(item => item.id === produto.id)) {
      setProdutoBusca('');
      setProdutoSugestoes([]);
      return;
    }
    setProdutosExcecao(prev => [...prev, produto]);
    setProdutoBusca('');
    setProdutoSugestoes([]);
  }

  function removerProdutoExcecao(id: number) {
    setProdutosExcecao(prev => prev.filter(item => item.id !== id));
  }

  function validarFormulario(): boolean {
    const digits = ncm.replace(/\D/g, '');
    if (digits.length !== 8) {
      setErroFormulario('Informe uma NCM com 8 dígitos.');
      addToast('Informe uma NCM com 8 dígitos.', 'error');
      return false;
    }
    if (!estruturaCarregada || estrutura.length === 0) {
      setErroFormulario('Carregue os atributos da NCM antes de continuar.');
      addToast('Carregue os atributos da NCM antes de continuar.', 'error');
      return false;
    }

    const preenchidos = Object.entries(valores).filter(([, valor]) => isValorPreenchido(valor));
    if (preenchidos.length === 0) {
      setErroFormulario('Informe ao menos um atributo para aplicar em massa.');
      addToast('Informe ao menos um atributo para aplicar em massa.', 'error');
      return false;
    }

    setErroFormulario(null);
    return true;
  }

  function abrirConfirmacao() {
    if (!validarFormulario()) return;
    setConfirmacaoAberta(true);
  }

  async function confirmarAplicacao() {
    try {
      setLoading(true);
      const catalogoIdsPayload = Array.from(
        new Set(
          catalogosSelecionados
            .map(valor => Number(valor))
            .filter(valor => !Number.isNaN(valor))
        )
      );

      const atributosPreenchidos: Record<string, string | string[]> = {};
      for (const [codigo, valor] of Object.entries(valores)) {
        if (isValorPreenchido(valor)) {
          atributosPreenchidos[codigo] = valor;
        }
      }

      const resposta = await api.post<PreenchimentoMassaAgendamentoResponse>(
        '/automacao/atributos-massa',
        {
          ncmCodigo: ncm.replace(/\D/g, ''),
          modalidade,
          catalogoIds: catalogoIdsPayload.length ? catalogoIdsPayload : undefined,
          valoresAtributos: atributosPreenchidos,
          estruturaSnapshot: estrutura,
          produtosExcecao: produtosExcecao.map(item => ({ id: item.id }))
        }
      );

      const jobId = resposta.data?.jobId;
      const mensagemSucesso =
        resposta.data?.mensagem ||
        (jobId
          ? `Processo enfileirado com sucesso (Job #${jobId}). Acompanhe em Processos Assíncronos.`
          : 'Processo de preenchimento em massa enfileirado. Acompanhe em Processos Assíncronos.');
      addToast(mensagemSucesso, 'success');
      router.push('/automacao/atributos-massa');
    } catch (error: any) {
      console.error('Erro ao aplicar atributos em massa:', error);
      const mensagem = error.response?.data?.error || 'Erro ao aplicar atributos em massa';
      addToast(mensagem, 'error');
    } finally {
      setLoading(false);
      setConfirmacaoAberta(false);
    }
  }

  function cancelar() {
    router.push('/automacao/atributos-massa');
  }

  const atributosPreenchidosLista = useMemo(() => {
    const preenchidos: Array<{ atributo: AtributoEstrutura | undefined; valor: unknown }> = [];
    for (const [codigo, valor] of Object.entries(valores)) {
      if (!isValorPreenchido(valor)) continue;
      preenchidos.push({ atributo: mapaEstrutura.get(codigo), valor });
    }
    return preenchidos;
  }, [valores, mapaEstrutura]);

  return (
    <DashboardLayout title="Preencher Atributos em Massa">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao/importar-produto' },
          { label: 'Preencher Atributos em Massa', href: '/automacao/atributos-massa' },
          { label: 'Nova atribuição' }
        ]}
      />

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <button onClick={cancelar} className="text-gray-400 transition-colors hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-semibold text-white">Nova atribuição em massa</h1>
        </div>
        <div className="flex items-center gap-3 self-end md:self-auto">
          <Button type="button" variant="outline" onClick={cancelar} disabled={loading}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="accent"
            className="flex items-center gap-2"
            onClick={abrirConfirmacao}
            disabled={loading}
          >
            <Save size={16} />
            Revisar e aplicar
          </Button>
        </div>
      </div>

      {erroFormulario && <p className="mb-4 rounded border border-red-500 bg-red-500/10 p-3 text-sm text-red-300">{erroFormulario}</p>}

      <div className="grid gap-6">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-white">Parâmetros da atribuição</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="grid gap-4 md:grid-cols-5">
                  <div className="md:col-span-1">
                    <div className="relative" ref={ncmInputContainerRef}>
                      <MaskedInput
                        label="NCM"
                        mask="ncm"
                        value={ncm}
                        onChange={valorLimpo => {
                          setNcm(valorLimpo);
                        }}
                        placeholder="Digite a NCM"
                        className="mb-0"
                        autoComplete="off"
                        onFocus={() => {
                          if (ncm.length >= 4 && ncm.length < 8 && ncmSugestoes.length > 0) {
                            setMostrarSugestoesNcm(true);
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => setMostrarSugestoesNcm(false), 100);
                        }}
                      />
                    </div>
                  </div>

                  <Input
                    label="Descrição NCM"
                    value={ncmDescricao || ''}
                    disabled
                    className="md:col-span-3"
                  />

                  <Input
                    label="Unidade de medida estatística"
                    value={unidadeMedida || ''}
                    disabled
                    className="md:col-span-1"
                  />
                </div>
              </div>

              <Select
                label="Modalidade"
                value={modalidade}
                options={[
                  { value: 'IMPORTACAO', label: 'Importação' },
                  { value: 'EXPORTACAO', label: 'Exportação' }
                ]}
                onChange={event => setModalidade(event.target.value as 'IMPORTACAO' | 'EXPORTACAO')}
              />

              <MultiSelect
                label="Catálogos"
                hint="Caso nenhum catálogo seja selecionado, a atribuição afetará todos os catálogos disponíveis."
                placeholder={
                  carregandoCatalogos
                    ? 'Carregando catálogos...'
                    : catalogoOptions.length === 0
                    ? 'Nenhum catálogo disponível'
                    : 'Selecione os catálogos (opcional)'
                }
                options={catalogoOptions}
                values={catalogosSelecionados}
                onChange={valores => setCatalogosSelecionados(valores)}
              />
            </div>
          </Card>

          {ncmSugestoesMontadas &&
            ncmSugestoesVisiveis &&
            typeof document !== 'undefined' &&
            ReactDOM.createPortal(
              <div
                ref={ncmSugestoesPortalRef}
                className="z-[9999] max-h-64 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
                style={{ position: 'fixed', top: ncmSugestoesPosicao.top, left: ncmSugestoesPosicao.left, width: ncmSugestoesPosicao.width }}
              >
                {carregandoSugestoesNcm && (
                  <p className="px-3 py-2 text-sm text-gray-400">Carregando sugestões...</p>
                )}
                {!carregandoSugestoesNcm && ncmSugestoes.length === 0 && (
                  <p className="px-3 py-2 text-sm text-gray-500">Nenhuma sugestão encontrada.</p>
                )}
                {!carregandoSugestoesNcm &&
                  ncmSugestoes.map(item => (
                    <button
                      key={item.codigo}
                      className="flex w-full flex-col items-start px-3 py-2 text-left text-sm text-gray-200 transition-colors hover:bg-gray-800"
                      type="button"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => {
                        setNcm(item.codigo);
                        setMostrarSugestoesNcm(false);
                      }}
                    >
                      <span className="font-medium">{formatarNCMExibicao(item.codigo)}</span>
                      <span className="text-gray-400">{item.descricao || '-'}</span>
                    </button>
                  ))}
              </div>,
              document.body
            )}

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Valores dos atributos</h2>
              {loadingEstrutura && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 size={16} className="animate-spin" />
                  Carregando estrutura
                </div>
              )}
            </div>

            {!estruturaCarregada && (
              <p className="text-sm text-gray-400">
                Informe uma NCM válida para carregar os atributos disponíveis.
              </p>
            )}

            {estruturaCarregada && estrutura.length === 0 && (
              <p className="text-sm text-gray-400">
                Nenhum atributo disponível para a combinação informada.
              </p>
            )}

            {estruturaCarregada && estrutura.length > 0 && (
              <div className="grid gap-4">
                {coletarAtributos(estrutura)
                  .filter(attr => !attr.parentCodigo || mapaEstrutura.get(attr.parentCodigo)?.tipo === 'COMPOSTO')
                  .map(attr => {
                    const isComposto = attr.tipo === 'COMPOSTO';
                    if (!isComposto) {
                      return <div key={attr.codigo}>{renderCampo(attr)}</div>;
                    }
                    return (
                      <div key={attr.codigo} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-white">{attr.nome}</p>
                            {attr.orientacaoPreenchimento && (
                              <p className="text-xs text-gray-400">{attr.orientacaoPreenchimento}</p>
                            )}
                          </div>
                          {attr.obrigatorio && (
                            <span className="text-xs font-semibold uppercase text-amber-400">Obrigatório</span>
                          )}
                        </div>
                        <div className="space-y-4">{renderCampo(attr)}</div>
                      </div>
                    );
                  })}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-white">Produtos como exceção</h2>
            <p className="mb-4 text-sm text-gray-400">
              Os produtos selecionados abaixo não terão os atributos atualizados.
            </p>

            <div className="mb-4">
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-300">
                <Search size={16} /> Produtos (nome ou código)
              </label>
              <Input
                value={produtoBusca}
                onChange={event => setProdutoBusca(event.target.value)}
                placeholder="Digite para buscar produtos"
              />
              {carregandoProdutos && <p className="mt-2 text-xs text-gray-400">Buscando produtos...</p>}
              {!carregandoProdutos && produtoSugestoes.length > 0 && (
                <div className="mt-2 space-y-2">
                  {produtoSugestoes.map(item => (
                    <button
                      key={item.id}
                      className="flex w-full items-center justify-between rounded border border-gray-800 bg-gray-900 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800"
                      onClick={() => adicionarProdutoExcecao(item)}
                    >
                      <div>
                        <p className="font-semibold">{item.denominacao}</p>
                        <p className="text-xs text-gray-400">
                          {item.codigo ? `Código: ${item.codigo}` : 'Sem código interno'} •{' '}
                          {item.catalogoNome || 'Catálogo desconhecido'}
                          {item.catalogoNumero ? ` • Catálogo ${item.catalogoNumero}` : ''}
                        </p>
                      </div>
                      <Plus size={16} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {produtosExcecao.length > 0 ? (
              <div className="space-y-3">
                {produtosExcecao.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200"
                  >
                    <div>
                      <p className="font-semibold">{item.denominacao}</p>
                      <p className="text-xs text-gray-400">
                        {item.codigo ? `Código: ${item.codigo}` : 'Sem código interno'}
                        {item.catalogoNome ? ` • ${item.catalogoNome}` : ''}
                        {item.catalogoNumero ? ` • Catálogo ${item.catalogoNumero}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex h-8 w-8 items-center justify-center"
                      onClick={() => removerProdutoExcecao(item.id)}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Nenhum produto marcado como exceção.</p>
            )}
          </Card>
        </div>

      </div>

      {confirmacaoAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <CheckCircle2 size={32} className="text-emerald-400" />
              <div>
                <h2 className="text-xl font-semibold text-white">Confirmar atribuição em massa</h2>
                <p className="text-sm text-gray-400">
                  Revise as informações abaixo antes de aplicar os atributos.
                </p>
              </div>
            </div>

            <div className="space-y-4 text-sm text-gray-200">
              <div className="rounded border border-gray-800 bg-gray-950 p-4">
                <p><span className="text-gray-400">NCM:</span> {formatarNCMExibicao(ncm)}</p>
                <p>
                  <span className="text-gray-400">Modalidade:</span> {modalidade === 'IMPORTACAO' ? 'Importação' : 'Exportação'}
                </p>
                <p>
                  <span className="text-gray-400">Catálogos:</span>{' '}
                  {catalogosSelecionados.length > 0 ? (
                    catalogos
                      .filter(cat => catalogosSelecionados.includes(String(cat.id)))
                      .map(cat => cat.nome)
                      .join(', ')
                  ) : (
                    <span className="font-semibold text-amber-400">
                      Nenhum catálogo selecionado — todos os catálogos serão atualizados.
                    </span>
                  )}
                </p>
                <p>
                  <span className="text-gray-400">Produtos como exceção:</span> {produtosExcecao.length}
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
                  Atributos que serão atualizados
                </h3>
                {atributosPreenchidosLista.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhum atributo preenchido.</p>
                ) : (
                  <ul className="space-y-2">
                    {atributosPreenchidosLista.map(({ atributo, valor }) => (
                      <li key={atributo?.codigo || String(valor)} className="rounded border border-gray-800 bg-gray-950 p-3">
                        <p className="font-semibold text-white">{atributo?.nome || atributo?.codigo || 'Atributo'}</p>
                        <p className="text-sm text-gray-300">{formatarValorAtributo(atributo, valor)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {produtosExcecao.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
                    Produtos que serão mantidos sem alteração
                  </h3>
                  <ul className="space-y-2">
                    {produtosExcecao.map(item => (
                      <li key={item.id} className="rounded border border-gray-800 bg-gray-950 p-3">
                        <p className="font-semibold text-white">{item.denominacao}</p>
                        <p className="text-xs text-gray-400">
                          {item.codigo ? `Código: ${item.codigo}` : 'Sem código'}
                          {item.catalogoNome ? ` • ${item.catalogoNome}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setConfirmacaoAberta(false)} disabled={loading}>
                Voltar
              </Button>
              <Button
                variant="accent"
                className="flex items-center gap-2"
                onClick={confirmarAplicacao}
                disabled={loading}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Confirmar aplicação
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
