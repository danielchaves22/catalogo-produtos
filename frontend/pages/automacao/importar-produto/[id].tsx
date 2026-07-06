import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/PageLoader';
import api from '@/lib/api';
import { formatCPFOrCNPJ } from '@/lib/validation';
import { useToast } from '@/components/ui/ToastContext';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Info,
  RotateCcw,
} from 'lucide-react';

interface MensagensItem {
  impeditivos?: string[];
  atencao?: string[];
}

interface ImportacaoItem {
  id: number;
  linhaPlanilha: number;
  ncm?: string | null;
  denominacao?: string | null;
  codigosInternos?: string | null;
  resultado: 'SUCESSO' | 'ATENCAO' | 'ERRO';
  mensagens?: MensagensItem;
  possuiErroImpeditivo: boolean;
  possuiAlerta: boolean;
  produtoId?: number | null;
}

interface SiscomexResumoPendencia {
  referencia: string;
  motivo: string;
}

interface SiscomexResumoImportacao {
  origem: 'SISCOMEX_ARQUIVO';
  arquivos: {
    produtos: string;
    operadores: string | null;
    fabricantes: string | null;
  };
  modalidadeDetectada: string;
  produtos: {
    totalArquivo: number;
    criados: number;
    criadosAprovados: number;
    criadosPendentes: number;
    existentesTransmitidos: number;
    existentesNaoTransmitidos: number;
    ambiguos: number;
    divergenciaNcm: number;
    comErro: number;
  };
  operadores: {
    informado: boolean;
    totalArquivo: number;
    criados: number;
    existentesTransmitidos: number;
    existentesNaoTransmitidos: number;
    ambiguos: number;
    conflitos: number;
    comErro: number;
    pendencias: SiscomexResumoPendencia[];
  };
  vinculos: {
    informado: boolean;
    totalArquivo: number;
    criados: number;
    existentes: number;
    criadosComOperador: number;
    criadosSomentePais: number;
    semProduto: number;
    semOperador: number;
    comErro: number;
    pendencias: SiscomexResumoPendencia[];
  };
}

interface ImportacaoDetalhe {
  id: number;
  catalogo: {
    id: number;
    nome: string;
    numero: number;
    cpf_cnpj?: string | null;
  };
  nomeArquivo?: string | null;
  modalidade: string;
  origemImportacao: 'PLANILHA' | 'SISCOMEX_ARQUIVO';
  resumoSiscomex?: SiscomexResumoImportacao | null;
  situacao: 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CONCLUIDA_INCOMPLETA' | 'REVERTIDA';
  resultado: 'PENDENTE' | 'SUCESSO' | 'ATENCAO';
  totalRegistros: number;
  totalCriados: number;
  totalComAtencao: number;
  totalComErro: number;
  iniciadoEm: string;
  finalizadoEm?: string | null;
  itens: ImportacaoItem[];
}

type ImportacaoItemResposta = Omit<ImportacaoItem, 'mensagens'> & {
  mensagens?: unknown;
};

type ImportacaoDetalheResposta = Omit<ImportacaoDetalhe, 'itens'> & {
  itens: ImportacaoItemResposta[];
};

function formatarData(data?: string | null) {
  if (!data) return '-';
  const objeto = new Date(data);
  if (Number.isNaN(objeto.getTime())) return '-';
  return `${objeto.toLocaleDateString('pt-BR')} ${objeto.toLocaleTimeString('pt-BR')}`;
}

function traduzResultado(resultado: ImportacaoDetalhe['resultado']) {
  switch (resultado) {
    case 'SUCESSO':
      return 'Sucesso';
    case 'ATENCAO':
      return 'Atencao';
    default:
      return 'Pendente';
  }
}

function obterClasseResultado(resultado: ImportacaoDetalhe['resultado']) {
  switch (resultado) {
    case 'SUCESSO':
      return 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40';
    case 'ATENCAO':
      return 'bg-amber-500/10 text-amber-300 border border-amber-500/40';
    default:
      return 'bg-slate-500/10 text-slate-300 border border-slate-500/40';
  }
}

function traduzModalidade(modalidade: string) {
  if (modalidade === 'EXPORTACAO') return 'Exportacao';
  if (modalidade === 'MISTA') return 'Mista';
  return 'Importacao';
}

function traduzSituacao(situacao: ImportacaoDetalhe['situacao']) {
  switch (situacao) {
    case 'CONCLUIDA':
      return 'Concluida';
    case 'CONCLUIDA_INCOMPLETA':
      return 'Concluida - Incompleta';
    case 'REVERTIDA':
      return 'Revertida';
    default:
      return 'Em andamento';
  }
}

function traduzOrigem(origem: ImportacaoDetalhe['origemImportacao']) {
  return origem === 'SISCOMEX_ARQUIVO' ? 'SISCOMEX por arquivo' : 'Planilha Excel';
}

function obterClasseSituacaoBadge(situacao: ImportacaoDetalhe['situacao']) {
  if (situacao === 'CONCLUIDA') {
    return 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40';
  }
  if (situacao === 'CONCLUIDA_INCOMPLETA') {
    return 'bg-rose-500/10 text-rose-300 border border-rose-500/40';
  }
  if (situacao === 'REVERTIDA') {
    return 'bg-amber-500/10 text-amber-200 border border-amber-500/40';
  }
  return 'bg-sky-500/10 text-sky-300 border border-sky-500/40';
}

function normalizarMensagens(mensagens: unknown): MensagensItem {
  if (!mensagens) {
    return {};
  }

  if (typeof mensagens === 'string') {
    try {
      return normalizarMensagens(JSON.parse(mensagens));
    } catch {
      return {};
    }
  }

  if (Array.isArray(mensagens)) {
    const itens = mensagens.filter((valor): valor is string => typeof valor === 'string');
    return itens.length ? { impeditivos: itens } : {};
  }

  if (typeof mensagens === 'object') {
    const objeto = mensagens as Record<string, unknown>;
    const impeditivos = Array.isArray(objeto.impeditivos)
      ? objeto.impeditivos.filter((valor): valor is string => typeof valor === 'string')
      : [];
    const atencao = Array.isArray(objeto.atencao)
      ? objeto.atencao.filter((valor): valor is string => typeof valor === 'string')
      : [];

    const resultado: MensagensItem = {};
    if (impeditivos.length) resultado.impeditivos = impeditivos;
    if (atencao.length) resultado.atencao = atencao;
    return resultado;
  }

  return {};
}

function normalizarDetalheImportacao(
  dados: ImportacaoDetalheResposta
): ImportacaoDetalhe {
  return {
    ...dados,
    itens: (dados.itens ?? []).map(item => ({
      ...item,
      mensagens: normalizarMensagens(item.mensagens),
    })),
  };
}

function ListaMensagens({ itens }: { itens?: string[] }) {
  if (!itens || itens.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 list-disc pl-5 text-sm text-gray-200">
      {itens.map((mensagem, indice) => (
        <li key={`${mensagem}-${indice}`}>{mensagem}</li>
      ))}
    </ul>
  );
}

function ResumoSiscomexCard({
  resumo,
}: {
  resumo: SiscomexResumoImportacao;
}) {
  return (
    <Card className="mb-6 border border-sky-500/30 bg-sky-500/5">
      <div className="flex items-start gap-3">
        <Info size={18} className="mt-1 text-sky-300" />
        <div className="w-full">
          <h2 className="text-lg font-semibold text-white">Resumo SISCOMEX</h2>
          <p className="mt-1 text-sm text-sky-100/80">
            Modalidade detectada: <span className="font-medium text-white">{traduzModalidade(resumo.modalidadeDetectada)}</span>
          </p>
          <div className="mt-3 grid gap-2 text-sm text-gray-300 md:grid-cols-3">
            <p>
              <span className="font-semibold text-gray-200">Produtos:</span>{' '}
              {resumo.arquivos.produtos}
            </p>
            <p>
              <span className="font-semibold text-gray-200">Operadores:</span>{' '}
              {resumo.arquivos.operadores || 'Nao informado'}
            </p>
            <p>
              <span className="font-semibold text-gray-200">Vinculos:</span>{' '}
              {resumo.arquivos.fabricantes || 'Nao informado'}
            </p>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-gray-300">
              <p className="font-semibold text-white">Produtos</p>
              <ul className="mt-3 space-y-1">
                <li>Total no arquivo: {resumo.produtos.totalArquivo}</li>
                <li>Criados: {resumo.produtos.criados}</li>
                <li>Criados aprovados: {resumo.produtos.criadosAprovados}</li>
                <li>Criados pendentes: {resumo.produtos.criadosPendentes}</li>
                <li>Ja existentes e transmitidos: {resumo.produtos.existentesTransmitidos}</li>
                <li>Ja existentes e nao transmitidos: {resumo.produtos.existentesNaoTransmitidos}</li>
                <li>Ambiguos: {resumo.produtos.ambiguos}</li>
                <li>Divergencia de NCM: {resumo.produtos.divergenciaNcm}</li>
                <li>Com erro: {resumo.produtos.comErro}</li>
              </ul>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-gray-300">
              <p className="font-semibold text-white">Operadores estrangeiros</p>
              <ul className="mt-3 space-y-1">
                <li>Arquivo informado: {resumo.operadores.informado ? 'Sim' : 'Nao'}</li>
                <li>Total no arquivo: {resumo.operadores.totalArquivo}</li>
                <li>Criados: {resumo.operadores.criados}</li>
                <li>Ja existentes e transmitidos: {resumo.operadores.existentesTransmitidos}</li>
                <li>Ja existentes e nao transmitidos: {resumo.operadores.existentesNaoTransmitidos}</li>
                <li>Ambiguos: {resumo.operadores.ambiguos}</li>
                <li>Conflitos: {resumo.operadores.conflitos}</li>
                <li>Com erro: {resumo.operadores.comErro}</li>
              </ul>
              {resumo.operadores.pendencias.length > 0 && (
                <>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-amber-200">
                    Pendencias
                  </p>
                  <ul className="mt-2 list-disc space-y-2 pl-5 text-xs text-gray-300">
                    {resumo.operadores.pendencias.map(pendencia => (
                      <li key={`${pendencia.referencia}-${pendencia.motivo}`}>
                        <span className="font-medium text-white">{pendencia.referencia}:</span>{' '}
                        {pendencia.motivo}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-gray-300">
              <p className="font-semibold text-white">Vinculos</p>
              <ul className="mt-3 space-y-1">
                <li>Arquivo informado: {resumo.vinculos.informado ? 'Sim' : 'Nao'}</li>
                <li>Total no arquivo: {resumo.vinculos.totalArquivo}</li>
                <li>Criados: {resumo.vinculos.criados}</li>
                <li>Ja existentes: {resumo.vinculos.existentes}</li>
                <li>Criados com operador: {resumo.vinculos.criadosComOperador}</li>
                <li>Criados somente por pais: {resumo.vinculos.criadosSomentePais}</li>
                <li>Sem produto: {resumo.vinculos.semProduto}</li>
                <li>Sem operador: {resumo.vinculos.semOperador}</li>
                <li>Com erro: {resumo.vinculos.comErro}</li>
              </ul>
              {resumo.vinculos.pendencias.length > 0 && (
                <>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-amber-200">
                    Pendencias
                  </p>
                  <ul className="mt-2 list-disc space-y-2 pl-5 text-xs text-gray-300">
                    {resumo.vinculos.pendencias.map(pendencia => (
                      <li key={`${pendencia.referencia}-${pendencia.motivo}`}>
                        <span className="font-medium text-white">{pendencia.referencia}:</span>{' '}
                        {pendencia.motivo}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ItemImportacaoCard({
  item,
  cor,
  referenciaLabel,
  titulo,
  chip,
}: {
  item: ImportacaoItem;
  cor: 'erro' | 'atencao' | 'sucesso';
  referenciaLabel: string;
  titulo: string;
  chip?: string | null;
}) {
  const mensagens = item.mensagens ?? {};
  const classeCard =
    cor === 'erro'
      ? 'border-red-500/40 bg-red-500/5 text-gray-200'
      : cor === 'atencao'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100';

  return (
    <div className={`rounded-lg border p-4 text-sm ${classeCard}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-white">
            {referenciaLabel} {item.linhaPlanilha}
          </p>
          <p className="text-xs text-white/80">NCM {item.ncm || 'Nao informada'}</p>
        </div>
        {chip && (
          <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs font-medium text-white">
            {chip}
          </span>
        )}
      </div>

      <p className="mt-3 text-sm">
        {titulo}:{' '}
        <span className="font-semibold text-white">
          {item.denominacao || 'Sem nome informado'}
        </span>
      </p>

      {item.codigosInternos && (
        <p className="mt-1 text-xs text-white/80">Codigos internos: {item.codigosInternos}</p>
      )}

      <ListaMensagens itens={mensagens.impeditivos} />
      <ListaMensagens itens={mensagens.atencao} />
    </div>
  );
}

export default function ImportacaoDetalhePage() {
  const router = useRouter();
  const { id } = router.query;
  const { addToast } = useToast();
  const [detalhe, setDetalhe] = useState<ImportacaoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [errosAbertos, setErrosAbertos] = useState(true);
  const [atencoesAbertas, setAtencoesAbertas] = useState(true);
  const [sucessosAbertos, setSucessosAbertos] = useState(false);
  const [mostrarConfirmacaoReversao, setMostrarConfirmacaoReversao] = useState(false);
  const [revertendo, setRevertendo] = useState(false);

  const importacaoId = Array.isArray(id) ? id[0] : id;

  const carregarDetalhes = useCallback(
    async (silencioso = false) => {
      if (!importacaoId) return;

      try {
        if (!silencioso) {
          setCarregando(true);
        }

        const resposta = await api.get<ImportacaoDetalheResposta>(
          `/produtos/importacoes/${importacaoId}`
        );
        setDetalhe(normalizarDetalheImportacao(resposta.data));
        setErro(null);
      } catch (error: any) {
        console.error('Erro ao carregar importacao', error);
        const mensagem =
          error.response?.data?.error || 'Nao foi possivel carregar os detalhes.';
        setErro(mensagem);
        if (!silencioso) {
          addToast(mensagem, 'error');
        }
      } finally {
        if (!silencioso) {
          setCarregando(false);
        }
      }
    },
    [addToast, importacaoId]
  );

  useEffect(() => {
    carregarDetalhes();
  }, [carregarDetalhes]);

  useEffect(() => {
    if (!detalhe || detalhe.situacao !== 'EM_ANDAMENTO') {
      return;
    }

    const interval = setInterval(() => {
      carregarDetalhes(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [carregarDetalhes, detalhe]);

  const itensErro = useMemo(
    () => detalhe?.itens.filter(item => item.resultado === 'ERRO') ?? [],
    [detalhe]
  );
  const itensAtencao = useMemo(
    () => detalhe?.itens.filter(item => item.resultado === 'ATENCAO') ?? [],
    [detalhe]
  );
  const itensSucesso = useMemo(
    () => detalhe?.itens.filter(item => item.resultado === 'SUCESSO') ?? [],
    [detalhe]
  );

  const totaisResumo = useMemo(() => {
    if (!detalhe) {
      return {
        registrosAnalisados: 0,
        produtosCriados: 0,
        comAtencao: 0,
        comErro: 0,
      };
    }

    const totaisDerivados = (detalhe.itens ?? []).reduce(
      (acumulado, item) => {
        if (item.produtoId) {
          acumulado.produtosCriados += 1;
        }

        if (item.resultado === 'ERRO' || item.possuiErroImpeditivo) {
          acumulado.comErro += 1;
        }

        if (item.resultado === 'ATENCAO' || item.possuiAlerta) {
          acumulado.comAtencao += 1;
        }

        acumulado.registrosAnalisados += 1;
        return acumulado;
      },
      {
        registrosAnalisados: 0,
        produtosCriados: 0,
        comAtencao: 0,
        comErro: 0,
      }
    );

    if (detalhe.situacao !== 'EM_ANDAMENTO') {
      const totaisPersistidosZerados =
        detalhe.totalRegistros === 0 &&
        detalhe.totalCriados === 0 &&
        detalhe.totalComAtencao === 0 &&
        detalhe.totalComErro === 0 &&
        totaisDerivados.registrosAnalisados > 0;

      if (totaisPersistidosZerados) {
        return totaisDerivados;
      }

      return {
        registrosAnalisados: detalhe.totalRegistros,
        produtosCriados: detalhe.totalCriados,
        comAtencao: detalhe.totalComAtencao,
        comErro: detalhe.totalComErro,
      };
    }

    return totaisDerivados;
  }, [detalhe]);

  const confirmarReversao = useCallback(async () => {
    if (!detalhe) return;

    try {
      setRevertendo(true);
      await api.post(`/produtos/importacoes/${detalhe.id}/reverter`);
      addToast('Importacao revertida com sucesso.', 'success');
      await carregarDetalhes();
    } catch (error: any) {
      console.error('Erro ao reverter importacao', error);
      const mensagem =
        error.response?.data?.error || 'Nao foi possivel reverter a importacao.';
      addToast(mensagem, 'error');
    } finally {
      setRevertendo(false);
      setMostrarConfirmacaoReversao(false);
    }
  }, [addToast, carregarDetalhes, detalhe]);

  if (carregando && !detalhe) {
    return (
      <DashboardLayout title="Detalhes da Importacao">
        <PageLoader message="Carregando detalhes da importacao..." />
      </DashboardLayout>
    );
  }

  if (erro) {
    return (
      <DashboardLayout title="Detalhes da Importacao">
        <Breadcrumb
          items={[
            { label: 'Inicio', href: '/' },
            { label: 'Automacao' },
            { label: 'Importar Produto', href: '/automacao/importar-produto' },
            { label: 'Detalhes' },
          ]}
        />
        <Card className="border border-red-500/40 bg-red-500/5 text-red-300">
          <p>{erro}</p>
          <Button className="mt-4" onClick={() => router.push('/automacao/importar-produto')}>
            Voltar para importacoes
          </Button>
        </Card>
      </DashboardLayout>
    );
  }

  if (!detalhe) {
    return null;
  }

  const referenciaLabel =
    detalhe.origemImportacao === 'SISCOMEX_ARQUIVO' ? 'Registro' : 'Linha';
  const modalidadeExibicao =
    detalhe.resumoSiscomex?.modalidadeDetectada || detalhe.modalidade;

  return (
    <DashboardLayout title="Detalhes da Importacao">
      <Breadcrumb
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Automacao' },
          { label: 'Importar Produto', href: '/automacao/importar-produto' },
          { label: `Importacao #${detalhe.id}` },
        ]}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/automacao/importar-produto')}
            className="text-gray-400 transition-colors hover:text-white"
            aria-label="Voltar para a listagem de importacoes"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-semibold text-white">Importacao #{detalhe.id}</h1>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${obterClasseResultado(
            detalhe.resultado
          )}`}
        >
          Resultado: {traduzResultado(detalhe.resultado)}
        </span>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${obterClasseSituacaoBadge(
            detalhe.situacao
          )}`}
        >
          Situacao: {traduzSituacao(detalhe.situacao)}
        </span>
      </div>

      {(detalhe.situacao === 'CONCLUIDA' || detalhe.situacao === 'CONCLUIDA_INCOMPLETA') && (
        <div className="mb-4">
          <Button variant="danger" onClick={() => setMostrarConfirmacaoReversao(true)}>
            Reverter importacao
          </Button>
        </div>
      )}

      {detalhe.situacao === 'CONCLUIDA_INCOMPLETA' && (
        <Card className="mb-4 border border-rose-500/40 bg-rose-500/10 text-rose-100">
          <p className="text-sm">
            Esta importacao foi concluida de forma incompleta apos uma interrupcao. Recomendamos reverter o processo antes de iniciar uma nova importacao para garantir consistencia no catalogo.
          </p>
        </Card>
      )}

      <Card className="mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2 text-sm text-gray-300">
            <p>
              <span className="font-semibold text-gray-200">Arquivo:</span>{' '}
              {detalhe.nomeArquivo || 'Nao informado'}
            </p>
            <p>
              <span className="font-semibold text-gray-200">Catalogo:</span>{' '}
              {detalhe.catalogo.nome} · Nº {detalhe.catalogo.numero} ·{' '}
              {formatCPFOrCNPJ(detalhe.catalogo.cpf_cnpj || '')}
            </p>
            <p>
              <span className="font-semibold text-gray-200">Origem:</span>{' '}
              {traduzOrigem(detalhe.origemImportacao)}
            </p>
            <p>
              <span className="font-semibold text-gray-200">Modalidade:</span>{' '}
              {traduzModalidade(modalidadeExibicao)}
            </p>
            <p>
              <span className="font-semibold text-gray-200">Situacao:</span>{' '}
              {traduzSituacao(detalhe.situacao)}
            </p>
            <div className="flex flex-wrap gap-6 text-sm text-gray-400">
              <p>
                <span className="font-semibold text-gray-300">Iniciado em:</span>{' '}
                {formatarData(detalhe.iniciadoEm)}
              </p>
              <p>
                <span className="font-semibold text-gray-300">Finalizado em:</span>{' '}
                {formatarData(detalhe.finalizadoEm)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="min-w-[150px] rounded-lg border border-slate-700 bg-slate-800/40 p-3 text-gray-300">
              <p className="text-xs uppercase tracking-wide text-gray-400">
                Registros analisados
              </p>
              <p className="mt-1 text-xl font-semibold text-white">
                {totaisResumo.registrosAnalisados}
              </p>
            </div>
            <div className="min-w-[150px] rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3 text-emerald-100">
              <p className="text-xs uppercase tracking-wide text-emerald-200">
                Produtos criados
              </p>
              <p className="mt-1 text-xl font-semibold text-emerald-50">
                {totaisResumo.produtosCriados}
              </p>
            </div>
            <div className="min-w-[150px] rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-100">
              <p className="text-xs uppercase tracking-wide text-amber-200">Com atencao</p>
              <p className="mt-1 text-xl font-semibold text-amber-50">
                {totaisResumo.comAtencao}
              </p>
            </div>
            <div className="min-w-[150px] rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-100">
              <p className="text-xs uppercase tracking-wide text-red-200">Com erro</p>
              <p className="mt-1 text-xl font-semibold text-red-50">
                {totaisResumo.comErro}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {detalhe.resumoSiscomex && <ResumoSiscomexCard resumo={detalhe.resumoSiscomex} />}

      <Card className="mb-6">
        <button
          type="button"
          className="flex w-full items-center justify-between py-3 text-left"
          onClick={() => setErrosAbertos(prev => !prev)}
        >
          <div className="flex items-center gap-2 text-red-200">
            <AlertTriangle size={18} />
            <span className="font-semibold">Itens com erro</span>
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-200">
              {itensErro.length}
            </span>
          </div>
          {errosAbertos ? (
            <ChevronUp size={18} className="text-gray-400" />
          ) : (
            <ChevronDown size={18} className="text-gray-400" />
          )}
        </button>
        {errosAbertos && (
          <div className="mt-4 space-y-4">
            {itensErro.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum registro com erro impeditivo.</p>
            ) : (
              itensErro.map(item => (
                <ItemImportacaoCard
                  key={item.id}
                  item={item}
                  cor="erro"
                  referenciaLabel={referenciaLabel}
                  titulo="Registro nao importado"
                />
              ))
            )}
          </div>
        )}
      </Card>

      <Card className="mb-6">
        <button
          type="button"
          className="flex w-full items-center justify-between py-3 text-left"
          onClick={() => setAtencoesAbertas(prev => !prev)}
        >
          <div className="flex items-center gap-2 text-amber-200">
            <Info size={18} />
            <span className="font-semibold">Itens com atencao</span>
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">
              {itensAtencao.length}
            </span>
          </div>
          {atencoesAbertas ? (
            <ChevronUp size={18} className="text-gray-400" />
          ) : (
            <ChevronDown size={18} className="text-gray-400" />
          )}
        </button>
        {atencoesAbertas && (
          <div className="mt-4 space-y-4">
            {itensAtencao.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum item com atencao.</p>
            ) : (
              itensAtencao.map(item => (
                <ItemImportacaoCard
                  key={item.id}
                  item={item}
                  cor="atencao"
                  referenciaLabel={referenciaLabel}
                  titulo={item.produtoId ? 'Produto processado' : 'Registro nao importado'}
                  chip={item.produtoId ? 'Criado com atencao' : 'Ja existente ou pendente de analise'}
                />
              ))
            )}
          </div>
        )}
      </Card>

      <Card>
        <button
          type="button"
          className="flex w-full items-center justify-between py-3 text-left"
          onClick={() => setSucessosAbertos(prev => !prev)}
        >
          <div className="flex items-center gap-2 text-emerald-200">
            <CheckCircle size={18} />
            <span className="font-semibold">Produtos criados com sucesso</span>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200">
              {itensSucesso.length}
            </span>
          </div>
          {sucessosAbertos ? (
            <ChevronUp size={18} className="text-gray-400" />
          ) : (
            <ChevronDown size={18} className="text-gray-400" />
          )}
        </button>
        {sucessosAbertos && (
          <div className="mt-4 space-y-4">
            {itensSucesso.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum item importado com sucesso.</p>
            ) : (
              itensSucesso.map(item => (
                <ItemImportacaoCard
                  key={item.id}
                  item={item}
                  cor="sucesso"
                  referenciaLabel={referenciaLabel}
                  titulo="Produto criado"
                />
              ))
            )}
          </div>
        )}
      </Card>

      {mostrarConfirmacaoReversao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-gray-700 bg-[#151921] p-6">
            <h3 className="mb-4 text-xl font-semibold text-white">Confirmar reversao</h3>
            <p className="mb-6 text-gray-300">
              Esta acao ira remover todos os produtos criados por esta importacao e, quando aplicavel, os operadores e vinculos criados por ela. Deseja continuar?
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setMostrarConfirmacaoReversao(false)}
                disabled={revertendo}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={confirmarReversao}
                disabled={revertendo}
                className="flex items-center gap-2"
              >
                <RotateCcw size={16} />
                {revertendo ? 'Revertendo...' : 'Reverter'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
