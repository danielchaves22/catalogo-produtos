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
import { AlertTriangle, ArrowLeft, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

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

interface MensagensItem {
  impeditivos?: string[];
  atencao?: string[];
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
      return 'Atenção';
    case 'PENDENTE':
      return 'Pendente';
  }
}

function obterClasseResultado(resultado: ImportacaoDetalhe['resultado']) {
  switch (resultado) {
    case 'SUCESSO':
      return 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40';
    case 'ATENCAO':
      return 'bg-amber-500/10 text-amber-300 border border-amber-500/40';
    case 'PENDENTE':
      return 'bg-slate-500/10 text-slate-300 border border-slate-500/40';
    default:
      return 'bg-slate-700/40 text-slate-200 border border-slate-600/40';
  }
}

function traduzModalidade(modalidade: string) {
  return modalidade === 'EXPORTACAO' ? 'Exportação' : 'Importação';
}

function traduzSituacao(situacao: ImportacaoDetalhe['situacao']) {
  switch (situacao) {
    case 'CONCLUIDA':
      return 'Concluída';
    case 'CONCLUIDA_INCOMPLETA':
      return 'Concluída - Incompleta';
    case 'REVERTIDA':
      return 'Revertida';
    default:
      return 'Em andamento';
  }
}

function obterMensagem(lista?: string[]) {
  if (!lista || lista.length === 0) return null;
  return (
    <ul className="mt-2 list-disc pl-5 text-sm text-gray-200">
      {lista.map((mensagem, indice) => (
        <li key={indice}>{mensagem}</li>
      ))}
    </ul>
  );
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
    } catch (error) {
      console.warn('Falha ao interpretar mensagens de importação como JSON', error);
      return {};
    }
  }

  if (Array.isArray(mensagens)) {
    const itens = mensagens.filter(
      (valor): valor is string => typeof valor === 'string'
    );
    return itens.length ? { impeditivos: itens } : {};
  }

  if (typeof mensagens === 'object') {
    const objeto = mensagens as Record<string, unknown>;
    const impeditivos = Array.isArray(objeto.impeditivos)
      ? objeto.impeditivos.filter(
          (valor): valor is string => typeof valor === 'string'
        )
      : [];
    const atencao = Array.isArray(objeto.atencao)
      ? objeto.atencao.filter(
          (valor): valor is string => typeof valor === 'string'
        )
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
  const itensNormalizados = (dados.itens ?? []).map(item => ({
    ...item,
    mensagens: normalizarMensagens(item.mensagens)
  }));

  return {
    ...dados,
    itens: itensNormalizados
  };
}

export default function ImportacaoDetalhePage() {
  const router = useRouter();
  const { id } = router.query;
  const { addToast } = useToast();
  const [detalhe, setDetalhe] = useState<ImportacaoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [errosAbertos, setErrosAbertos] = useState(true);
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
        console.error('Erro ao carregar importação', error);
        const mensagem = error.response?.data?.error || 'Não foi possível carregar os detalhes.';
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
    [importacaoId, addToast]
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
  }, [detalhe?.situacao, carregarDetalhes]);

  const itensErro = useMemo(
    () => detalhe?.itens.filter(item => item.resultado === 'ERRO') ?? [],
    [detalhe]
  );
  const itensSucesso = useMemo(
    () => detalhe?.itens.filter(item => item.resultado !== 'ERRO') ?? [],
    [detalhe]
  );

  const abrirConfirmacaoReversao = useCallback(() => {
    setMostrarConfirmacaoReversao(true);
  }, []);

  const cancelarConfirmacaoReversao = useCallback(() => {
    if (revertendo) return;
    setMostrarConfirmacaoReversao(false);
  }, [revertendo]);

  const confirmarReversao = useCallback(async () => {
    if (!detalhe) return;
    try {
      setRevertendo(true);
      await api.post(`/produtos/importacoes/${detalhe.id}/reverter`);
      addToast('Importação revertida com sucesso.', 'success');
      await carregarDetalhes();
    } catch (error: any) {
      console.error('Erro ao reverter importação', error);
      const mensagem =
        error.response?.data?.error || 'Não foi possível reverter a importação.';
      addToast(mensagem, 'error');
    } finally {
      setRevertendo(false);
      setMostrarConfirmacaoReversao(false);
    }
  }, [detalhe, addToast, carregarDetalhes]);

  if (carregando && !detalhe) {
    return (
      <DashboardLayout title="Detalhes da Importação">
        <PageLoader message="Carregando detalhes da importação..." />
      </DashboardLayout>
    );
  }

  if (erro) {
    return (
      <DashboardLayout title="Detalhes da Importação">
        <Breadcrumb
          items={[
            { label: 'Início', href: '/' },
            { label: 'Automação' },
            { label: 'Importar Produto', href: '/automacao/importar-produto' },
            { label: 'Detalhes' }
          ]}
        />
        <Card className="border border-red-500/40 bg-red-500/5 text-red-300">
          <p>{erro}</p>
          <Button className="mt-4" onClick={() => router.push('/automacao/importar-produto')}>
            Voltar para importações
          </Button>
        </Card>
      </DashboardLayout>
    );
  }

  if (!detalhe) return null;

  return (
    <DashboardLayout title="Detalhes da Importação">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação' },
          { label: 'Importar Produto', href: '/automacao/importar-produto' },
          { label: `Importação #${detalhe.id}` }
        ]}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/automacao/importar-produto')}
            className="text-gray-400 transition-colors hover:text-white"
            aria-label="Voltar para a listagem de importações"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-semibold text-white">Importação #{detalhe.id}</h1>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${obterClasseResultado(detalhe.resultado)}`}>
          Resultado: {traduzResultado(detalhe.resultado)}
        </span>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${obterClasseSituacaoBadge(detalhe.situacao)}`}>
          Situação: {traduzSituacao(detalhe.situacao)}
        </span>
      </div>

      {(detalhe.situacao === 'CONCLUIDA' || detalhe.situacao === 'CONCLUIDA_INCOMPLETA') && (
        <div className="mb-4">
          <Button variant="danger" onClick={abrirConfirmacaoReversao}>
            Reverter importação
          </Button>
        </div>
      )}

      {detalhe.situacao === 'CONCLUIDA_INCOMPLETA' && (
        <Card className="mb-4 border border-rose-500/40 bg-rose-500/10 text-rose-100">
          <p className="text-sm">
            Esta importação foi concluída de forma incompleta após uma interrupção. Recomendamos
            reverter o processo antes de iniciar uma nova importação para garantir consistência nos
            dados do catálogo.
          </p>
        </Card>
      )}

      <Card className="mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2 text-sm text-gray-300">
            <p className="text-gray-300">
              <span className="font-semibold text-gray-200">Arquivo:</span>{' '}
              {detalhe.nomeArquivo ? detalhe.nomeArquivo : 'Não informado'}
            </p>
            <p className="text-gray-300">
              <span className="font-semibold text-gray-200">Catálogo:</span>{' '}
              {detalhe.catalogo.nome} · Nº {detalhe.catalogo.numero} ·{' '}
              {formatCPFOrCNPJ(detalhe.catalogo.cpf_cnpj || '')}
            </p>
            <p className="text-gray-300">
              <span className="font-semibold text-gray-200">Modalidade:</span> {traduzModalidade(detalhe.modalidade)}
            </p>
            <p className="text-gray-300">
              <span className="font-semibold text-gray-200">Situação:</span> {traduzSituacao(detalhe.situacao)}
            </p>
            <div className="flex flex-wrap gap-6 text-sm text-gray-400">
              <p>
                <span className="font-semibold text-gray-300">Iniciado em:</span> {formatarData(detalhe.iniciadoEm)}
              </p>
              <p>
                <span className="font-semibold text-gray-300">Finalizado em:</span> {formatarData(detalhe.finalizadoEm)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="min-w-[150px] rounded-lg border border-slate-700 bg-slate-800/40 p-3 text-gray-300">
              <p className="text-xs uppercase tracking-wide text-gray-400">Registros analisados</p>
              <p className="mt-1 text-xl font-semibold text-white">{detalhe.totalRegistros}</p>
            </div>
            <div className="min-w-[150px] rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3 text-emerald-100">
              <p className="text-xs uppercase tracking-wide text-emerald-200">Produtos criados</p>
              <p className="mt-1 text-xl font-semibold text-emerald-50">{detalhe.totalCriados}</p>
            </div>
            <div className="min-w-[150px] rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-100">
              <p className="text-xs uppercase tracking-wide text-amber-200">Com atenção</p>
              <p className="mt-1 text-xl font-semibold text-amber-50">{detalhe.totalComAtencao}</p>
            </div>
            <div className="min-w-[150px] rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-100">
              <p className="text-xs uppercase tracking-wide text-red-200">Com erro</p>
              <p className="mt-1 text-xl font-semibold text-red-50">{detalhe.totalComErro}</p>
            </div>
          </div>
        </div>
      </Card>

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
          {errosAbertos ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>
        {errosAbertos && (
          <div className="mt-4 space-y-4">
            {itensErro.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum registro com erro impeditivo.</p>
            ) : (
              itensErro.map(item => {
                const mensagens = item.mensagens ?? {};
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm text-gray-200"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-white">Linha {item.linhaPlanilha}</p>
                        <p className="text-xs text-gray-300">NCM {item.ncm || 'Não informada'}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-gray-200">
                      Produto: <span className="font-medium text-white">{item.denominacao || 'Sem nome informado'}</span>
                    </p>
                    {item.codigosInternos && (
                      <p className="mt-1 text-xs text-gray-300">SKUs informados: {item.codigosInternos}</p>
                    )}
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-300">Problemas encontrados</p>
                      {obterMensagem(mensagens.impeditivos) || (
                        <p className="mt-2 text-sm text-gray-200">Erro não especificado.</p>
                      )}
                    </div>
                  </div>
                );
              })
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
            <span className="font-semibold">Itens importados com sucesso</span>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200">
              {itensSucesso.length}
            </span>
          </div>
          {sucessosAbertos ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>
        {sucessosAbertos && (
          <div className="mt-4 space-y-4">
            {itensSucesso.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum item importado.</p>
            ) : (
              itensSucesso.map(item => {
                const mensagens = item.mensagens ?? {};
                const possuiAtencao = item.resultado === 'ATENCAO' || item.possuiAlerta;
                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-4 text-sm ${
                      possuiAtencao
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-white">Linha {item.linhaPlanilha}</p>
                        <p className="text-xs text-white/80">NCM {item.ncm || 'Não informada'}</p>
                      </div>
                      {possuiAtencao && (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-100">
                          Importado com atenção
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-white">
                      Produto criado: <span className="font-semibold">{item.denominacao || 'Sem nome informado'}</span>
                    </p>
                    {item.codigosInternos && (
                      <p className="mt-1 text-xs text-white/80">SKUs cadastrados: {item.codigosInternos}</p>
                    )}
                    {obterMensagem(mensagens.atencao)}
                  </div>
                );
              })
            )}
          </div>
        )}
      </Card>

      {mostrarConfirmacaoReversao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-gray-700 bg-[#151921] p-6">
            <h3 className="mb-4 text-xl font-semibold text-white">Confirmar reversão</h3>
            <p className="mb-6 text-gray-300">
              Esta ação irá remover todos os produtos criados por esta importação. Deseja
              continuar?
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={cancelarConfirmacaoReversao} disabled={revertendo}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={confirmarReversao} disabled={revertendo}>
                {revertendo ? 'Revertendo...' : 'Reverter' }
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
