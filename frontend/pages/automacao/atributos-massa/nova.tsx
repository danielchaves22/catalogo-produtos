import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { AutocompleteTagInput } from '@/components/ui/AutocompleteTagInput';
import { Hint } from '@/components/ui/Hint';
import { useToast } from '@/components/ui/ToastContext';
import api, { NCM_ATTRIBUTES_TIMEOUT_MS } from '@/lib/api';
import {
  algumValorIgual,
  algumValorSatisfazCondicao,
  isValorPreenchido,
  normalizarValoresMultivalorados
} from '@/lib/atributos';
import useDebounce from '@/hooks/useDebounce';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Save, Search, X } from 'lucide-react';
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
  codigosInternos?: string[] | null;
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

const PRODUTO_SUGESTOES_POR_PAGINA = 20;

interface PreenchimentoMassaAgendamentoResponse {
  jobId: number;
  mensagem?: string;
}

type ProdutoEntrada =
  | {
      id: string;
      tipo: 'valido';
      produto: ProdutoBuscaItem;
      origem: 'busca' | 'codigo';
    }
  | {
      id: string;
      tipo: 'invalido';
      valor: string;
      mensagem: string;
      motivo: 'nao-encontrado' | 'duplicado' | 'erro';
    };

function formatarNCMExibicao(codigo?: string) {
  if (!codigo) return '';
  const digits = String(codigo).replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return digits.replace(/(\d{4})(\d{1,2})/, '$1.$2');
  return digits.replace(/(\d{4})(\d{2})(\d{1,2})/, '$1.$2.$3');
}

function gerarIdTemporario() {
  return `pendente-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizarCodigoProduto(codigo?: string | null) {
  return (codigo ?? '').trim().toLowerCase();
}

function obterCodigosAssociados(produto?: {
  codigo?: string | null;
  codigosInternos?: string[] | null;
}) {
  const conjunto = new Set<string>();
  if (!produto) return conjunto;

  const principal = normalizarCodigoProduto(produto.codigo);
  if (principal) {
    conjunto.add(principal);
  }

  for (const codigoInterno of produto.codigosInternos ?? []) {
    const normalizado = normalizarCodigoProduto(codigoInterno);
    if (normalizado) {
      conjunto.add(normalizado);
    }
  }

  return conjunto;
}

function produtoPossuiCodigo(
  produto: { codigo?: string | null; codigosInternos?: string[] | null },
  codigoNormalizado: string
) {
  if (!codigoNormalizado) return false;
  return obterCodigosAssociados(produto).has(codigoNormalizado);
}

function produtoPossuiTrechoCodigo(
  produto: { codigo?: string | null; codigosInternos?: string[] | null },
  trechoNormalizado: string
) {
  if (!trechoNormalizado) return false;
  return Array.from(obterCodigosAssociados(produto)).some(codigo =>
    codigo.includes(trechoNormalizado)
  );
}

function obterCodigoPreferencial(
  produto: { codigo?: string | null; codigosInternos?: string[] | null }
) {
  const codigoPrincipal = produto.codigo?.trim();
  if (codigoPrincipal) {
    return codigoPrincipal;
  }

  const codigoInternoValido = produto.codigosInternos?.find(codigo =>
    Boolean(codigo?.trim())
  );

  return codigoInternoValido?.trim() ?? null;
}

function obterCodigosExibicao(
  produto: { codigo?: string | null; codigosInternos?: string[] | null }
) {
  const codigos: string[] = [];
  const principal = produto.codigo?.trim();
  if (principal) {
    codigos.push(principal);
  }

  for (const codigoInterno of produto.codigosInternos ?? []) {
    const valor = codigoInterno?.trim();
    if (!valor) continue;
    if (!codigos.includes(valor)) {
      codigos.push(valor);
    }
  }

  return codigos;
}

function montarDescricaoCatalogo(nome?: string | null, cpfCnpj?: string | null) {
  const partes: string[] = [];
  if (nome) {
    partes.push(nome);
  }

  const cnpjFormatado = formatCPFOrCNPJ(cpfCnpj || '');
  if (cnpjFormatado) {
    partes.push(cnpjFormatado);
  }

  if (partes.length === 0) {
    return 'Catálogo desconhecido';
  }

  return partes.join(' • ');
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
  const [produtoTotalResultados, setProdutoTotalResultados] = useState<number | null>(null);
  const [produtoPaginaAtual, setProdutoPaginaAtual] = useState(1);
  const [produtoPageSize, setProdutoPageSize] = useState(PRODUTO_SUGESTOES_POR_PAGINA);
  const [produtoBuscaAtiva, setProdutoBuscaAtiva] = useState('');
  const debouncedProdutoBusca = useDebounce(produtoBusca, 600);
  const [produtosMarcados, setProdutosMarcados] = useState<ProdutoBuscaItem[]>([]);
  const [produtosPendentes, setProdutosPendentes] = useState<ProdutoEntrada[]>([]);
  const [modoBuscaProduto, setModoBuscaProduto] = useState<'codigo' | 'nome'>('codigo');
  const [modoAtribuicao, setModoAtribuicao] = useState<'TODOS_COM_EXCECOES' | 'SELECIONADOS'>(
    'TODOS_COM_EXCECOES'
  );
  const [verificandoCodigo, setVerificandoCodigo] = useState(false);

  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [confirmacaoModoAberta, setConfirmacaoModoAberta] = useState(false);
  const [modoAtribuicaoPendente, setModoAtribuicaoPendente] = useState<
    'TODOS_COM_EXCECOES' | 'SELECIONADOS' | null
  >(null);

  const ncmNormalizada = useMemo(() => ncm.replace(/\D/g, ''), [ncm]);
  const ncmValida = ncmNormalizada.length === 8;
  const ncmAnteriorRef = useRef<string>(ncmNormalizada);

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

  const pendentesValidos = useMemo(
    () => produtosPendentes.filter(item => item.tipo === 'valido'),
    [produtosPendentes]
  );

  const pendentesInvalidos = useMemo(
    () => produtosPendentes.filter(item => item.tipo === 'invalido'),
    [produtosPendentes]
  );

  const temMaisProdutosParaListar = useMemo(
    () =>
      produtoTotalResultados !== null &&
      produtoPaginaAtual * produtoPageSize < produtoTotalResultados,
    [produtoPaginaAtual, produtoPageSize, produtoTotalResultados]
  );

  const produtoSugestoesDisponiveis = useMemo(
    () =>
      produtoSugestoes.filter(
        item =>
          !produtosMarcados.some(produto => produto.id === item.id) &&
          !pendentesValidos.some(pendente => pendente.produto.id === item.id)
      ),
    [produtoSugestoes, produtosMarcados, pendentesValidos]
  );

  const normalizarSugestoesProduto = useCallback(
    (lista: ProdutoBuscaItem[]) => {
      const idsParaIgnorar = new Set<number>();

      for (const item of produtosMarcados) {
        idsParaIgnorar.add(item.id);
      }

      for (const pendente of pendentesValidos) {
        idsParaIgnorar.add(pendente.produto.id);
      }

      const idsAdicionados = new Set<number>();
      const normalizados: ProdutoBuscaItem[] = [];

      for (const item of lista) {
        if (idsParaIgnorar.has(item.id)) continue;
        if (idsAdicionados.has(item.id)) continue;
        idsAdicionados.add(item.id);
        normalizados.push(item);
      }

      return normalizados;
    },
    [pendentesValidos, produtosMarcados]
  );

  const carregarProdutos = useCallback(
    async (pagina: number, append: boolean, termoBusca?: string) => {
      const termoAtual = (termoBusca ?? debouncedProdutoBusca).trim();

      if (!termoAtual || !ncmValida) {
        return;
      }

      try {
        setCarregandoProdutos(true);
        const params: Record<string, string | number> = {
          busca: termoAtual,
          page: pagina,
          pageSize: PRODUTO_SUGESTOES_POR_PAGINA,
          ncm: ncmNormalizada
        };

        const resposta = await api.get<ProdutosResponse>('/produtos', { params });
        const itens = resposta.data.items || [];
        const termoNormalizado = termoAtual.toLowerCase();
        const codigoBusca = termoNormalizado.replace(/\s+/g, '');
        const filtrados =
          modoBuscaProduto === 'nome'
            ? itens.filter(item => item.denominacao.toLowerCase().includes(termoNormalizado))
            : itens.filter(item => produtoPossuiTrechoCodigo(item, codigoBusca));

        setProdutoPageSize(PRODUTO_SUGESTOES_POR_PAGINA);
        setProdutoTotalResultados(resposta.data.total ?? itens.length);
        setProdutoPaginaAtual(pagina);
        setProdutoBuscaAtiva(termoAtual);

        setProdutoSugestoes(prev => {
          const base = append ? [...prev, ...filtrados] : filtrados;
          return normalizarSugestoesProduto(base);
        });
      } catch (error) {
        console.error('Erro ao buscar produtos para exceção:', error);
        if (!append) {
          setProdutoSugestoes([]);
          setProdutoTotalResultados(null);
        }
      } finally {
        setCarregandoProdutos(false);
      }
    },
    [debouncedProdutoBusca, modoBuscaProduto, ncmNormalizada, ncmValida, normalizarSugestoesProduto]
  );

  const catalogoOptions = useMemo(
    () =>
      catalogos.map(catalogo => ({
        value: String(catalogo.id),
        label: montarDescricaoCatalogo(catalogo.nome, catalogo.cpf_cnpj)
      })),
    [catalogos]
  );

  const tituloProdutosMarcados =
    modoAtribuicao === 'SELECIONADOS' ? 'Produtos selecionados para aplicar' : 'Produtos como exceção';
  const descricaoProdutosMarcados =
    modoAtribuicao === 'SELECIONADOS'
      ? 'A atribuição será aplicada somente aos produtos listados abaixo.'
      : 'Os produtos selecionados abaixo não terão os atributos atualizados.';
  const mensagemSemProdutosMarcados =
    modoAtribuicao === 'SELECIONADOS'
      ? 'Nenhum produto selecionado até o momento.'
      : 'Nenhum produto foi marcado como exceção.';

  const produtosJaIncluidosOuPendentes = produtosMarcados.length + pendentesValidos.length;
  const totalResultadosProduto = produtoTotalResultados ?? 0;
  const totalRestantes = Math.max(totalResultadosProduto - produtosJaIncluidosOuPendentes, 0);
  const quantidadeSugestoesDesejada = useMemo(
    () => Math.min(PRODUTO_SUGESTOES_POR_PAGINA, totalRestantes),
    [totalRestantes]
  );
  const produtoSugestoesLimitadas = useMemo(
    () => produtoSugestoesDisponiveis.slice(0, quantidadeSugestoesDesejada),
    [produtoSugestoesDisponiveis, quantidadeSugestoesDesejada]
  );
  const resumoSugestoesProdutos =
    produtoBuscaAtiva && totalResultadosProduto > 0
      ? (
          <div className="flex flex-col gap-1 text-xs text-gray-400">
            <span>
              Exibindo {Math.min(quantidadeSugestoesDesejada, produtoSugestoesLimitadas.length)} de{' '}
              {totalRestantes} restantes.
            </span>
          </div>
        )
      : null;
  const tituloResumoProdutos =
    modoAtribuicao === 'SELECIONADOS'
      ? 'Produtos que receberão a atribuição'
      : 'Produtos que serão mantidos sem alteração';

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
    if (ncmAnteriorRef.current === ncmNormalizada) return;
    ncmAnteriorRef.current = ncmNormalizada;

    setProdutosMarcados([]);
    setProdutosPendentes([]);
    setProdutoSugestoes([]);
    setProdutoTotalResultados(null);
    setProdutoPaginaAtual(1);
    setProdutoPageSize(PRODUTO_SUGESTOES_POR_PAGINA);
    setProdutoBuscaAtiva('');
    setCarregandoProdutos(false);
    setProdutoBusca('');
    setModoAtribuicao('TODOS_COM_EXCECOES');
    setConfirmacaoAberta(false);
  }, [ncmNormalizada]);

  useEffect(() => {
    const termoBusca = debouncedProdutoBusca.trim();

    if (!termoBusca || !ncmValida) {
      setProdutoSugestoes([]);
      setProdutoTotalResultados(null);
      setProdutoPaginaAtual(1);
      setProdutoPageSize(PRODUTO_SUGESTOES_POR_PAGINA);
      setProdutoBuscaAtiva('');
      setCarregandoProdutos(false);
      return;
    }

    carregarProdutos(1, false, termoBusca);
  }, [carregarProdutos, debouncedProdutoBusca, ncmValida]);

  const reabastecerSugestoes = useCallback(() => {
    if (
      !produtoBuscaAtiva ||
      !temMaisProdutosParaListar ||
      carregandoProdutos ||
      quantidadeSugestoesDesejada === 0 ||
      produtoSugestoesDisponiveis.length >= quantidadeSugestoesDesejada + 1
    ) {
      return;
    }

    const proximaPagina = produtoPaginaAtual + 1;
    carregarProdutos(proximaPagina, true, produtoBuscaAtiva);
  }, [
    carregarProdutos,
    carregandoProdutos,
    produtoBuscaAtiva,
    produtoPaginaAtual,
    quantidadeSugestoesDesejada,
    produtoSugestoesDisponiveis.length,
    temMaisProdutosParaListar
  ]);

  useEffect(() => {
    reabastecerSugestoes();
  }, [reabastecerSugestoes]);

  async function carregarEstrutura(ncmCodigo: string, modalidadeSelecionada: string) {
    if (ncmCodigo.length < 8) return;
    setLoadingEstrutura(true);
    try {
      const response = await api.get(
        `/siscomex/atributos/ncm/${ncmCodigo}?modalidade=${modalidadeSelecionada}`,
        { timeout: NCM_ATTRIBUTES_TIMEOUT_MS }
      );
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
    if (ncmValida) {
      carregarEstrutura(ncmNormalizada, modalidade);
    } else {
      setEstruturaCarregada(false);
      setEstrutura([]);
      setValores({});
    }
  }, [ncmValida, ncmNormalizada, modalidade]);

  useEffect(() => {
    setProdutoBusca('');
    setProdutoSugestoes([]);
    setProdutoTotalResultados(null);
    setProdutoPaginaAtual(1);
    setProdutoPageSize(PRODUTO_SUGESTOES_POR_PAGINA);
    setProdutoBuscaAtiva('');
  }, [modoBuscaProduto]);

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
            options={
              attr.dominio?.map(d => ({
                value: d.codigo,
                label: `${d.codigo} - ${d.descricao}`
              })) || []
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
            label={attr.nome}
            hint={attr.orientacaoPreenchimento}
            type="number"
            required={attr.obrigatorio}
            value={value}
            step={attr.tipo === 'NUMERO_REAL' ? '0.01' : undefined}
            onChange={e => handleValor(attr.codigo, e.target.value)}
          />
        );
      case 'COMPOSTO':
        return (
          <div key={attr.codigo} className="col-span-3">
            <p className="mb-2 text-sm font-medium">{attr.nome}</p>
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
                label={attr.nome}
                hint={attr.orientacaoPreenchimento}
                required={attr.obrigatorio}
                value={value}
                pattern={pattern}
                onChange={(valorLimpo, _formatado) => handleValor(attr.codigo, valorLimpo)}
                className={span}
              />
            );
          }

          if (max >= 100) {
            return (
              <div key={attr.codigo} className="col-span-3 mb-4">
                <label
                  htmlFor={attr.codigo}
                  className="mb-1 block text-sm font-medium text-gray-300"
                >
                  {attr.nome}
                  {attr.obrigatorio && <span className="ml-1 text-red-400">*</span>}
                  {attr.orientacaoPreenchimento && (
                    <Hint text={attr.orientacaoPreenchimento} />
                  )}
                </label>
                <textarea
                  id={attr.codigo}
                  rows={3}
                  className="w-full rounded-md border border-gray-700 bg-[#1e2126] px-2 py-1 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring"
                  value={value}
                  onChange={e => handleValor(attr.codigo, e.target.value)}
                />
              </div>
            );
          }

          let span = 'col-span-1';
          if (max > 30 && max <= 60) span = 'col-span-2';
          else if (max > 60) span = 'col-span-3';

          return (
            <Input
              key={attr.codigo}
              label={attr.nome}
              hint={attr.orientacaoPreenchimento}
              required={attr.obrigatorio}
              value={value}
              onChange={e => handleValor(attr.codigo, e.target.value)}
              className={span}
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
            onChange={e => handleValor(attr.codigo, e.target.value)}
          />
        );
    }
  }

  const adicionarProdutoInvalido = useCallback(
    (valor: string, motivo: 'nao-encontrado' | 'duplicado' | 'erro') => {
      const mensagem =
        motivo === 'nao-encontrado'
          ? 'Código não encontrado. Selecione o produto na lista para confirmar.'
          : motivo === 'duplicado'
            ? 'Mais de um produto possui este código. Escolha manualmente qual deseja incluir.'
            : 'Não foi possível validar o código informado. Tente novamente.';
      setProdutosPendentes(prev => [
        ...prev,
        {
          id: gerarIdTemporario(),
          tipo: 'invalido',
          valor,
          mensagem,
          motivo
        }
      ]);
    },
    []
  );

  const adicionarProdutoPendente = useCallback(
    (
      produto: ProdutoBuscaItem,
      origem: 'busca' | 'codigo',
      opcoes?: { incluirAutomaticamente?: boolean; manterBusca?: boolean }
    ) => {
      const { incluirAutomaticamente = false, manterBusca = false } = opcoes ?? {};

      if (produtosMarcados.some(item => item.id === produto.id)) {
        addToast('Produto já foi incluído na lista.', 'error');
        if (!manterBusca) {
          setProdutoBusca('');
        }
        return;
      }
      if (
        produtosPendentes.some(
          entrada => entrada.tipo === 'valido' && entrada.produto.id === produto.id
        )
      ) {
        addToast('Produto já está aguardando inclusão.', 'error');
        if (!manterBusca) {
          setProdutoBusca('');
        }
        return;
      }

      if (incluirAutomaticamente) {
        setProdutosMarcados(prev => {
          if (prev.some(item => item.id === produto.id)) {
            return prev;
          }
          return [...prev, produto];
        });
        setProdutosPendentes(prev =>
          prev.filter(
            entrada => !(entrada.tipo === 'valido' && entrada.produto.id === produto.id)
          )
        );
      } else {
        setProdutosPendentes(prev => [
          ...prev,
          {
            id: gerarIdTemporario(),
            tipo: 'valido',
            produto,
            origem
          }
        ]);
      }

      setProdutoSugestoes(prev => prev.filter(item => item.id !== produto.id));
      if (!manterBusca) {
        setProdutoBusca('');
      }
    },
    [addToast, produtosMarcados, produtosPendentes]
  );

  const removerProdutoPendente = useCallback((entrada: ProdutoEntrada) => {
    setProdutosPendentes(prev => prev.filter(item => item.id !== entrada.id));
  }, []);

  const incluirProdutosPendentes = useCallback(() => {
    const validos = produtosPendentes.filter(item => item.tipo === 'valido');
    if (validos.length === 0) {
      addToast('Nenhum produto válido para incluir.', 'error');
      return;
    }

    const existentes = new Set(produtosMarcados.map(item => item.id));
    const novosProdutos: ProdutoBuscaItem[] = [];
    let duplicados = 0;

    for (const entrada of validos) {
      if (existentes.has(entrada.produto.id)) {
        duplicados += 1;
        continue;
      }
      existentes.add(entrada.produto.id);
      novosProdutos.push(entrada.produto);
    }

    if (novosProdutos.length > 0) {
      setProdutosMarcados(prev => [...prev, ...novosProdutos]);
      addToast(
        `${novosProdutos.length} produto${novosProdutos.length > 1 ? 's' : ''} incluído${
          novosProdutos.length > 1 ? 's' : ''
        } como exceção.`,
        'success'
      );
    }

    if (duplicados > 0) {
      addToast('Alguns produtos já estavam na lista de exceção e foram ignorados.', 'error');
    }

    const restantes = produtosPendentes.filter(item => item.tipo !== 'valido');
    setProdutosPendentes(restantes);

    if (restantes.some(item => item.tipo === 'invalido')) {
      addToast('Revise os códigos destacados em vermelho antes de continuar.', 'error');
    }

    if (novosProdutos.length === 0 && duplicados === 0) {
      addToast('Nenhum produto válido foi encontrado para inclusão.', 'error');
    }
  }, [addToast, produtosPendentes, produtosMarcados]);

  const limparProdutosPendentes = useCallback(() => {
    setProdutosPendentes([]);
    setProdutoBusca('');
    setProdutoSugestoes([]);
  }, []);

  const processarCodigoDigitado = useCallback(
    async (codigoDigitado: string) => {
      const codigoNormalizado = normalizarCodigoProduto(codigoDigitado);
      if (!codigoNormalizado) {
        setProdutoBusca('');
        return;
      }

      if (!ncmValida) {
        addToast('Informe uma NCM válida antes de buscar produtos.', 'error');
        setProdutoBusca('');
        return;
      }

      if (
        produtosMarcados.some(item => produtoPossuiCodigo(item, codigoNormalizado)) ||
        produtosPendentes.some(
          entrada =>
            entrada.tipo === 'valido' &&
            produtoPossuiCodigo(entrada.produto, codigoNormalizado)
        )
      ) {
        addToast('Produto já selecionado como exceção.', 'error');
        setProdutoBusca('');
        return;
      }

      try {
        setVerificandoCodigo(true);
        const params: Record<string, string | number> = {
          busca: codigoDigitado,
          page: 1,
          pageSize: 10
        };
        params.ncm = ncmNormalizada;
        const resposta = await api.get<ProdutosResponse>('/produtos', { params });
        const itens = resposta.data.items || [];
        const correspondentes = itens.filter(item =>
          produtoPossuiCodigo(item, codigoNormalizado)
        );

        if (correspondentes.length === 1) {
          adicionarProdutoPendente(correspondentes[0], 'codigo', {
            incluirAutomaticamente: true
          });
        } else if (correspondentes.length === 0) {
          adicionarProdutoInvalido(codigoDigitado, 'nao-encontrado');
        } else {
          adicionarProdutoInvalido(codigoDigitado, 'duplicado');
        }
      } catch (error) {
        console.error('Erro ao validar código do produto:', error);
        adicionarProdutoInvalido(codigoDigitado, 'erro');
      } finally {
        setVerificandoCodigo(false);
        setProdutoBusca('');
      }
    },
    [
      addToast,
      ncmValida,
      ncmNormalizada,
      produtosMarcados,
      produtosPendentes,
      adicionarProdutoPendente,
      adicionarProdutoInvalido
    ]
  );

  const handlePasteProdutosCodigo = useCallback(
    (event: React.ClipboardEvent<HTMLInputElement>) => {
      if (modoBuscaProduto !== 'codigo') return;

      const texto = event.clipboardData.getData('text');
      if (!texto) return;

      event.preventDefault();

      const codigos = texto
        .split(/\s+/)
        .map(codigo => codigo.trim())
        .filter(Boolean);

      setProdutoBusca('');

      if (codigos.length === 0) {
        return;
      }

      void (async () => {
        for (const codigo of codigos) {
          await processarCodigoDigitado(codigo);
        }
      })();
    },
    [modoBuscaProduto, processarCodigoDigitado]
  );

  useEffect(() => {
    if (modoBuscaProduto !== 'codigo') return;
    if (verificandoCodigo) return;
    if (!produtoBusca.endsWith(' ')) return;

    const codigoDigitado = produtoBusca.trim();
    if (!codigoDigitado) {
      setProdutoBusca('');
      return;
    }
    processarCodigoDigitado(codigoDigitado);
  }, [modoBuscaProduto, produtoBusca, processarCodigoDigitado, verificandoCodigo]);

  const obterDescricaoProduto = useCallback((produto: ProdutoBuscaItem) => {
    const codigoPreferencial = obterCodigoPreferencial(produto);
    return codigoPreferencial
      ? `${codigoPreferencial} • ${produto.denominacao}`
      : produto.denominacao;
  }, []);

  const renderTagPendente = useCallback(
    (entrada: ProdutoEntrada, remover: (item: ProdutoEntrada) => void) => {
      if (entrada.tipo === 'valido') {
        const descricaoTooltip = obterDescricaoProduto(entrada.produto);
        return (
          <span
            className="flex items-center gap-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
            title={entrada.origem === 'codigo' ? descricaoTooltip : undefined}
          >
            <span className="max-w-[160px] truncate">{obterDescricaoProduto(entrada.produto)}</span>
            <button
              type="button"
              onClick={() => remover(entrada)}
              className="rounded p-0.5 text-gray-400 hover:text-white"
              aria-label="Remover produto pendente"
            >
              <X size={12} />
            </button>
          </span>
        );
      }
      return (
        <span
          className="flex items-center gap-1 rounded border border-red-500 bg-red-950 px-2 py-1 text-xs text-red-200"
          title={entrada.mensagem}
        >
          <span className="max-w-[160px] truncate">{entrada.valor}</span>
          <button
            type="button"
            onClick={() => remover(entrada)}
            className="rounded p-0.5 text-red-300 hover:text-red-100"
            aria-label={`Remover código ${entrada.valor} inválido`}
          >
            <X size={12} />
          </button>
        </span>
      );
    },
    [obterDescricaoProduto]
  );

  const handleModoAtribuicaoChange = useCallback(
    (valor: string) => {
      const novoModo = (valor as 'TODOS_COM_EXCECOES' | 'SELECIONADOS') ?? 'TODOS_COM_EXCECOES';
      if (novoModo === modoAtribuicao) return;

      if (produtosMarcados.length > 0) {
        setModoAtribuicaoPendente(novoModo);
        setConfirmacaoModoAberta(true);
        return;
      }

      setModoAtribuicao(novoModo);
      setProdutosMarcados([]);
      setProdutosPendentes([]);
    },
    [modoAtribuicao, produtosMarcados.length]
  );

  const confirmarMudancaModo = useCallback(() => {
    if (!modoAtribuicaoPendente) return;

    setModoAtribuicao(modoAtribuicaoPendente);
    setProdutosMarcados([]);
    setProdutosPendentes([]);
    setModoAtribuicaoPendente(null);
    setConfirmacaoModoAberta(false);
  }, [modoAtribuicaoPendente]);

  const cancelarMudancaModo = useCallback(() => {
    setModoAtribuicaoPendente(null);
    setConfirmacaoModoAberta(false);
  }, []);

  function removerProdutoMarcado(id: number) {
    setProdutosMarcados(prev => prev.filter(item => item.id !== id));
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

    if (modoAtribuicao === 'SELECIONADOS' && produtosMarcados.length === 0) {
      setErroFormulario('Selecione ao menos um produto para aplicar a atribuição.');
      addToast('Selecione ao menos um produto para aplicar a atribuição.', 'error');
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

      const payload: {
        ncmCodigo: string;
        modalidade: 'IMPORTACAO' | 'EXPORTACAO';
        catalogoIds?: number[];
        valoresAtributos: Record<string, string | string[]>;
        estruturaSnapshot: AtributoEstrutura[];
        modoAtribuicao: 'TODOS_COM_EXCECOES' | 'SELECIONADOS';
        produtosExcecao?: Array<{ id: number }>;
        produtosSelecionados?: Array<{ id: number }>;
      } = {
        ncmCodigo: ncm.replace(/\D/g, ''),
        modalidade,
        valoresAtributos: atributosPreenchidos,
        estruturaSnapshot: estrutura,
        modoAtribuicao
      };

      if (catalogoIdsPayload.length) {
        payload.catalogoIds = catalogoIdsPayload;
      }

      if (modoAtribuicao === 'SELECIONADOS') {
        payload.produtosSelecionados = produtosMarcados.map(item => ({ id: item.id }));
      } else if (produtosMarcados.length > 0) {
        payload.produtosExcecao = produtosMarcados.map(item => ({ id: item.id }));
      }

      const resposta = await api.post<PreenchimentoMassaAgendamentoResponse>(
        '/automacao/atributos-massa',
        payload
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

  const atributosResumoCompacto = useMemo((): Array<{ chave: string; valor: string }> => {
    if (atributosPreenchidosLista.length === 0) {
      return [];
    }

    return atributosPreenchidosLista.map(({ atributo, valor }) => {
      const chave = atributo?.nome || atributo?.codigo || 'Atributo';
      const valorFormatado = formatarValorAtributo(atributo, valor);
      return { chave, valor: valorFormatado };
    });
  }, [atributosPreenchidosLista]);

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

          {!ncmValida && (
            <p className="rounded border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400">
              Informe uma NCM válida para habilitar o preenchimento de atributos e a seleção de produtos.
            </p>
          )}

          {ncmValida && (
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
                <div className="grid grid-cols-3 gap-4 text-sm">
                  {estrutura.map(attr => renderCampo(attr))}
                </div>
              )}
            </Card>
          )}

          {ncmValida && (
            <Card className="overflow-visible">
            <div className="mb-4 space-y-4">
              <div className="w-full md:w-80">
                <h2 className="text-lg font-semibold text-white">Modo de Atribuição</h2>
                <RadioGroup
                  value={modoAtribuicao}
                  onChange={handleModoAtribuicaoChange}
                  options={[
                    { value: 'TODOS_COM_EXCECOES', label: 'Todos os produtos com exceções' },
                    { value: 'SELECIONADOS', label: 'Somente produtos selecionados' }
                  ]}
                />
              </div>
              <div>
                
                <p className="text-sm text-gray-400">{descricaoProdutosMarcados}</p>
              </div>
            </div>

            <RadioGroup
              className="mb-2"
              label="Buscar produto por"
              value={modoBuscaProduto}
              onChange={valor => setModoBuscaProduto((valor as 'codigo' | 'nome') || 'codigo')}
              options={[
                { value: 'codigo', label: 'Código' },
                { value: 'nome', label: 'Nome' }
              ]}
            />

            {modoBuscaProduto === 'codigo' && (
              <p className="-mt-2 mb-2 text-xs text-gray-400">
                Digite o código e pressione espaço para adicioná-lo automaticamente.
              </p>
            )}

            <AutocompleteTagInput<ProdutoBuscaItem, ProdutoEntrada>
              label={`Produtos (${modoBuscaProduto === 'codigo' ? 'código' : 'nome'})`}
              icon={<Search size={16} />}
              placeholder={
                modoBuscaProduto === 'codigo'
                  ? 'Digite o código do produto'
                  : 'Digite o nome do produto'
              }
              searchValue={produtoBusca}
              onSearchChange={valor => setProdutoBusca(valor)}
              suggestions={produtoSugestoesLimitadas}
              onSelect={produto =>
                adicionarProdutoPendente(produto, 'busca', {
                  incluirAutomaticamente: true,
                  manterBusca: true
                })
              }
              selectedItems={produtosPendentes}
              onRemove={entrada => removerProdutoPendente(entrada)}
              getItemKey={item => item.id}
              getSuggestionKey={item => item.id}
              renderTagLabel={entrada =>
                entrada.tipo === 'valido'
                  ? obterDescricaoProduto(entrada.produto)
                  : entrada.valor
              }
              renderTag={renderTagPendente}
              renderSuggestion={(item: ProdutoBuscaItem) => {
                const codigos = obterCodigosExibicao(item);
                const descricaoCodigo =
                  codigos.length > 0
                    ? `Código${codigos.length > 1 ? 's' : ''}: ${codigos.join(', ')}`
                    : 'Sem código cadastrado';
                const descricaoCatalogo = montarDescricaoCatalogo(item.catalogoNome, item.catalogoCpfCnpj);

                return (
                  <div className="flex w-full flex-col">
                    <span className="font-semibold text-white">{item.denominacao}</span>
                    <span className="text-xs text-gray-400">
                      {descricaoCodigo} • {descricaoCatalogo}
                    </span>
                  </div>
                );
              }}
              suggestionsInfo={resumoSugestoesProdutos}
              isLoading={carregandoProdutos || verificandoCodigo}
              emptyMessage={
                produtoBusca.trim().length > 0
                  ? `Nenhum produto encontrado pelo ${
                      modoBuscaProduto === 'codigo' ? 'código informado' : 'nome informado'
                    }.`
                  : `Digite para buscar pelo ${modoBuscaProduto === 'codigo' ? 'código' : 'nome'} do produto.`
              }
              actionButtons={[
                {
                  label: 'Limpar',
                  onClick: limparProdutosPendentes,
                  disabled: produtosPendentes.length === 0 && produtoBusca.trim().length === 0,
                  variant: 'outline'
                }
              ]}
              onPaste={handlePasteProdutosCodigo}
            />

            {pendentesInvalidos.length > 0 && (
              <p className="mb-3 text-xs text-red-300">
                Os códigos destacados em vermelho não foram encontrados ou possuem mais de um resultado.
                Escolha o produto correto antes de incluí-los.
              </p>
            )}

            {produtosMarcados.length > 0 ? (
              <div className="space-y-3">
                {produtosMarcados.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200"
                  >
                    <div>
                      <p className="font-semibold">{item.denominacao}</p>
                      {(() => {
                        const codigosInternos = (item.codigosInternos ?? []).map(codigo => codigo?.trim()).filter(Boolean) as string[];
                        const descricaoCodigos =
                          codigosInternos.length > 0
                            ? `Códigos internos: ${codigosInternos.join(', ')}`
                            : 'Sem código interno';
                        const descricaoCatalogo = montarDescricaoCatalogo(item.catalogoNome, item.catalogoCpfCnpj);

                        return (
                          <p className="text-xs text-gray-400">
                            {descricaoCodigos} • {descricaoCatalogo}
                          </p>
                        );
                      })()}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex h-8 w-8 items-center justify-center"
                      onClick={() => removerProdutoMarcado(item.id)}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">{mensagemSemProdutosMarcados}</p>
            )}
            </Card>
          )}
        </div>

      </div>

      {confirmacaoModoAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <AlertTriangle size={28} className="text-amber-300" />
              <div>
                <h2 className="text-lg font-semibold text-white">Alterar modo de atribuição</h2>
                <p className="text-sm text-gray-400">
                  Os produtos selecionados serão removidos ao confirmar a troca de modo.
                </p>
              </div>
            </div>

            {modoAtribuicaoPendente && (
              <div className="rounded border border-gray-800 bg-gray-950 p-4 text-sm text-gray-200">
                <p className="font-semibold text-white">Novo modo selecionado</p>
                <p className="mt-1 text-gray-300">
                  {modoAtribuicaoPendente === 'SELECIONADOS'
                    ? 'Somente os produtos selecionados receberão os atributos.'
                    : 'Todos os produtos serão atualizados, permitindo exceções.'}
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={cancelarMudancaModo}>
                Manter modo atual
              </Button>
              <Button variant="danger" onClick={confirmarMudancaModo}>
                Alterar modo
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmacaoAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-xl max-h-[90vh]">
            <div className="mb-4 flex items-center gap-3">
              <CheckCircle2 size={32} className="text-emerald-400" />
              <div>
                <h2 className="text-xl font-semibold text-white">Confirmar atribuição em massa</h2>
                <p className="text-sm text-gray-400">
                  Revise as informações abaixo antes de aplicar os atributos.
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-hidden space-y-4 text-sm text-gray-200">
              <div className="rounded border border-gray-800 bg-gray-950 p-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <p>
                    <span className="text-gray-400">NCM:</span> {formatarNCMExibicao(ncm)}
                  </p>
                  <p>
                    <span className="text-gray-400">Modalidade:</span>{' '}
                    {modalidade === 'IMPORTACAO' ? 'Importação' : 'Exportação'}
                  </p>
                  <p>
                    <span className="text-gray-400">Modo:</span>{' '}
                    {modoAtribuicao === 'SELECIONADOS'
                      ? 'Somente produtos selecionados'
                      : 'Todos os produtos com exceções'}
                  </p>
                </div>
                <p className="mt-2 text-sm">
                  <span className="text-gray-400">Catálogos:</span>{' '}
                  {catalogosSelecionados.length > 0 ? (
                    catalogos
                      .filter(cat => catalogosSelecionados.includes(String(cat.id)))
                      .map(cat => montarDescricaoCatalogo(cat.nome, cat.cpf_cnpj))
                      .join(', ')
                  ) : (
                    <span className="font-semibold text-amber-400">
                      Nenhum catálogo selecionado — todos os catálogos serão atualizados.
                    </span>
                  )}
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
                  Atributos que serão atualizados
                </h3>
                {atributosPreenchidosLista.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhum atributo preenchido.</p>
                ) : (
                  <div className="rounded border border-gray-800 bg-gray-950 p-3 text-sm text-gray-200 leading-relaxed">
                    <ul className="space-y-2">
                      {atributosResumoCompacto.map(({ chave, valor }, index) => (
                        <li key={`${chave}-${index}`} className="text-sm">
                          <span className="font-semibold text-white">{chave}</span>
                          <span className="text-gray-300"> = {valor}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {produtosMarcados.length > 0 && (
                <div className="flex h-full flex-col">
                  <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={20} className="text-amber-300" />
                      <h3 className="text-base font-semibold uppercase tracking-wide text-amber-200">
                        {tituloResumoProdutos}
                      </h3>
                    </div>
                    <p className="mt-2 text-xs text-amber-100">
                      {descricaoProdutosMarcados}{' '}
                      <span className="font-semibold text-white">
                        Quantidade: {produtosMarcados.length}{' '}
                        {produtosMarcados.length === 1 ? 'produto' : 'produtos'}
                      </span>
                    </p>
                  </div>
                  <div className="mt-3 max-h-60 overflow-y-auto rounded border border-gray-800 bg-gray-950">
                    <ul className="divide-y divide-gray-800">
                      {produtosMarcados.map(item => (
                        <li key={item.id} className="px-3 py-2">
                          <p className="font-semibold text-white">{item.denominacao}</p>
                          {(() => {
                            const codigosInternos = (item.codigosInternos ?? [])
                              .map(codigo => codigo?.trim())
                              .filter(Boolean) as string[];
                            const descricaoCodigos =
                              codigosInternos.length > 0
                                ? `Códigos internos: ${codigosInternos.join(', ')}`
                                : 'Sem código interno';
                            const descricaoCatalogo = montarDescricaoCatalogo(item.catalogoNome, item.catalogoCpfCnpj);

                            return (
                              <p className="text-xs text-gray-400">
                                {descricaoCodigos} • {descricaoCatalogo}
                              </p>
                            );
                          })()}
                        </li>
                      ))}
                    </ul>
                  </div>
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
