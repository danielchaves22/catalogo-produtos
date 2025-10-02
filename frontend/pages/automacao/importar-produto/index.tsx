import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/PageLoader';
import api from '@/lib/api';
import { formatCPFOrCNPJ } from '@/lib/validation';
import { useToast } from '@/components/ui/ToastContext';
import { Eye, PlusCircle, RefreshCcw, Trash, Trash2 } from 'lucide-react';

interface ImportacaoResumo {
  id: number;
  catalogoId: number;
  modalidade: string;
  situacao: 'EM_ANDAMENTO' | 'CONCLUIDA';
  resultado: 'PENDENTE' | 'SUCESSO' | 'ATENCAO';
  totalRegistros: number;
  totalCriados: number;
  totalComAtencao: number;
  totalComErro: number;
  iniciadoEm: string;
  finalizadoEm?: string | null;
  nomeArquivo?: string | null;
  catalogo: {
    id: number;
    nome: string;
    numero: number;
    cpf_cnpj?: string | null;
  };
}

function useImportacoes() {
  const [dados, setDados] = useState<ImportacaoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const { addToast } = useToast();

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      const resposta = await api.get<ImportacaoResumo[]>('/produtos/importacoes');
      setDados(resposta.data);
      setErro(null);
    } catch (error) {
      console.error('Erro ao carregar importações', error);
      setErro('Não foi possível carregar as importações.');
      addToast('Não foi possível carregar as importações.', 'error');
    } finally {
      setCarregando(false);
    }
  }, [addToast]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { dados, carregando, erro, recarregar: carregar };
}

function obterClasseResultado(resultado: ImportacaoResumo['resultado']) {
  switch (resultado) {
    case 'SUCESSO':
      return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40';
    case 'ATENCAO':
      return 'bg-amber-500/10 text-amber-400 border border-amber-500/40';
    case 'PENDENTE':
      return 'bg-slate-500/10 text-slate-300 border border-slate-500/40';
    default:
      return 'bg-slate-700/40 text-slate-200 border border-slate-600/40';
  }
}

function obterClasseSituacao(situacao: ImportacaoResumo['situacao']) {
  switch (situacao) {
    case 'EM_ANDAMENTO':
      return 'text-sky-400';
    case 'CONCLUIDA':
      return 'text-emerald-400';
    default:
      return 'text-slate-300';
  }
}

function formatarData(data?: string | null) {
  if (!data) return '-';
  const objeto = new Date(data);
  if (Number.isNaN(objeto.getTime())) return '-';
  return `${objeto.toLocaleDateString('pt-BR')} ${objeto.toLocaleTimeString('pt-BR')}`;
}

function traduzResultado(resultado: ImportacaoResumo['resultado']) {
  switch (resultado) {
    case 'SUCESSO':
      return 'Sucesso';
    case 'ATENCAO':
      return 'Atenção';
    case 'PENDENTE':
      return 'Pendente';
  }
}

function traduzSituacao(situacao: ImportacaoResumo['situacao']) {
  return situacao === 'CONCLUIDA' ? 'Concluída' : 'Em andamento';
}

function traduzModalidade(modalidade: string) {
  if (modalidade === 'EXPORTACAO') return 'Exportação';
  return 'Importação';
}

export default function ImportacoesPage() {
  const router = useRouter();
  const { dados, carregando, erro, recarregar } = useImportacoes();
  const [excluindoId, setExcluindoId] = useState<number | null>(null);
  const [limpandoHistorico, setLimpandoHistorico] = useState(false);

  const { addToast } = useToast();
  const possuiProcessando = dados.some(importacao => importacao.situacao === 'EM_ANDAMENTO');

  useEffect(() => {
    if (!possuiProcessando) {
      return;
    }

    const interval = setInterval(() => {
      recarregar();
    }, 5000);

    return () => clearInterval(interval);
  }, [possuiProcessando, recarregar]);

  const removerImportacao = useCallback(
    async (id: number) => {
      const confirmado = window.confirm('Deseja realmente excluir esta importação?');
      if (!confirmado) return;

      try {
        setExcluindoId(id);
        await api.delete(`/produtos/importacoes/${id}`);
        addToast('Importação removida com sucesso.', 'success');
        await recarregar();
      } catch (error) {
        console.error('Erro ao remover importação', error);
        addToast('Não foi possível remover a importação.', 'error');
      } finally {
        setExcluindoId(null);
      }
    },
    [addToast, recarregar]
  );

  const limparHistorico = useCallback(async () => {
    const confirmado = window.confirm('Tem certeza que deseja remover todo o histórico de importações?');
    if (!confirmado) return;

    try {
      setLimpandoHistorico(true);
      await api.delete('/produtos/importacoes');
      addToast('Histórico de importações limpo.', 'success');
      await recarregar();
    } catch (error) {
      console.error('Erro ao limpar histórico de importações', error);
      addToast('Não foi possível limpar o histórico de importações.', 'error');
    } finally {
      setLimpandoHistorico(false);
    }
  }, [addToast, recarregar]);

  if (carregando && dados.length === 0) {
    return (
      <DashboardLayout title="Importar Produto">
        <PageLoader message="Carregando importações..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Importar Produto">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação' },
          { label: 'Importar Produto' }
        ]}
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-white">Importações de Produto</h1>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            variant="outline"
            onClick={() => recarregar()}
            title="Recarregar lista"
            className="flex items-center gap-2"
            disabled={carregando}
          >
            <RefreshCcw size={16} />
            Atualizar
          </Button>
          {dados.length > 0 && (
            <Button
              variant="outline"
              onClick={limparHistorico}
              className="flex items-center gap-2 border-red-500/60 text-red-300 hover:bg-red-500/10"
              disabled={limpandoHistorico}
            >
              <Trash size={16} />
              Limpar histórico
            </Button>
          )}
          <Button
            onClick={() => router.push('/automacao/importar-produto/nova')}
            className="flex items-center gap-2"
            variant="accent"
          >
            <PlusCircle size={18} />
            Nova Importação
          </Button>
        </div>
      </div>
      {possuiProcessando && (
        <p className="mb-4 text-sm text-sky-300">
          Há importações em andamento. A lista é atualizada automaticamente a cada 5 segundos.
        </p>
      )}

      {erro && (
        <Card className="mb-4 border border-red-500/40 bg-red-500/5 text-red-300">
          <p>{erro}</p>
        </Card>
      )}

      <Card>
        {dados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
            <p className="text-lg font-medium">Nenhuma importação realizada até o momento.</p>
            <p className="mt-2 text-sm">
              Utilize o botão <strong>Nova Importação</strong> para iniciar o processo por planilha Excel.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[#1f2430] text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">Ações</th>
                  <th className="px-4 py-3 text-left">Arquivo</th>
                  <th className="px-4 py-3 text-left">Catálogo</th>
                  <th className="px-4 py-3 text-left">Modalidade</th>
                  <th className="px-4 py-3 text-left">Situação</th>
                  <th className="px-4 py-3 text-left">Resultado</th>
                  <th className="px-4 py-3 text-left">Registros</th>
                  <th className="px-4 py-3 text-left">Iniciado em</th>
                  <th className="px-4 py-3 text-left">Concluído em</th>
                </tr>
              </thead>
              <tbody>
                {dados.map(importacao => (
                  <tr key={importacao.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/automacao/importar-produto/${importacao.id}`)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-800/60 text-gray-200 transition hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          title="Ver detalhes"
                          aria-label="Ver detalhes da importação"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removerImportacao(importacao.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-500/40 bg-red-500/10 text-red-200 transition hover:bg-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                          title="Excluir importação"
                          aria-label="Excluir importação"
                          disabled={excluindoId === importacao.id || limpandoHistorico}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-200">
                      {importacao.nomeArquivo || `Importação #${importacao.id}`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col text-gray-200">
                        <span className="font-medium">{importacao.catalogo.nome}</span>
                        <span className="text-xs text-gray-400">
                          Nº {importacao.catalogo.numero} · {formatCPFOrCNPJ(importacao.catalogo.cpf_cnpj || '')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-200">{traduzModalidade(importacao.modalidade)}</td>
                    <td className={`px-4 py-3 font-medium ${obterClasseSituacao(importacao.situacao)}`}>
                      {traduzSituacao(importacao.situacao)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${obterClasseResultado(importacao.resultado)}`}>
                        {traduzResultado(importacao.resultado)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-200">{importacao.totalRegistros}</td>
                    <td className="px-4 py-3 text-gray-200">{formatarData(importacao.iniciadoEm)}</td>
                    <td className="px-4 py-3 text-gray-200">{formatarData(importacao.finalizadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </DashboardLayout>
  );
}
