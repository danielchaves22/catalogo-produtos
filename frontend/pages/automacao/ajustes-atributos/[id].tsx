import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock3 } from 'lucide-react';

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
  const [dados, setDados] = useState<DetalheVerificacao | null>(null);
  const [carregando, setCarregando] = useState(true);

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

  const resultadosOrdenados = useMemo(
    () =>
      [...(dados?.resultados ?? [])].sort((a, b) => a.ncmCodigo.localeCompare(b.ncmCodigo)),
    [dados?.resultados]
  );

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

      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-3">Resultados por NCM</h2>
        {resultadosOrdenados.length === 0 ? (
          <div className="text-slate-400 text-sm py-6">Nenhum resultado disponível.</div>
        ) : (
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
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {resultadosOrdenados.map(item => (
                  <tr key={`${item.ncmCodigo}-${item.modalidade}`} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3 text-sm text-slate-200">{item.ncmCodigo}</td>
                    <td className="px-4 py-3 text-sm text-slate-200">{item.modalidade}</td>
                    <td className="px-4 py-3 text-sm text-slate-200">{item.versaoNumero}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 font-mono truncate max-w-xs">{item.hashAtual}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 font-mono truncate max-w-xs">{item.hashLegado}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {item.totais.atributos} atributos · {item.totais.dominios} domínios
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold">
                      {item.divergente ? (
                        <span className="text-rose-300">Divergente</span>
                      ) : (
                        <span className="text-emerald-400">Alinhado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
