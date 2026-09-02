// frontend/pages/produtos/[id].tsx
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { MaskedInput } from '@/components/ui/MaskedInput';
import { Select } from '@/components/ui/Select';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/ToastContext';
import { useRouter } from 'next/router';
import api, { NCM_ATTRIBUTES_TIMEOUT_MS } from '@/lib/api';
import { PageLoader } from '@/components/ui/PageLoader';
import { formatCPFOrCNPJ, formatCEP } from '@/lib/validation';
import {
  algumValorIgual,
  algumValorSatisfazCondicao,
  isValorPreenchido,
  normalizarValoresMultivalorados
} from '@/lib/atributos';
import { Trash2, BrainCog, ArrowLeft, Save, RefreshCw } from 'lucide-react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useOperadorEstrangeiro, OperadorEstrangeiro } from '@/hooks/useOperadorEstrangeiro';
import { OperadorEstrangeiroSelector } from '@/components/operadores-estrangeriros/OperadorEstrangeiroSelector';
import { Hint } from '@/components/ui/Hint';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { useAuth } from '@/contexts/AuthContext';
import useDebounce from '@/hooks/useDebounce';

const DESCRICAO_MAX_LENGTH = 3700;
const DENOMINACAO_MAX_LENGTH = 120;
const MAX_TENTATIVAS_IA = 2;
const APP_ENV_PUBLICO = (process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || '')
  .trim()
  .toLowerCase();
const EXIBIR_CODIGO_ATRIBUTO =
  APP_ENV_PUBLICO !== 'prod' && APP_ENV_PUBLICO !== 'production';

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

interface AtributoParaIa {
  codigo: string;
  nome: string;
  tipo: string;
  obrigatorio?: boolean;
  multivalorado?: boolean;
  dominio: { codigo: string; descricao?: string | null }[];
  validacoes?: Record<string, unknown>;
  condicao?: any;
  descricaoCondicao?: string;
  parentCodigo?: string;
  condicionanteCodigo?: string;
}

interface HistoricoMudanca {
  path: string;
  op: 'add' | 'remove' | 'replace';
  before?: unknown;
  after?: unknown;
  label?: string;
}

interface HistoricoProdutoItem {
  id: number;
  versaoSiscomex: string;
  tipoEvento: string;
  resumo: string | null;
  criadoEm: string;
  delta: {
    schemaVersion: number;
    changes: HistoricoMudanca[];
  } | null;
}

function formatarTipoEvento(tipoEvento: string) {
  const tipoEventoLabelMap: Record<string, string> = {
    CRIACAO: 'CRIAÇÃO',
    ATUALIZACAO: 'ATUALIZAÇÃO',
    RETIFICACAO: 'RETIFICAÇÃO',
  };

  return tipoEventoLabelMap[tipoEvento] ?? tipoEvento;
}

function formatarOperacaoDelta(op: string) {
  const operacaoDeltaLabelMap: Record<string, string> = {
    add: 'adicionado',
    remove: 'removido',
    replace: 'atualizado',
  };

  return operacaoDeltaLabelMap[op] ?? op;
}

function serializarEstadoFormularioProduto(params: {
  catalogoId: string;
  modalidade: string;
  ncm: string;
  denominacao: string;
  descricao: string;
  codigosInternos: string[];
  operadores: Array<{ paisCodigo: string; conhecido: string; operador?: OperadorEstrangeiro | null }>;
  valores: Record<string, string | string[]>;
}) {
  const valoresNormalizados = Object.entries(params.valores || {})
    .sort(([codigoA], [codigoB]) => codigoA.localeCompare(codigoB))
    .reduce<Record<string, string | string[]>>((acc, [codigo, valor]) => {
      if (Array.isArray(valor)) {
        acc[codigo] = [...valor].map(item => String(item)).sort();
      } else {
        acc[codigo] = String(valor ?? '');
      }
      return acc;
    }, {});

  const operadoresNormalizados = params.operadores
    .map(item => ({
      paisCodigo: item.paisCodigo,
      conhecido: item.conhecido,
      operadorEstrangeiroId: item.operador?.id ?? null,
    }))
    .sort((a, b) => {
      const pais = a.paisCodigo.localeCompare(b.paisCodigo);
      if (pais !== 0) return pais;
      const operadorA = a.operadorEstrangeiroId ?? 0;
      const operadorB = b.operadorEstrangeiroId ?? 0;
      if (operadorA !== operadorB) return operadorA - operadorB;
      return a.conhecido.localeCompare(b.conhecido);
    });

  const payload = {
    catalogoId: params.catalogoId || '',
    modalidade: params.modalidade || '',
    ncm: params.ncm || '',
    denominacao: params.denominacao || '',
    descricao: params.descricao || '',
    codigosInternos: (params.codigosInternos || []).map(item => item.trim()).filter(Boolean).sort(),
    operadores: operadoresNormalizados,
    valores: valoresNormalizados,
  };

  return JSON.stringify(payload);
}

function normalizarTextoComparacao(valor: unknown) {
  return String(valor ?? '').replace(/\s+/g, ' ').trim();
}

export default function ProdutoPage() {
  const [catalogoId, setCatalogoId] = useState('');
  const [catalogoNome, setCatalogoNome] = useState('');
  const [catalogoCnpj, setCatalogoCnpj] = useState('');
  const [codigo, setCodigo] = useState('');
  const [versaoProduto, setVersaoProduto] = useState<string | null>(null);
  const [codigosInternos, setCodigosInternos] = useState<string[]>([]);
  const [novoCodigoInterno, setNovoCodigoInterno] = useState('');
  const [operadores, setOperadores] = useState<Array<{ paisCodigo: string; conhecido: string; operador?: OperadorEstrangeiro | null }>>([]);
  const [novoOperador, setNovoOperador] = useState<{ paisCodigo: string; conhecido: string; operador?: OperadorEstrangeiro | null }>({ paisCodigo: '', conhecido: 'nao', operador: undefined });
  const [operadoresCatalogo, setOperadoresCatalogo] = useState<OperadorEstrangeiro[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [operadorErro, setOperadorErro] = useState<{ paisCodigo?: string; operador?: string }>({});
  const { getPaisOptions, buscarOperadorPorId, getPaisNome, buscarOperadores } = useOperadorEstrangeiro();
  const [catalogos, setCatalogos] = useState<Array<{ id: number; nome: string; cpf_cnpj: string | null }>>([]);
  const [ncm, setNcm] = useState('');
  const [ncmDescricao, setNcmDescricao] = useState('');
  const [unidadeMedida, setUnidadeMedida] = useState('');
  const [modalidade, setModalidade] = useState('IMPORTACAO');
  const [denominacao, setDenominacao] = useState('');
  const [descricao, setDescricao] = useState('');
  const [estrutura, setEstrutura] = useState<AtributoEstrutura[]>([]);
  const [valores, setValores] = useState<Record<string, string | string[]>>({});
  const [loadingEstrutura, setLoadingEstrutura] = useState(false);
  const [estruturaCarregada, setEstruturaCarregada] = useState(false);
  const [activeTab, setActiveTab] = useState('informacoes');
  const [loading, setLoading] = useState(false);
  const [historico, setHistorico] = useState<HistoricoProdutoItem[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [historicoCarregado, setHistoricoCarregado] = useState(false);
  const [historicoExpandido, setHistoricoExpandido] = useState<Record<number, boolean>>({});
  const { addToast } = useToast();
  const router = useRouter();
  const { id } = router.query;
  const isNew = !id || id === 'novo';
  const { workingCatalog } = useWorkingCatalog();

  const [attrsFaltando, setAttrsFaltando] = useState<string[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ncmSugestoes, setNcmSugestoes] = useState<Array<{ codigo: string; descricao: string | null }>>([]);
  const [mostrarSugestoesNcm, setMostrarSugestoesNcm] = useState(false);
  const [carregandoSugestoesNcm, setCarregandoSugestoesNcm] = useState(false);
  const debouncedNcm = useDebounce(ncm, 1000);
  const [gerandoSugestoesIa, setGerandoSugestoesIa] = useState(false);
  const [resumoSugestoesIa, setResumoSugestoesIa] = useState<string | null>(null);
  const [iaJaSolicitada, setIaJaSolicitada] = useState(false);
  const [limpezaInicialIaRealizada, setLimpezaInicialIaRealizada] = useState(false);
  const [situacaoProduto, setSituacaoProduto] = useState<'RASCUNHO' | 'ATIVADO' | 'DESATIVADO'>('RASCUNHO');
  const [statusProduto, setStatusProduto] = useState<string | null>(null);
  const [denominacaoOriginal, setDenominacaoOriginal] = useState('');
  const [assinaturaInicialFormulario, setAssinaturaInicialFormulario] = useState('');
  const [inativacaoModalAberta, setInativacaoModalAberta] = useState(false);
  const [inativandoProduto, setInativandoProduto] = useState(false);
  const [reativacaoEmEdicao, setReativacaoEmEdicao] = useState(false);
  const [reativandoProduto, setReativandoProduto] = useState(false);
  const [reativacaoEnfileirada, setReativacaoEnfileirada] = useState<{
    transmissaoId: number;
    mensagem: string;
  } | null>(null);
  const { user } = useAuth();

  const podeSugerirComIa = Boolean(user);
  const produtoDesativado = !isNew && situacaoProduto === 'DESATIVADO';
  const produtoSomenteLeitura = produtoDesativado && !reativacaoEmEdicao;
  const produtoTransmitido = !isNew && situacaoProduto !== 'RASCUNHO' && codigo.trim().length > 0;
  const podeInativarProduto = produtoTransmitido && situacaoProduto === 'ATIVADO';
  const podeReativarProduto =
    produtoDesativado &&
    !reativacaoEmEdicao &&
    codigo.trim().length > 0 &&
    (statusProduto === 'APROVADO' || statusProduto === 'TRANSMITIDO');
  const denominacaoAlteradaParaReativacao =
    normalizarTextoComparacao(denominacao) !== normalizarTextoComparacao(denominacaoOriginal);

  const assinaturaFormularioAtual = React.useMemo(
    () =>
      serializarEstadoFormularioProduto({
        catalogoId,
        modalidade,
        ncm,
        denominacao,
        descricao,
        codigosInternos,
        operadores,
        valores,
      }),
    [catalogoId, modalidade, ncm, denominacao, descricao, codigosInternos, operadores, valores]
  );

  const formularioAlterado =
    !isNew &&
    assinaturaInicialFormulario.length > 0 &&
    assinaturaFormularioAtual !== assinaturaInicialFormulario;

  // Format NCM code for display (9999.99.99)
  function formatarNCMExibicao(codigo?: string) {
    if (!codigo) return '';
    const digits = String(codigo).replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return digits.replace(/(\d{4})(\d{1,2})/, '$1.$2');
    return digits.replace(/(\d{4})(\d{2})(\d{1,2})/, '$1.$2.$3');
  }

  function formatarSituacaoProduto(situacao: typeof situacaoProduto) {
    switch (situacao) {
      case 'ATIVADO':
        return 'Ativado';
      case 'DESATIVADO':
        return 'Desativado';
      default:
        return 'Rascunho';
    }
  }

  // Texto do cabeçalho removido conforme novo layout

  useEffect(() => {
    if (!isNew || workingCatalog) return;
    async function carregarCatalogos() {
      const res = await api.get('/catalogos');
      setCatalogos(res.data);
    }
    carregarCatalogos();
  }, [isNew, workingCatalog]);

  useEffect(() => {
    setResumoSugestoesIa(null);
    setIaJaSolicitada(false);
    setLimpezaInicialIaRealizada(false);
    setSituacaoProduto('RASCUNHO');
    setStatusProduto(null);
    setVersaoProduto(null);
    setDenominacaoOriginal('');
    setAssinaturaInicialFormulario('');
    setInativacaoModalAberta(false);
    setReativacaoEmEdicao(false);
    setReativacaoEnfileirada(null);
    setReativandoProduto(false);
    setInativandoProduto(false);
    setHistorico([]);
    setHistoricoCarregado(false);
    setHistoricoExpandido({});
  }, [id]);

  useEffect(() => {
    if (isNew && workingCatalog) {
      setCatalogoId(String(workingCatalog.id));
      setCatalogoNome(workingCatalog.nome);
      setCatalogoCnpj(workingCatalog.cpf_cnpj || '');
    } else if (isNew && !workingCatalog) {
      setCatalogoId('');
      setCatalogoNome('');
      setCatalogoCnpj('');
    }
  }, [workingCatalog, isNew]);

  useEffect(() => {
    if (!isNew) return;
    if (!catalogoId) {
      setValores({});
      return;
    }
    if (ncm.length === 8) {
      carregarEstrutura(ncm);
    }
  }, [catalogoId, isNew, ncm]);

  useEffect(() => {
    if (!catalogoCnpj) {
      setOperadoresCatalogo([]);
      return;
    }
    async function carregarOperadoresCatalogo() {
      try {
        const ops = await buscarOperadores({ catalogoId: Number(catalogoId) });
        setOperadoresCatalogo(ops.filter(op => op.situacao !== 'DESATIVADO'));
      } catch (err) {
        console.error('Erro ao carregar operadores do catálogo:', err);
      }
    }
    carregarOperadoresCatalogo();
  }, [catalogoCnpj]);

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

  function montarLabelAtributo(attr: AtributoEstrutura) {
    return EXIBIR_CODIGO_ATRIBUTO ? `${attr.nome} (${attr.codigo})` : attr.nome;
  }

  function montarHintAtributo(attr: AtributoEstrutura) {
    return attr.orientacaoPreenchimento || undefined;
  }

  function montarOpcoesDominio(attr: AtributoEstrutura) {
    return (
      attr.dominio?.map(d => ({
        value: d.codigo,
        label: `${d.codigo} - ${d.descricao}`,
      })) || []
    );
  }

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

  async function carregarEstrutura(codigo?: string) {
    const ncmCodigo = codigo || ncm;
    if (ncmCodigo.length < 8) return;
    setLoadingEstrutura(true);
    try {
      const response = await api.get(`/siscomex/atributos/ncm/${ncmCodigo}`, {
        params: {
          modalidade,
          verificarAtualizacao: isNew ? 'true' : undefined
        },
        timeout: NCM_ATTRIBUTES_TIMEOUT_MS
      });

      if (!response.data.descricaoNcm) {
        addToast('NCM não encontrada', 'error');
        setEstruturaCarregada(false);
        setNcmDescricao('');
        setUnidadeMedida('');
        setEstrutura([]);
        if (isNew) {
          setValores({});
        }
        return;
      }

      const dados: AtributoEstrutura[] = response.data.dados || [];
      setNcmDescricao(response.data.descricaoNcm);
      setUnidadeMedida(response.data.unidadeMedida || '');
      setEstrutura(ordenarAtributos(dados));
      if (isNew) {
        if (catalogoId) {
          try {
            const templateResponse = await api.get(
              `/ncm-valores-padrao/ncm/${ncmCodigo}`,
              { params: { modalidade, catalogoId: Number(catalogoId) } }
            );
            const valoresPadrao = (templateResponse.data?.valoresJson || {}) as Record<string, string | string[]>;
            setValores(valoresPadrao);
          } catch (error: any) {
            if (error?.response?.status !== 404) {
              console.error('Erro ao carregar valores padrão da NCM:', error);
            }
            setValores({});
          }
        } else {
          setValores({});
        }
      }
      setEstruturaCarregada(true);
    } catch (error) {
      console.error('Erro ao carregar atributos:', error);
      addToast('Erro ao carregar atributos', 'error');
      setEstruturaCarregada(false);
    } finally {
      setLoadingEstrutura(false);
    }
  }

  function handleNcmChange(valor: string) {
    setNcm(valor);
    if (errors.ncm) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.ncm;
        return newErrors;
      });
    }
    if (valor.length < 4 || valor.length >= 8) {
      setNcmSugestoes([]);
      setMostrarSugestoesNcm(false);
      setCarregandoSugestoesNcm(false);
    }
    if (valor.length === 8) {
      if (isNew) {
        setValores({});
      }
      carregarEstrutura(valor);
    } else {
      setNcmDescricao('');
      setUnidadeMedida('');
      setEstruturaCarregada(false);
    }
  }

  function selecionarSugestaoNcm(sugestao: { codigo: string; descricao: string | null }) {
    setNcmDescricao(sugestao.descricao || '');
    setUnidadeMedida('');
    setMostrarSugestoesNcm(false);
    setNcmSugestoes([]);
    handleNcmChange(sugestao.codigo);
  }

  useEffect(() => {
    if (ncm.length === 8) {
      carregarEstrutura(ncm);
    }
  }, [modalidade]);

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
          addToast('Erro ao buscar sugestões de NCM', 'error');
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

  function removerValoresOcultos(valoresAtuais: Record<string, string | string[]>) {
    if (!mapaEstrutura.size) return valoresAtuais;

    const proximo = { ...valoresAtuais };
    let alterado = false;

    for (const codigoAtual of Object.keys(proximo)) {
      const attrAtual = mapaEstrutura.get(codigoAtual);
      if (!attrAtual || !condicaoAtendida(attrAtual, proximo)) {
        delete proximo[codigoAtual];
        alterado = true;
      }
    }

    return alterado ? proximo : valoresAtuais;
  }

  function handleValor(codigo: string, valor: string | string[]) {
    if (produtoSomenteLeitura) return;

    setValores(prev => {
      const atualizados = { ...prev, [codigo]: valor };
      return removerValoresOcultos(atualizados);
    });
  }

  function compactarDescricaoParaIa(texto: string) {
    const normalizado = texto.replace(/\s+/g, ' ').trim();
    const limite = 1200;
    if (normalizado.length <= limite) return normalizado;
    return `${normalizado.slice(0, limite)}...`;
  }

  function montarDescricaoParaIa() {
    const nomeProduto = denominacao.trim();
    const detalhamento = descricao.trim();

    if (nomeProduto && detalhamento) {
      return compactarDescricaoParaIa(`${nomeProduto} - ${detalhamento}`);
    }

    return compactarDescricaoParaIa(nomeProduto || detalhamento);
  }

  function mapearAtributoParaIa(attr: AtributoEstrutura): AtributoParaIa {
    const validacoesCompactas: Record<string, unknown> = {};
    const chavesValidacoes = ['tamanho_maximo', 'casas_decimais', 'mascara'];
    chavesValidacoes.forEach(chave => {
      if (attr.validacoes?.[chave] !== undefined) {
        validacoesCompactas[chave] = attr.validacoes[chave];
      }
    });

    return {
      codigo: attr.codigo,
      nome: attr.nome,
      tipo: attr.tipo,
      obrigatorio: attr.obrigatorio,
      multivalorado: attr.multivalorado ?? false,
      dominio: attr.dominio?.map(d => ({ codigo: d.codigo, descricao: d.descricao })) || [],
      validacoes: Object.keys(validacoesCompactas).length ? validacoesCompactas : undefined,
      condicao: attr.condicao,
      descricaoCondicao: attr.descricaoCondicao,
      parentCodigo: attr.parentCodigo,
      condicionanteCodigo: attr.condicionanteCodigo
    };
  }

  function coletarAtributosParaIa(
    lista: AtributoEstrutura[],
    apenasVisiveisNaoPreenchidos = false,
    valoresAtuais: Record<string, string | string[]> = valores
  ): AtributoParaIa[] {
    const resultado: AtributoParaIa[] = [];

    for (const attr of lista) {
      if (apenasVisiveisNaoPreenchidos && !condicaoAtendida(attr, valoresAtuais)) {
        continue;
      }

      const possuiValor = isValorPreenchido(valoresAtuais[attr.codigo]);
      const isComposto = attr.tipo === 'COMPOSTO';

      if (!apenasVisiveisNaoPreenchidos || (!possuiValor && !isComposto)) {
        resultado.push(mapearAtributoParaIa(attr));
      }

      if (attr.subAtributos?.length) {
        resultado.push(
          ...coletarAtributosParaIa(attr.subAtributos, apenasVisiveisNaoPreenchidos, valoresAtuais)
        );
      }
    }

    return resultado;
  }

  function normalizarValorSugerido(valor: unknown): string[] {
    if (Array.isArray(valor)) {
      return valor.map(v => String(v).trim()).filter(Boolean);
    }
    if (valor === undefined || valor === null) return [];
    if (typeof valor === 'string') {
      const texto = valor.trim();
      if (!texto) return [];
      const separadores = /[,;\n]/;
      if (separadores.test(texto)) {
        return texto
          .split(separadores)
          .map(v => v.trim())
          .filter(Boolean);
      }
      return [texto];
    }
    return [String(valor)];
  }

  function aplicarSugestoesIa(
    sugestoes: Record<string, unknown>,
    valoresAtuais: Record<string, string | string[]> = valores
  ): { aplicadas: string[]; ignoradas: string[]; valoresAtualizados: Record<string, string | string[]> } {
    if (!sugestoes) return { aplicadas: [], ignoradas: [], valoresAtualizados: valoresAtuais };

    const novosValores = { ...valoresAtuais };
    const aplicadas: string[] = [];
    const ignoradas: string[] = [];

    Object.entries(sugestoes).forEach(([codigo, valor]) => {
      const attr = mapaEstrutura.get(codigo);
      if (!attr) {
        ignoradas.push(codigo);
        return;
      }

      let valoresSugeridos = normalizarValorSugerido(valor);

      if (attr.dominio?.length) {
        const permitidos = new Set(attr.dominio.map(d => String(d.codigo)));
        valoresSugeridos = valoresSugeridos.filter(v => permitidos.has(v));
      }

      if (!valoresSugeridos.length) {
        ignoradas.push(codigo);
        return;
      }

      if (attr.multivalorado) {
        novosValores[codigo] = valoresSugeridos;
      } else {
        novosValores[codigo] = valoresSugeridos[0];
      }

      aplicadas.push(codigo);
    });

    setValores(novosValores);
    return { aplicadas, ignoradas, valoresAtualizados: novosValores };
  }

  function montarPayloadSugestaoIa(atributos: AtributoParaIa[]) {
    return {
      descricao: montarDescricaoParaIa(),
      atributos,
      ncm: ncm.length === 8 ? ncm : undefined,
      modalidade
    };
  }

  async function preencherAtributosComIa() {
    if (produtoSomenteLeitura) {
      addToast('Produto desativado esta em modo somente leitura.', 'error');
      return;
    }

    if (!descricao.trim()) {
      addToast('Informe o detalhamento do produto para sugerir atributos', 'error');
      setActiveTab('informacoes');
      return;
    }

    if (!estrutura.length) {
      addToast('Carregue a estrutura de atributos antes de usar a IA', 'error');
      return;
    }

    if (iaJaSolicitada) {
      addToast('A sugestão automática já foi solicitada nesta sessão.', 'error');
      return;
    }

    let valoresAtuais = valores;

    if (!limpezaInicialIaRealizada) {
      setValores({});
      valoresAtuais = {};
      setLimpezaInicialIaRealizada(true);
    }

    setGerandoSugestoesIa(true);
    setIaJaSolicitada(true);
    let tentativasRestantes = MAX_TENTATIVAS_IA;
    try {
      while (tentativasRestantes > 0) {
        const atributosVisiveisParaSugestao = coletarAtributosParaIa(
          estrutura,
          true,
          valoresAtuais
        );

        if (!atributosVisiveisParaSugestao.length) {
          const mensagem = 'Todos os atributos visíveis já estão preenchidos.';
          setResumoSugestoesIa(mensagem);
          addToast(mensagem, 'success');
          break;
        }

        const payload = montarPayloadSugestaoIa(atributosVisiveisParaSugestao);
        const response = await api.post('/ia/atributos/sugerir', payload);
        const { aplicadas, ignoradas, valoresAtualizados } = aplicarSugestoesIa(
          response.data?.sugestoes || {},
          valoresAtuais
        );
        valoresAtuais = valoresAtualizados;
        tentativasRestantes -= 1;

        const resumoTokens = response.data?.tokens?.total
          ? ` • ${response.data.tokens.total} tokens`
          : '';
        setResumoSugestoesIa(`Sugestões aplicadas: ${aplicadas.length}${resumoTokens}`);

        if (aplicadas.length) {
          addToast(`Preenchemos ${aplicadas.length} atributo(s) com IA`, 'success');
        } else {
          addToast('Nenhum atributo pôde ser sugerido com os dados informados', 'error');
        }

        if (ignoradas.length) {
          addToast(`Ignoramos sugestões para ${ignoradas.length} atributo(s) fora do domínio`, 'success');
        }

        if (!coletarAtributosParaIa(estrutura, true, valoresAtuais).length) {
          break;
        }
      }
    } catch (error: any) {
      const mensagem = error?.response?.data?.error || 'Não foi possível gerar sugestões de atributos';
      addToast(mensagem, 'error');
    } finally {
      setGerandoSugestoesIa(false);
    }
  }

  function adicionarCodigoInterno() {
    if (produtoSomenteLeitura) return;

    const codigo = novoCodigoInterno.trim();
    if (!codigo) return;
    if (codigosInternos.some(c => c.toLowerCase() === codigo.toLowerCase())) {
      addToast('Código interno já incluído', 'error');
      return;
    }
    setCodigosInternos(prev => [...prev, codigo]);
    setNovoCodigoInterno('');
  }

  function removerCodigoInterno(index: number) {
    if (produtoSomenteLeitura) return;
    setCodigosInternos(prev => prev.filter((_, i) => i !== index));
  }

  function adicionarOperador() {
    if (produtoSomenteLeitura) return;

    const erros: { paisCodigo?: string; operador?: string } = {};
    if (!novoOperador.paisCodigo) {
      erros.paisCodigo = 'País obrigatório';
    }
    if (novoOperador.conhecido === 'sim' && !novoOperador.operador) {
      erros.operador = 'Selecione o operador';
    }
    if (Object.keys(erros).length > 0) {
      setOperadorErro(erros);
      const campos = [erros.paisCodigo ? 'País' : null, erros.operador ? 'Operador' : null]
        .filter(Boolean)
        .join(' e ');
      addToast(`Informe ${campos}`, 'error');
      return;
    }
    setOperadorErro({});
    setOperadores(prev => [...prev, { ...novoOperador }]);
    setNovoOperador({ paisCodigo: '', conhecido: 'nao', operador: undefined });
  }

  function removerOperador(index: number) {
    if (produtoSomenteLeitura) return;
    setOperadores(prev => prev.filter((_, i) => i !== index));
  }

  function formatarEndereco(op?: OperadorEstrangeiro | null) {
    if (!op) return '';
    const partes = [] as string[];
    if (op.logradouro) partes.push(op.logradouro);
    if (op.cidade) partes.push(op.cidade);
    if (op.subdivisao) partes.push(op.subdivisao.nome);
    const endereco = partes.join(', ');
    return op.codigoPostal ? `${endereco} - ${formatCEP(op.codigoPostal)}` : endereco;
  }

  // A visibilidade dos atributos condicionados é verificada a cada alteração
  // pois o componente re-renderiza sempre que 'valores' é atualizado.
  function condicaoAtendida(
    attr: AtributoEstrutura,
    valoresAtuais: Record<string, string | string[]> = valores
  ): boolean {
    const codigoCondicionante = attr.condicionanteCodigo;
    if (!codigoCondicionante) return true;

    const condicionante = mapaEstrutura.get(codigoCondicionante);
    if (condicionante && !condicaoAtendida(condicionante, valoresAtuais)) return false;

    const atual = valoresAtuais[codigoCondicionante];
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
    const label = montarLabelAtributo(attr);
    const hint = montarHintAtributo(attr);
    const error = errors[attr.codigo];

    switch (attr.tipo) {
      case 'LISTA_ESTATICA':
        const opcoesDominio = montarOpcoesDominio(attr);
        if (attr.multivalorado) {
          return (
            <MultiSelect
              key={attr.codigo}
              label={label}
              hint={hint}
              error={error}
              required={attr.obrigatorio}
              options={opcoesDominio}
              placeholder="Selecione..."
              values={normalizarValoresMultivalorados(rawValue)}
              onChange={vals => handleValor(attr.codigo, vals)}
              disabled={produtoSomenteLeitura}
            />
          );
        }
        return (
          <Select
            key={attr.codigo}
            label={label}
            hint={hint}
            error={error}
            required={attr.obrigatorio}
            options={opcoesDominio}
            placeholder="Selecione..."
            value={value}
            onChange={e => handleValor(attr.codigo, e.target.value)}
            disabled={produtoSomenteLeitura}
          />
        );
      case 'BOOLEANO':
        return (
          <RadioGroup
            key={attr.codigo}
            label={label}
            hint={hint}
            error={error}
            required={attr.obrigatorio}
            options={[
              { value: 'true', label: 'Sim' },
              { value: 'false', label: 'Não' }
            ]}
            value={value}
            onChange={v => handleValor(attr.codigo, v)}
            disabled={produtoSomenteLeitura}
          />
        );
      case 'NUMERO_INTEIRO':
        return (
          <Input
            key={attr.codigo}
            label={label}
            hint={hint}
            error={error}
            type="number"
            required={attr.obrigatorio}
            value={value}
            onChange={e => handleValor(attr.codigo, e.target.value)}
            disabled={produtoSomenteLeitura}
          />
        );
      case 'NUMERO_REAL':
        return (
          <Input
            key={attr.codigo}
            label={label}
            hint={hint}
            error={error}
            type="number"
            step="0.01"
            required={attr.obrigatorio}
            value={value}
            onChange={e => handleValor(attr.codigo, e.target.value)}
            disabled={produtoSomenteLeitura}
          />
        );
      case 'COMPOSTO':
        return (
          <div key={attr.codigo} className="col-span-3">
            <p className="font-medium mb-2 text-sm text-gray-300">
              {label}
              {hint && <Hint text={hint} />}
            </p>
            <div className="grid grid-cols-3 gap-4 pl-4">
              {attr.subAtributos?.map(sa => renderCampo(sa))}
            </div>
          </div>
        );
      default:
        if (attr.tipo === 'TEXTO') {
          const max = attr.validacoes?.tamanho_maximo ?? 0;
          const pattern = attr.validacoes?.mascara;

          if (pattern) {
            let span = 'col-span-1';
            if (max > 30 && max <= 60) span = 'col-span-2';
            else if (max > 60) span = 'col-span-3';

            return (
              <MaskedInput
                key={attr.codigo}
                label={label}
                hint={hint}
                error={error}
                required={attr.obrigatorio}
                value={value}
                pattern={pattern}
                onChange={(valorLimpo, _formatado) => handleValor(attr.codigo, valorLimpo)}
                className={span}
                disabled={produtoSomenteLeitura}
              />
            );
          }

          if (max >= 100) {
            return (
              <div key={attr.codigo} className="col-span-3 mb-4">
                <label
                  htmlFor={attr.codigo}
                  className="block text-sm font-medium mb-1 text-gray-300"
                >
                  {label}
                  {attr.obrigatorio && (
                    <span className="text-red-400 ml-1">*</span>
                  )}
                  {hint && (
                    <Hint text={hint} />
                  )}
                </label>
                <textarea
                  id={attr.codigo}
                  rows={3}
                  className={`w-full px-2 py-1 text-sm bg-[#1e2126] border text-white rounded-md focus:outline-none focus:ring focus:border-blue-500 ${
                    error ? 'border-red-500' : 'border-gray-700'
                  }`}
                  value={value}
                  onChange={e => handleValor(attr.codigo, e.target.value)}
                  disabled={produtoSomenteLeitura}
                />
                {error && (
                  <p className="mt-1 text-sm text-red-400">
                    {error}
                  </p>
                )}
              </div>
            );
          }

          let span = 'col-span-1';
          if (max > 30 && max <= 60) span = 'col-span-2';
          else if (max > 60) span = 'col-span-3';

          return (
            <Input
              key={attr.codigo}
              label={label}
              hint={hint}
              error={error}
              required={attr.obrigatorio}
              value={value}
              onChange={e => handleValor(attr.codigo, e.target.value)}
              className={span}
              disabled={produtoSomenteLeitura}
            />
          );
        }

        return (
          <Input
            key={attr.codigo}
            label={label}
            hint={hint}
            error={error}
            required={attr.obrigatorio}
            value={value}
            onChange={e => handleValor(attr.codigo, e.target.value)}
            disabled={produtoSomenteLeitura}
          />
        );
    }
  }

  async function carregarProduto(produtoId: string) {
    try {
      setLoading(true);
      const response = await api.get(`/produtos/${produtoId}`);
      const dados = response.data;
      const codigoCarregado = dados.codigo ? String(dados.codigo) : '';
      const codigosInternosCarregados = (dados.codigosInternos || []) as string[];
      const operadoresCarregados = (dados.operadoresEstrangeiros || []).map((o: any) => ({
        paisCodigo: o.paisCodigo,
        conhecido: o.conhecido ? 'sim' : 'nao',
        operador: o.operadorEstrangeiro || null
      }));
      const valoresCarregados = (dados.atributos?.[0]?.valoresJson || {}) as Record<string, string | string[]>;
      const versaoCarregada =
        dados.versao !== null && dados.versao !== undefined && String(dados.versao).trim()
          ? String(dados.versao).trim()
          : null;

      setReativacaoEmEdicao(false);
      setReativacaoEnfileirada(null);
      setCodigo(codigoCarregado);
      setVersaoProduto(versaoCarregada);
      setSituacaoProduto((dados.situacao || 'RASCUNHO') as 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO');
      setStatusProduto(dados.status || null);
      setCodigosInternos(codigosInternosCarregados);
      setOperadores(operadoresCarregados);
      setDenominacao(dados.denominacao || '');
      setDenominacaoOriginal(dados.denominacao || '');
      setDescricao(dados.descricao || '');
      setCatalogoNome(dados.catalogo?.nome || '');
      setCatalogoId(String(dados.catalogo?.id || ''));
      setCatalogoCnpj(dados.catalogo?.cpf_cnpj || '');
      setNcm(dados.ncmCodigo);
      setModalidade(dados.modalidade);
      try {
        const resp = await api.get(
          `/siscomex/atributos/ncm/${dados.ncmCodigo}?modalidade=${dados.modalidade}`,
          { timeout: NCM_ATTRIBUTES_TIMEOUT_MS }
        );
        setNcmDescricao(resp.data.descricaoNcm || '');
        setUnidadeMedida(resp.data.unidadeMedida || '');
      } catch (e) {
        setNcmDescricao('');
        setUnidadeMedida('');
      }
      const estr = dados.atributos?.[0]?.estruturaSnapshotJson || [];
      setEstrutura(ordenarAtributos(estr));
      setEstruturaCarregada(true);
      setValores(valoresCarregados);
      setAssinaturaInicialFormulario(
        serializarEstadoFormularioProduto({
          catalogoId: String(dados.catalogo?.id || ''),
          modalidade: dados.modalidade || '',
          ncm: dados.ncmCodigo || '',
          denominacao: dados.denominacao || '',
          descricao: dados.descricao || '',
          codigosInternos: codigosInternosCarregados,
          operadores: operadoresCarregados,
          valores: valoresCarregados,
        })
      );
    } catch (error) {
      console.error('Erro ao carregar produto:', error);
      addToast('Erro ao carregar produto', 'error');
      router.push('/produtos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!router.isReady) return;
    if (!isNew && typeof id === 'string') {
      carregarProduto(id as string);
    }
  }, [router.isReady, id, isNew]);

  useEffect(() => {
    if (isNew || !id || activeTab !== 'historico' || historicoCarregado) return;

    async function carregarHistorico() {
      try {
        setLoadingHistorico(true);
        const resposta = await api.get<HistoricoProdutoItem[]>(`/produtos/${id}/historico`);
        setHistorico(resposta.data || []);
        setHistoricoCarregado(true);
      } catch (error: any) {
        if (error?.response?.status === 404) {
          setHistorico([]);
          setHistoricoCarregado(true);
          return;
        }

        console.error('Erro ao carregar histórico do produto:', error);
        addToast('Erro ao carregar histórico do produto', 'error');
        setHistoricoCarregado(true);
      } finally {
        setLoadingHistorico(false);
      }
    }

    carregarHistorico();
  }, [activeTab, id, isNew, historicoCarregado]);

  function coletarFaltantes(lista: AtributoEstrutura[]): AtributoEstrutura[] {
    const faltantes: AtributoEstrutura[] = [];
    for (const a of lista) {
      if (!condicaoAtendida(a)) continue;
      if (a.subAtributos && a.tipo === 'COMPOSTO') {
        faltantes.push(...coletarFaltantes(a.subAtributos));
      } else if (a.obrigatorio && !isValorPreenchido(valores[a.codigo])) {
        faltantes.push(a);
      }
    }
    return faltantes;
  }

  function validarFormulario(): boolean {
    const newErrors: Record<string, string> = {};

    if (!catalogoId) {
      newErrors.catalogoId = 'Catálogo é obrigatório';
    }
    if (ncm.length !== 8) {
      newErrors.ncm = 'NCM é obrigatório';
    }
    if (!denominacao.trim()) {
      newErrors.denominacao = 'Nome do produto é obrigatório';
    }
    if (!descricao.trim()) {
      newErrors.descricao = 'Descrição é obrigatória';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function solicitarInativacao() {
    if (!podeInativarProduto) return;

    if (formularioAlterado) {
      addToast('Salve as alteracoes pendentes antes de desativar o produto.', 'error');
      return;
    }

    setInativacaoModalAberta(true);
  }

  function cancelarInativacao() {
    if (inativandoProduto) return;
    setInativacaoModalAberta(false);
  }

  function solicitarReativacao() {
    if (!podeReativarProduto) return;

    setReativacaoEmEdicao(true);
    setReativacaoEnfileirada(null);
    setActiveTab('informacoes');
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.denominacao;
      return newErrors;
    });
    addToast('Produto liberado para edição. Altere a denominação para criar nova versão.', 'success');
  }

  async function confirmarInativacao() {
    if (typeof id !== 'string') return;
    if (formularioAlterado) {
      addToast('Salve as alteracoes pendentes antes de desativar o produto.', 'error');
      return;
    }

    try {
      setInativandoProduto(true);
      const resposta = await api.post(`/produtos/${id}/inativar`);
      const reconciliado = resposta?.data?.reconciliado === true;
      addToast(
        reconciliado
          ? 'Produto desativado com reconciliacao SISCOMEX concluida.'
          : 'Produto desativado com sucesso.',
        'success'
      );
      setInativacaoModalAberta(false);
      setHistoricoCarregado(false);
      await carregarProduto(id);
    } catch (error: any) {
      const mensagem = error?.response?.data?.error || 'Nao foi possivel desativar o produto.';
      const retryable = error?.response?.data?.retryable === true;
      addToast(retryable ? `${mensagem} Tente novamente.` : mensagem, 'error');
    } finally {
      setInativandoProduto(false);
    }
  }

  function montarPayloadProdutoAtual(incluirDadosCriacao = false) {
    return {
      ...(incluirDadosCriacao
        ? {
            ncmCodigo: ncm,
            catalogoId: catalogoId ? Number(catalogoId) : undefined,
          }
        : {}),
      modalidade,
      denominacao,
      descricao,
      valoresAtributos: valores,
      codigosInternos,
      operadoresEstrangeiros: operadores.map(o => ({
        paisCodigo: o.paisCodigo,
        conhecido: o.conhecido === 'sim',
        operadorEstrangeiroId: o.operador?.id
      }))
    };
  }

  function extrairMensagemErroApi(error: any, fallback: string) {
    const payload = error?.response?.data?.error;
    const details = error?.response?.data?.details;

    if (Array.isArray(payload)) {
      return payload.map((item: any) => item?.message || String(item)).join(' ');
    }

    if (Array.isArray(details)) {
      return details.map((item: any) => item?.message || String(item)).join(' ');
    }

    if (typeof payload === 'string') {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      return Object.values(payload)
        .map(value =>
          value && typeof value === 'object' && 'message' in value
            ? String((value as any).message)
            : String(value)
        )
        .join(' ');
    }

    return error?.message || fallback;
  }

  async function salvarECriarNovaVersao() {
    if (typeof id !== 'string') return;

    if (!validarFormulario()) return;

    if (!denominacaoAlteradaParaReativacao) {
      setErrors(prev => ({
        ...prev,
        denominacao: 'Altere a denominação do produto para salvar e criar nova versão.'
      }));
      setActiveTab('informacoes');
      addToast('Altere a denominação do produto para salvar e criar nova versão.', 'error');
      return;
    }

    const pendentes = coletarFaltantes(estrutura);
    if (pendentes.length > 0) {
      setAttrsFaltando(pendentes.map(p => p.nome));
      return;
    }

    setAttrsFaltando(null);

    try {
      setReativandoProduto(true);
      const resposta = await api.post(`/produtos/${id}/reativar/transmitir`, montarPayloadProdutoAtual());
      const transmissaoId = resposta?.data?.dados?.transmissaoId;

      if (!transmissaoId) {
        throw new Error('Resposta sem transmissão de reativação.');
      }

      setReativacaoEnfileirada({
        transmissaoId,
        mensagem:
          resposta?.data?.mensagem ||
          'Reativação enfileirada para transmissão ao SISCOMEX.',
      });
      setReativacaoEmEdicao(false);
      setDenominacaoOriginal(denominacao);
      setAssinaturaInicialFormulario(assinaturaFormularioAtual);
      setHistoricoCarregado(false);
      addToast('Reativação enfileirada para transmissão.', 'success');
    } catch (error: any) {
      addToast(
        extrairMensagemErroApi(error, 'Nao foi possivel salvar e criar nova versão para o produto.'),
        'error'
      );
    } finally {
      setReativandoProduto(false);
    }
  }

  async function salvar(force = false) {
    if (reativacaoEmEdicao) {
      await salvarECriarNovaVersao();
      return;
    }

    if (produtoSomenteLeitura) {
      addToast('Produto desativado esta em modo somente leitura.', 'error');
      return;
    }

    if (!validarFormulario()) return;
    if (!force) {
      const pendentes = coletarFaltantes(estrutura);
      if (pendentes.length > 0) {
        setAttrsFaltando(pendentes.map(p => p.nome));
        return;
      }
    } else {
      setAttrsFaltando(null);
    }

    try {
      const url = isNew ? '/produtos' : `/produtos/${id}`;
      const metodo = isNew ? api.post : api.put;
      await metodo(url, montarPayloadProdutoAtual(isNew));
      addToast(isNew ? 'Produto salvo com sucesso!' : 'Produto atualizado com sucesso!', 'success');
      router.push('/produtos');
    } catch (error: any) {
      handleApiError(error);
    }
  }

  function handleApiError(error: any) {
    if (error.response?.status === 400 && error.response?.data?.details) {
      const details = error.response.data.details
        .map((d: any) => {
          const nome = mapaEstrutura.get(d.field)?.nome ?? d.field;
          return `${nome}: ${d.message}`;
        })
        .join('; ');
      addToast(`Erro de valida\u00e7\u00e3o: ${details}`, 'error');
    } else if (error.response?.data?.error) {
      addToast(error.response.data.error, 'error');
    } else {
      addToast('Erro ao salvar produto', 'error');
    }
  }

  function voltar() {
    router.push('/produtos');
  }

  return (
    <DashboardLayout title={isNew ? 'Novo Produto' : 'Editar Produto'}>
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Produtos', href: '/produtos' },
          { label: isNew ? 'Novo Produto' : 'Editar Produto' }
        ]}
      />

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <button onClick={voltar} className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-semibold text-white">
            {isNew ? 'Cadastrar Novo Produto' : 'Editar Produto'}
          </h1>
        </div>
        <div className="flex items-center gap-3 self-end md:self-auto">
          <Button type="button" variant="outline" onClick={voltar}>
            Cancelar
          </Button>
          {podeInativarProduto && (
            <Button
              type="button"
              variant="danger"
              onClick={solicitarInativacao}
              disabled={inativandoProduto}
              title={
                formularioAlterado
                  ? 'Salve as alteracoes pendentes antes de desativar.'
                  : 'Desativar produto no SISCOMEX'
              }
            >
              {inativandoProduto ? 'Desativando...' : 'Desativar'}
            </Button>
          )}
          {podeReativarProduto && (
            <Button
              type="button"
              variant="primary"
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500"
              onClick={solicitarReativacao}
              disabled={reativandoProduto}
              title="Liberar edição para salvar e criar nova versão no SISCOMEX"
            >
              <RefreshCw size={16} />
              Reativar
            </Button>
          )}
          <Button
            type="button"
            variant="accent"
            className="flex items-center gap-2"
            onClick={() => salvar()}
            disabled={produtoSomenteLeitura || inativandoProduto || reativandoProduto}
          >
            <Save size={16} />
            {reativandoProduto
              ? 'Transmitindo...'
              : reativacaoEmEdicao
                ? 'Salvar e criar nova versão'
                : 'Salvar Produto'}
          </Button>
        </div>
      </div>

      {produtoSomenteLeitura && (
        <div className="mb-4 rounded-md border border-red-700 bg-red-900/20 px-4 py-3 text-sm text-red-200">
          Produto desativado no SISCOMEX. Este registro esta em modo somente leitura.
          Clique em Reativar para liberar a edição e criar uma nova versão.
        </div>
      )}

      {reativacaoEmEdicao && (
        <div className="mb-4 rounded-md border border-emerald-700 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-200">
          Reativação em edição. Altere a denominação e salve para criar nova versão no SISCOMEX.
        </div>
      )}

      <Card className="mb-6 overflow-visible">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {isNew && !workingCatalog ? (
            <Select
              label="Catálogo"
              options={catalogos.map(c => ({ value: String(c.id), label: `${c.nome} - ${formatCPFOrCNPJ(c.cpf_cnpj)}` }))}
              value={catalogoId}
              className="mb-0 md:col-span-5"
              onChange={e => {
                setCatalogoId(e.target.value);
                const cat = catalogos.find(c => String(c.id) === e.target.value);
                setCatalogoCnpj(cat?.cpf_cnpj || '');
                if (errors.catalogoId) {
                  setErrors(prev => {
                    const newErrors = { ...prev };
                    delete newErrors.catalogoId;
                    return newErrors;
                  });
                }
              }}
              error={errors.catalogoId}
              required
            />
          ) : (
            <Input
              label="Catálogo"
              value={workingCatalog ? workingCatalog.nome : catalogoNome}
              className="mb-0 md:col-span-5"
              disabled
            />
          )}
          <Select
            label="Modalidade de operação:"
            options={[
              { value: 'IMPORTACAO', label: 'Importação' },
              { value: 'EXPORTACAO', label: 'Exportação' }
            ]}
            value={modalidade}
            onChange={e => setModalidade(e.target.value)}
            className="mb-0 md:col-span-2"
            disabled={produtoSomenteLeitura}
          />
          {estruturaCarregada && !loadingEstrutura && (
              <div className="grid grid-cols-1 gap-4 md:col-span-5 md:grid-cols-3">
                <Input label="Código SISCOMEX:" value={codigo || '-'} className="mb-0" disabled />
                <Input label="Versão:" value={versaoProduto !== null ? String(versaoProduto) : '-'} className="mb-0" disabled />
                <Input label="Situação:" value={formatarSituacaoProduto(situacaoProduto)} className="mb-0" disabled />
              </div>
            )}
        </div>

        {catalogoId && (
          <>
            <div className="grid grid-cols-5 gap-4 mt-4">
              {isNew ? (
                <div className="col-span-1">
                  <div className="relative">
                    <MaskedInput
                      label="NCM"
                      mask="ncm"
                      value={ncm}
                      onChange={val => handleNcmChange(val)}
                      className="mb-0"
                      error={errors.ncm}
                      required
                      onFocus={() => {
                        if (ncm.length >= 4 && ncm.length < 8 && ncmSugestoes.length > 0) {
                          setMostrarSugestoesNcm(true);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setMostrarSugestoesNcm(false), 100);
                      }}
                      autoComplete="off"
                    />
                    {(carregandoSugestoesNcm || mostrarSugestoesNcm) && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 md:max-h-80 overflow-y-auto rounded-md border border-gray-700 bg-[#1e2126] shadow-lg">
                        {carregandoSugestoesNcm ? (
                          <div className="px-3 py-2 text-sm text-gray-400">Buscando sugestões...</div>
                        ) : ncmSugestoes.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-400">Nenhuma sugestão encontrada</div>
                        ) : (
                          ncmSugestoes.map(sugestao => (
                            <button
                              key={sugestao.codigo}
                              type="button"
                              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm text-gray-100 hover:bg-gray-700"
                              onMouseDown={event => event.preventDefault()}
                              onClick={() => selecionarSugestaoNcm(sugestao)}
                            >
                              <span className="font-medium">{formatarNCMExibicao(sugestao.codigo)}</span>
                              {sugestao.descricao && (
                                <span className="text-xs text-gray-400">{sugestao.descricao}</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <Input label="NCM" value={ncm} disabled className="col-span-1" />
              )}
              <Input label="Descrição NCM" value={ncmDescricao} disabled className="col-span-3" />
              <Input label="Unidade de medida estatística:" value={unidadeMedida} disabled className="col-span-1" />
            </div>
          </>
        )}
      </Card>

      {catalogoId && (
        <>

          {loadingEstrutura && (
            <Card className="mb-6">
              <PageLoader message="Carregando dados do produto..." />
            </Card>
          )}

          {estruturaCarregada && !loadingEstrutura && (
            <>
              <Card className="mb-6">
                <Tabs
                  activeId={activeTab}
                  onChange={setActiveTab}
                  tabs={[
                    {
                      id: 'informacoes',
                      label: 'Informações do Produto',
                      content: (
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <Input
                            label="Denominação do Produto"
                            className="col-span-3"
                            value={denominacao}
                            maxLength={DENOMINACAO_MAX_LENGTH}
                            onChange={e => {
                              setDenominacao(e.target.value);
                              if (errors.denominacao) {
                                setErrors(prev => {
                                  const newErrors = { ...prev };
                                  delete newErrors.denominacao;
                                  return newErrors;
                                });
                              }
                            }}
                            error={errors.denominacao}
                            required
                            disabled={produtoSomenteLeitura}
                            labelRightContent={`${denominacao.length.toLocaleString('pt-BR')} de ${DENOMINACAO_MAX_LENGTH.toLocaleString('pt-BR')}`}
                          />

                          <div className="col-span-3 mb-4">
                            <label htmlFor="descricao" className="block text-sm font-medium mb-1 text-gray-300">
                              Detalhamento Complementar do Produto
                              <span className="text-red-400 ml-1">*</span>
                            </label>
                            <textarea
                              id="descricao"
                              className="w-full px-2 py-1 text-sm bg-[#1e2126] border border-gray-700 text-white rounded-md focus:outline-none focus:ring focus:border-blue-500"
                              placeholder="Descrição do Produto"
                              rows={4}
                              value={descricao}
                              maxLength={DESCRICAO_MAX_LENGTH}
                              onChange={e => {
                                setDescricao(e.target.value);
                                if (errors.descricao) {
                                  setErrors(prev => {
                                    const newErrors = { ...prev };
                                    delete newErrors.descricao;
                                    return newErrors;
                                  });
                                }
                              }}
                              required
                              disabled={produtoSomenteLeitura}
                            />
                            {errors.descricao && (
                              <p className="mt-1 text-sm text-red-400">{errors.descricao}</p>
                            )}
                            <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                              <span>
                                {`${descricao.length.toLocaleString('pt-BR')} de ${DESCRICAO_MAX_LENGTH.toLocaleString('pt-BR')}`}
                              </span>
                            </div>
                          </div>

                          <div className="col-span-3">
                          <Card
                            headerTitle="Código Interno do Produto"
                            headerClassName="bg-[#1a1f2b] px-4 py-2"
                          >
                              <div className="flex gap-2 mb-4">
                                <Input
                                  value={novoCodigoInterno}
                                  onChange={e => setNovoCodigoInterno(e.target.value)}
                                  className="mb-0 w-1/2"
                                  disabled={produtoSomenteLeitura}
                                />
                                <Button type="button" onClick={adicionarCodigoInterno} disabled={produtoSomenteLeitura}>
                                  + Incluir
                                </Button>
                              </div>
                              {codigosInternos.length > 0 && (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs text-left">
                                    <thead className="text-gray-400 bg-[#0f1419] uppercase">
                                      <tr>
                                        <th className="w-16 px-4 py-2 text-center">Ações</th>
                                        <th className="px-4 py-2">Código</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {codigosInternos.map((c, i) => (
                                        <tr key={i} className="border-b border-gray-700">
                                          <td className="px-4 py-1 text-center">
                                            <button
                                              className={`p-1 transition-colors ${
                                                produtoSomenteLeitura
                                                  ? 'text-gray-600 cursor-not-allowed'
                                                  : 'text-gray-300 hover:text-red-500'
                                              }`}
                                              onClick={() => removerCodigoInterno(i)}
                                              disabled={produtoSomenteLeitura}
                                            >
                                              <Trash2 size={16} />
                                            </button>
                                          </td>
                                          <td className="px-4 py-1">{c}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                          </Card>
                          <Card
                            headerTitle="Fabricante/Produtor"
                            headerClassName="bg-[#1a1f2b] px-4 py-2"
                            className="col-span-3 mt-4"
                          >
                            <div className="grid grid-cols-3 gap-4 mb-4">
                              <Select
                                label="País do Fabricante / Produtor:"
                                options={getPaisOptions()}
                                value={novoOperador.paisCodigo}
                                onChange={e => {
                                  setOperadorErro(prev => ({ ...prev, paisCodigo: undefined }));
                                  setNovoOperador(prev => ({ ...prev, paisCodigo: e.target.value }));
                                }}
                                className="mb-0"
                                disabled={produtoSomenteLeitura || novoOperador.conhecido === 'sim'}
                                error={operadorErro.paisCodigo}
                              />
                              <RadioGroup
                                label="Fabricante/produtor conhecido?"
                                options={[{ value: 'nao', label: 'Não' }, { value: 'sim', label: 'Sim' }]}
                                value={novoOperador.conhecido}
                                onChange={v => {
                                  setOperadorErro({});
                                  setNovoOperador(prev => {
                                    const novo = { ...prev, conhecido: v };
                                    if (v === 'sim' && prev.operador) {
                                      novo.paisCodigo = prev.operador.pais.codigo;
                                    }
                                    return novo;
                                  });
                                }}
                                className="mb-0"
                                disabled={produtoSomenteLeitura}
                              />
                              {novoOperador.conhecido === 'sim' && (
                                <div className="flex items-end gap-2">
                                  <Select
                                    label="Operador"
                                    options={operadoresCatalogo.map(op => ({ value: String(op.id), label: op.nome }))}
                                    value={novoOperador.operador ? String(novoOperador.operador.id) : ''}
                                    onChange={e => {
                                      const op = operadoresCatalogo.find(o => String(o.id) === e.target.value);
                                      setOperadorErro(prev => ({ ...prev, operador: undefined }));
                                      setNovoOperador(prev => ({
                                        ...prev,
                                        operador: op,
                                        paisCodigo: op?.pais.codigo || ''
                                      }));
                                    }}
                                    className="flex-1 mb-0"
                                    error={operadorErro.operador}
                                    disabled={produtoSomenteLeitura}
                                  />
                                  <Button
                                    type="button"
                                    onClick={() => setSelectorOpen(true)}
                                    disabled={produtoSomenteLeitura}
                                  >
                                    Buscar
                                  </Button>
                                </div>
                              )}
                            </div>
                            <Button type="button" onClick={adicionarOperador} disabled={produtoSomenteLeitura}>
                              Vincular
                            </Button>

                            {operadores.length > 0 && (
                              <div className="overflow-x-auto mt-4">
                                <table className="w-full text-xs text-left">
                                  <thead className="text-gray-400 bg-[#0f1419] uppercase">
                                    <tr>
                                      <th className="w-16 px-4 py-2 text-center">Ações</th>
                                      <th className="px-4 py-2">País de Origem</th>
                                      <th className="px-4 py-2">Conhecido</th>
                                      <th className="px-4 py-2">CPF/CNPJ/TIN</th>
                                      <th className="px-4 py-2">Código</th>
                                      <th className="px-4 py-2">Código Interno</th>
                                      <th className="px-4 py-2">Nome</th>
                                      <th className="px-4 py-2">Endereço</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {operadores.map((op, i) => (
                                      <tr key={i} className="border-b border-gray-700">
                                        <td className="px-4 py-1 text-center">
                                          <button
                                            className={`p-1 transition-colors ${
                                              produtoSomenteLeitura
                                                ? 'text-gray-600 cursor-not-allowed'
                                                : 'text-gray-300 hover:text-red-500'
                                            }`}
                                            onClick={() => removerOperador(i)}
                                            disabled={produtoSomenteLeitura}
                                          >
                                            <Trash2 size={16} />
                                          </button>
                                        </td>
                                        <td className="px-4 py-1">{op.operador?.pais?.nome || getPaisNome(op.paisCodigo)}</td>
                                        <td className="px-4 py-1">{op.conhecido === 'sim' ? 'Sim' : 'Não'}</td>
                                        <td className="px-4 py-1">
                                          {op.conhecido === 'sim'
                                            ? op.operador?.tin || formatCPFOrCNPJ(op.operador?.catalogo?.cpf_cnpj || '')
                                            : ''}
                                        </td>
                                        <td className="px-4 py-1">{op.conhecido === 'sim' ? op.operador?.codigo || '' : ''}</td>
                                        <td className="px-4 py-1">{op.conhecido === 'sim' ? op.operador?.codigoInterno || '' : ''}</td>
                                        <td className="px-4 py-1">{op.conhecido === 'sim' ? op.operador?.nome || '' : ''}</td>
                                        <td className="px-4 py-1">{op.conhecido === 'sim' ? formatarEndereco(op.operador) : ''}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </Card>
                        </div>
                      </div>
                    )
                  },
                    {
                      id: 'dinamicos',
                      label: 'Atributos Dinâmicos',
                      content: (
                        <div className="flex flex-col gap-4">
                          {podeSugerirComIa && (
                            <div className="flex flex-col gap-2 rounded border border-gray-700 bg-[#0f1419] p-3 md:flex-row md:items-center md:justify-between">
                              <div className="text-sm text-gray-300">
                                <p className="font-semibold text-white">Sugestão automática de atributos</p>
                                <p className="text-xs md:text-sm text-gray-400">
                                  Usa o detalhamento complementar para sugerir valores mínimos e respeita domínios e atributos multivalorados.
                                </p>
                                {resumoSugestoesIa && (
                                  <p className="text-xs text-gray-400 mt-1">{resumoSugestoesIa}</p>
                                )}
                              </div>
                              <div className="flex gap-2 self-end md:self-auto">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="flex items-center gap-2"
                                  onClick={preencherAtributosComIa}
                                  disabled={
                                    gerandoSugestoesIa ||
                                    !estrutura.length ||
                                    !descricao.trim() ||
                                    iaJaSolicitada ||
                                    produtoSomenteLeitura
                                  }
                                >
                                  <BrainCog size={16} />
                                  {gerandoSugestoesIa ? 'Gerando sugestões...' : 'Sugerir com IA'}
                                </Button>
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            {estrutura.map(attr => renderCampo(attr))}
                          </div>
                        </div>
                      )
                    },
                    {
                      id: 'historico',
                      label: 'Histórico',
                      content: (
                        <div className="flex flex-col gap-3">
                          {loadingHistorico && (
                            <p className="text-sm text-gray-400">Carregando histórico de versões...</p>
                          )}

                          {!loadingHistorico && historico.length === 0 && (
                            <p className="text-sm text-gray-400">Nenhuma versão registrada para este produto.</p>
                          )}

                          {!loadingHistorico && historico.length > 0 && (
                            <div className="flex flex-col gap-3">
                              {historico.map(item => {
                                const expandido = historicoExpandido[item.id] === true;
                                const mudancas = item.delta?.changes || [];

                                return (
                                  <Card key={item.id} className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm text-white font-medium">
                                          Versão {item.versaoSiscomex} · {formatarTipoEvento(item.tipoEvento)}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                          {new Date(item.criadoEm).toLocaleString('pt-BR')}
                                        </p>
                                        <p className="text-sm text-gray-300 mt-1">
                                          {item.resumo || 'Alterações registradas na versão.'}
                                        </p>
                                      </div>

                                      {mudancas.length > 0 && (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          onClick={() => setHistoricoExpandido(prev => ({ ...prev, [item.id]: !expandido }))}
                                        >
                                          {expandido ? 'Ocultar mudanças' : 'Ver mudanças'}
                                        </Button>
                                      )}
                                    </div>

                                    {expandido && mudancas.length > 0 && (
                                      <div className="mt-3 overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                          <thead className="text-gray-400 bg-[#0f1419] uppercase">
                                            <tr>
                                              <th className="px-3 py-2">Campo</th>
                                              <th className="px-3 py-2">Operação</th>
                                              <th className="px-3 py-2">Antes</th>
                                              <th className="px-3 py-2">Depois</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {mudancas.map((mudanca, idx) => (
                                              <tr key={`${item.id}-${idx}`} className="border-b border-gray-700">
                                                <td className="px-3 py-2 text-gray-200">{mudanca.label || mudanca.path}</td>
                                                <td className="px-3 py-2 text-gray-300">{formatarOperacaoDelta(mudanca.op)}</td>
                                                <td className="px-3 py-2 text-gray-400">
                                                  {mudanca.before === undefined ? '-' : JSON.stringify(mudanca.before)}
                                                </td>
                                                <td className="px-3 py-2 text-gray-400">
                                                  {mudanca.after === undefined ? '-' : JSON.stringify(mudanca.after)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </Card>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )
                    }
                  ]}
                />
              </Card>

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={voltar}
                >
                  Cancelar
                </Button>
                {podeInativarProduto && (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={solicitarInativacao}
                    disabled={inativandoProduto}
                    title={
                      formularioAlterado
                        ? 'Salve as alteracoes pendentes antes de desativar.'
                        : 'Desativar produto no SISCOMEX'
                    }
                  >
                    {inativandoProduto ? 'Desativando...' : 'Desativar'}
                  </Button>
                )}
                {podeReativarProduto && (
                  <Button
                    type="button"
                    variant="primary"
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500"
                    onClick={solicitarReativacao}
                    disabled={reativandoProduto}
                    title="Liberar edição para salvar e criar nova versão no SISCOMEX"
                  >
                    <RefreshCw size={16} />
                    Reativar
                  </Button>
                )}
                <Button
                  type="button"
                  variant="accent"
                  className="flex items-center gap-2"
                  onClick={() => salvar()}
                  disabled={produtoSomenteLeitura || inativandoProduto || reativandoProduto}
                >
                  <Save size={16} />
                  {reativandoProduto
                    ? 'Transmitindo...'
                    : reativacaoEmEdicao
                      ? 'Salvar e criar nova versão'
                      : 'Salvar Produto'}
                </Button>
              </div>
            </>
          )}
        </>
      )}
      {selectorOpen && !produtoSomenteLeitura && (
        <OperadorEstrangeiroSelector
          onSelect={op => {
            setOperadorErro(prev => ({ ...prev, operador: undefined }));
            setNovoOperador(prev => ({ ...prev, operador: op, paisCodigo: op.pais.codigo }));
            if (!operadoresCatalogo.some(o => o.id === op.id)) {
              setOperadoresCatalogo(prev => [...prev, op]);
            }
            setSelectorOpen(false);
          }}
          onCancel={() => setSelectorOpen(false)}
          selectedOperadores={[]}
          catalogoId={catalogoId ? Number(catalogoId) : undefined}
        />
      )}

      {inativacaoModalAberta && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Confirmar desativação</h3>
            <p className="text-gray-300 mb-4">
              A desativação será enviada ao SISCOMEX agora. O produto permanecerá visível em modo
              somente leitura após confirmação.
            </p>
            {formularioAlterado && (
              <p className="text-red-400 text-sm mb-4">
                Existem alterações pendentes. Salve antes de desativar.
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={cancelarInativacao} disabled={inativandoProduto}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={confirmarInativacao}
                disabled={inativandoProduto || formularioAlterado}
              >
                {inativandoProduto ? 'Desativando...' : 'Confirmar desativação'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {reativacaoEnfileirada && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Reativação enfileirada</h3>
            <p className="text-gray-300 mb-4">
              {reativacaoEnfileirada.mensagem} Acompanhe o processamento pela tela de
              transmissão.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setReativacaoEnfileirada(null)}>
                Fechar
              </Button>
              <Button
                variant="accent"
                onClick={() =>
                  router.push(
                    `/automacao/transmissoes-siscomex/${reativacaoEnfileirada.transmissaoId}`
                  )
                }
              >
                Acompanhar transmissão
              </Button>
            </div>
          </Card>
        </div>
      )}

      {attrsFaltando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-white mb-4">
              {reativacaoEmEdicao ? 'Atributos obrigatórios pendentes' : 'Confirmar Salvamento'}
            </h3>
            <p className="text-gray-300 mb-2">Os seguintes atributos obrigatórios não foram preenchidos:</p>
            <ul className="text-gray-300 list-disc list-inside mb-4">
              {attrsFaltando.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
            <p className="text-gray-300 mb-6">
              {reativacaoEmEdicao
                ? 'Preencha esses atributos para salvar e criar uma nova versão.'
                : 'Deseja continuar mesmo assim?'}
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setAttrsFaltando(null)}>Cancelar</Button>
              {!reativacaoEmEdicao && (
                <Button onClick={() => salvar(true)}>Continuar</Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
