import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CircleDashed, Clock3 } from 'lucide-react';

interface DiferencaAtributo {
  codigo: string;
  tipo: 'ADICIONADO' | 'REMOVIDO' | 'MODIFICADO';
  campo?: string;
  valorAtual?: unknown;
  valorLegado?: unknown;
  caminho?: string[];
}

interface ResultadoVerificacao {
  ncmCodigo: string;
  modalidade: string;
  versaoId: number;
  versaoNumero: number;
  hashAtual: string;
  hashLegado: string;
  divergente: boolean;
  totais: {
    atributos: number;
    dominios: number;
  };
  diferencas?: DiferencaAtributo[];
}

interface LogVerificacao {
  id: number;
  status: 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHO' | 'CANCELADO';
  mensagem: string | null;
  criadoEm: string;
}

interface DetalheVerificacao {
  id: number;
  status: 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHO' | 'CANCELADO';
  criadoEm: string;
  finalizadoEm: string | null;
  arquivoNome: string | null;
  resultados: ResultadoVerificacao[];
  totalVerificados: number;
  divergentes: number;
  logs: LogVerificacao[];
}

function formatarData(data?: string | null) {
  if (!data) return '-';
  const instancia = new Date(data);
  if (Number.isNaN(instancia.getTime())) return '-';
  return `${instancia.toLocaleDateString('pt-BR')} ${instancia.toLocaleTimeString('pt-BR')}`;
}

function obterBadge(status: DetalheVerificacao['status']) {
  switch (status) {
    case 'CONCLUIDO':
      return { cor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40', texto: 'Concluída', icone: <CheckCircle2 className="h-4 w-4" /> };
    case 'FALHO':
    case 'CANCELADO':
      return { cor: 'text-rose-300 bg-rose-500/10 border-rose-500/40', texto: 'Falhou', icone: <AlertTriangle className="h-4 w-4" /> };
    case 'PROCESSANDO':
      return { cor: 'text-sky-300 bg-sky-500/10 border-sky-500/40', texto: 'Em processamento', icone: <Clock3 className="h-4 w-4" /> };
    default:
      return { cor: 'text-slate-300 bg-slate-500/10 border-slate-500/40', texto: 'Pendente', icone: <CircleDashed className="h-4 w-4" /> };
  }
}

export default function DetalheAjusteAtributosPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [dados, setDados] = useState<DetalheVerificacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [marcandoProdutos, setMarcandoProdutos] = useState(false);
  const [divergentesExpandido, setDivergentesExpandido] = useState(true);
  const [alinhadosExpandido, setAlinhadosExpandido] = useState(false);
  const [ncmDetalhesExpandido, setNcmDetalhesExpandido] = useState<string | null>(null);

  // Verificar permissão de acesso - apenas admins
  useEffect(() => {
    if (isAuthLoading) return;

    if (!user?.catprodAdmFull) {
      addToast('Acesso negado. Esta página é restrita a administradores.', 'error');
      router.replace('/');
    }
  }, [user, isAuthLoading, router, addToast]);

  useEffect(() => {
    if (!router.query.id) return;

    const carregar = async () => {
      try {
        const resposta = await api.get<DetalheVerificacao>(
          `/automacao/ajustes-atributos/verificacoes/${router.query.id}`
        );
        setDados(resposta.data);
      } catch (error) {
        console.error('Erro ao buscar detalhes da verificação', error);
        addToast('Não foi possível carregar os detalhes da verificação.', 'error');
      } finally {
        setCarregando(false);
      }
    };

    carregar();
  }, [addToast, router.query.id]);

  const resultadosDivergentes = useMemo(
    () =>
      [...(dados?.resultados ?? [])]
        .filter(r => r.divergente)
        .sort((a, b) => a.ncmCodigo.localeCompare(b.ncmCodigo)),
    [dados?.resultados]
  );

  const resultadosAlinhados = useMemo(
    () =>
      [...(dados?.resultados ?? [])]
        .filter(r => !r.divergente)
        .sort((a, b) => a.ncmCodigo.localeCompare(b.ncmCodigo)),
    [dados?.resultados]
  );

  const formatarValor = (valor: unknown): string => {
    if (valor === null || valor === undefined) return '-';
    if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
    if (typeof valor === 'object') return JSON.stringify(valor, null, 2);
    return String(valor);
  };

  const obterCorTipo = (tipo: DiferencaAtributo['tipo']) => {
    switch (tipo) {
      case 'ADICIONADO': return 'text-emerald-400 bg-emerald-500/10';
      case 'REMOVIDO': return 'text-rose-400 bg-rose-500/10';
      case 'MODIFICADO': return 'text-amber-400 bg-amber-500/10';
    }
  };

  const toggleDetalhes = (key: string) => {
    setNcmDetalhesExpandido(prev => prev === key ? null : key);
  };

  const marcarProdutosParaAjuste = async () => {
    if (!dados || resultadosDivergentes.length === 0) {
      addToast('Não há estruturas divergentes para marcar.', 'warning');
      return;
    }

    const confirmacao = window.confirm(
      `Tem certeza que deseja marcar os produtos das ${resultadosDivergentes.length} estruturas divergentes como "AJUSTAR_ESTRUTURA"?\n\n` +
      'Esta ação irá alterar o status dos produtos afetados.'
    );

    if (!confirmacao) return;

    try {
      setMarcandoProdutos(true);

      const ncms = resultadosDivergentes.map(r => ({
        ncmCodigo: r.ncmCodigo,
        modalidade: r.modalidade,
      }));

      const response = await api.post('/ajuste-estrutura/admin/marcar-multiplas', { ncms });

      const totalMarcados = response.data.resultados.reduce(
        (sum: number, r: any) => sum + r.produtosMarcados,
        0
      );

      addToast(
        `${totalMarcados} produto(s) marcado(s) para ajuste de estrutura com sucesso.`,
        'success'
      );
    } catch (error: any) {
      console.error('Erro ao marcar produtos:', error);
      const mensagem = error?.response?.data?.error || 'Não foi possível marcar os produtos.';
      addToast(mensagem, 'error');
    } finally {
      setMarcandoProdutos(false);
    }
  };

  if (carregando) {
    return (
      <DashboardLayout title="Detalhes da Verificação">
        <PageLoader message="Carregando detalhes" />
      </DashboardLayout>
    );
  }

  if (!dados) {
    return (
      <DashboardLayout title="Detalhes da Verificação">
        <div className="text-center text-slate-300 py-10">
          Não foi possível localizar a verificação solicitada.
        </div>
      </DashboardLayout>
    );
  }

  const badge = obterBadge(dados.status);

  return (
    <DashboardLayout title="Detalhes da Verificação">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao/processos' },
          { label: 'Ajustes de Atributos', href: '/automacao/ajustes-atributos' },
          { label: `Verificação #${dados.id}`, href: `/automacao/ajustes-atributos/${dados.id}` },
        ]}
      />

      <div className="mb-6">
        <p className="text-slate-400 text-sm mb-1">Verificação #{dados.id}</p>
        <h1 className="text-2xl font-semibold text-slate-100">Detalhes da verificação</h1>
        <p className="text-slate-400 text-sm mt-1">
          Resultado do batimento entre estruturas gravadas e estrutura legada do SISCOMEX.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-4 border border-slate-800">
          <p className="text-slate-400 text-sm">Status</p>
          <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm ${badge.cor}`}>
            {badge.icone}
            {badge.texto}
          </div>
        </Card>
        <Card className="p-4 border border-slate-800">
          <p className="text-slate-400 text-sm">Criado em</p>
          <p className="text-slate-100 font-semibold mt-1">{formatarData(dados.criadoEm)}</p>
          <p className="text-slate-400 text-sm">Finalizado em {formatarData(dados.finalizadoEm)}</p>
        </Card>
        <Card className="p-4 border border-slate-800">
          <p className="text-slate-400 text-sm">Resumo</p>
          <p className="text-slate-100 font-semibold mt-1">
            {dados.divergentes} divergência(s) em {dados.totalVerificados} estrutura(s)
          </p>
          <p className="text-slate-400 text-sm">Arquivo: {dados.arquivoNome || 'não gerado'}</p>
        </Card>
      </div>

      <div className="space-y-4 mb-6">
        {/* Painel de Divergentes */}
        <Card>
          <button
            onClick={() => setDivergentesExpandido(!divergentesExpandido)}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-900/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-400" />
              <h2 className="text-lg font-semibold text-slate-100">
                Estruturas Divergentes ({resultadosDivergentes.length})
              </h2>
            </div>
            {divergentesExpandido ? (
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </button>

          {divergentesExpandido && (
            <div className="border-t border-slate-800">
              {resultadosDivergentes.length === 0 ? (
                <div className="text-slate-400 text-sm py-6 px-4">Nenhuma divergência encontrada.</div>
              ) : (
                <>
                  {/* Botão de ação para marcar produtos */}
                  <div className="p-4 border-b border-slate-800 bg-slate-900/30">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-slate-200 text-sm font-medium">
                          Ação Administrativa
                        </p>
                        <p className="text-slate-400 text-xs mt-1">
                          Marcar produtos das estruturas divergentes para ajuste manual
                        </p>
                      </div>
                      <Button
                        onClick={marcarProdutosParaAjuste}
                        disabled={marcandoProdutos}
                        variant="primary"
                        className="ml-4"
                      >
                        {marcandoProdutos ? 'Marcando...' : 'Marcar Produtos para Ajuste'}
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-800">
                    <thead className="bg-slate-900/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">NCM</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Modalidade</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Versão</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Hash atual</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Hash legado</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Totais</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Diferenças</th>
                        <th className="px-4 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {resultadosDivergentes.map(item => {
                        const key = `${item.ncmCodigo}-${item.modalidade}`;
                        const expandido = ncmDetalhesExpandido === key;
                        return (
                          <React.Fragment key={key}>
                            <tr className="hover:bg-slate-900/40">
                              <td className="px-4 py-3 text-sm text-slate-200">{item.ncmCodigo}</td>
                              <td className="px-4 py-3 text-sm text-slate-200">{item.modalidade}</td>
                              <td className="px-4 py-3 text-sm text-slate-200">{item.versaoNumero}</td>
                              <td className="px-4 py-3 text-sm text-slate-300 font-mono truncate max-w-xs">{item.hashAtual}</td>
                              <td className="px-4 py-3 text-sm text-slate-300 font-mono truncate max-w-xs">{item.hashLegado}</td>
                              <td className="px-4 py-3 text-sm text-slate-300">
                                {item.totais.atributos} atributos · {item.totais.dominios} domínios
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-300">
                                {item.diferencas?.length ?? 0} diferença(s)
                              </td>
                              <td className="px-4 py-3">
                                {item.diferencas && item.diferencas.length > 0 && (
                                  <button
                                    onClick={() => toggleDetalhes(key)}
                                    className="text-slate-400 hover:text-slate-200 transition-colors"
                                    title={expandido ? 'Ocultar detalhes' : 'Ver detalhes'}
                                  >
                                    {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                  </button>
                                )}
                              </td>
                            </tr>
                            {expandido && item.diferencas && (
                              <tr>
                                <td colSpan={8} className="px-4 py-4 bg-slate-900/30">
                                  <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-slate-200 mb-3">Detalhes das Diferenças:</h3>
                                    <div className="space-y-2">
                                      {item.diferencas.map((dif, idx) => (
                                        <div key={idx} className="border border-slate-700 rounded-lg p-3 bg-slate-800/50">
                                          <div className="flex items-start gap-3">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${obterCorTipo(dif.tipo)}`}>
                                              {dif.tipo}
                                            </span>
                                            <div className="flex-1">
                                              <div className="text-sm text-slate-200 font-medium">
                                                Atributo: <span className="font-mono">{dif.codigo}</span>
                                                {dif.campo && <span className="text-slate-400"> · Campo: {dif.campo}</span>}
                                              </div>
                                              {dif.caminho && dif.caminho.length > 1 && (
                                                <div className="text-xs text-slate-400 mt-1">
                                                  Caminho: {dif.caminho.join(' > ')}
                                                </div>
                                              )}
                                              {dif.tipo === 'MODIFICADO' && (
                                                <div className="mt-2 grid grid-cols-2 gap-4 text-xs">
                                                  <div>
                                                    <span className="text-slate-400">Valor Atual (Cache):</span>
                                                    <pre className="mt-1 p-2 bg-slate-900 rounded text-slate-300 overflow-x-auto">
                                                      {formatarValor(dif.valorAtual)}
                                                    </pre>
                                                  </div>
                                                  <div>
                                                    <span className="text-slate-400">Valor Legado (SISCOMEX):</span>
                                                    <pre className="mt-1 p-2 bg-slate-900 rounded text-slate-300 overflow-x-auto">
                                                      {formatarValor(dif.valorLegado)}
                                                    </pre>
                                                  </div>
                                                </div>
                                              )}
                                              {dif.tipo === 'ADICIONADO' && !!dif.valorLegado && (
                                                <div className="mt-2 text-xs">
                                                  <span className="text-slate-400">Nome no SISCOMEX:</span>
                                                  <span className="ml-2 text-emerald-400">{formatarValor(dif.valorLegado)}</span>
                                                </div>
                                              )}
                                              {dif.tipo === 'REMOVIDO' && !!dif.valorAtual && (
                                                <div className="mt-2 text-xs">
                                                  <span className="text-slate-400">Nome no Cache:</span>
                                                  <span className="ml-2 text-rose-400">{formatarValor(dif.valorAtual)}</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          )}
        </Card>

        {/* Painel de Alinhados */}
        <Card>
          <button
            onClick={() => setAlinhadosExpandido(!alinhadosExpandido)}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-900/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-slate-100">
                Estruturas Alinhadas ({resultadosAlinhados.length})
              </h2>
            </div>
            {alinhadosExpandido ? (
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </button>

          {alinhadosExpandido && (
            <div className="border-t border-slate-800">
              {resultadosAlinhados.length === 0 ? (
                <div className="text-slate-400 text-sm py-6 px-4">Nenhuma estrutura alinhada.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-800">
                    <thead className="bg-slate-900/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">NCM</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Modalidade</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Versão</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Hash</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Totais</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {resultadosAlinhados.map(item => (
                        <tr key={`${item.ncmCodigo}-${item.modalidade}`} className="hover:bg-slate-900/40">
                          <td className="px-4 py-3 text-sm text-slate-200">{item.ncmCodigo}</td>
                          <td className="px-4 py-3 text-sm text-slate-200">{item.modalidade}</td>
                          <td className="px-4 py-3 text-sm text-slate-200">{item.versaoNumero}</td>
                          <td className="px-4 py-3 text-sm text-slate-300 font-mono truncate max-w-xs">{item.hashAtual}</td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {item.totais.atributos} atributos · {item.totais.dominios} domínios
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-slate-100 mb-3">Histórico de logs</h2>
        {dados.logs.length === 0 ? (
          <div className="text-slate-400 text-sm py-6">Nenhum log registrado.</div>
        ) : (
          <ul className="space-y-2">
            {dados.logs.map(log => (
              <li key={log.id} className="flex items-start gap-3 bg-slate-900/50 rounded-lg p-3">
                <span className="text-xs text-slate-400 min-w-[150px]">{formatarData(log.criadoEm)}</span>
                <span className="text-slate-200 text-sm">{log.mensagem || log.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </DashboardLayout>
  );
}
