import React, { useEffect, useMemo, useState } from 'react';
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
  mensagens?: MensagensItem | null;
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
  situacao: 'EM_ANDAMENTO' | 'CONCLUIDA';
  resultado: 'PENDENTE' | 'SUCESSO' | 'ATENCAO';
  totalRegistros: number;
  totalCriados: number;
  totalComAtencao: number;
  totalComErro: number;
  iniciadoEm: string;
  finalizadoEm?: string | null;
  itens: ImportacaoItem[];
}

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
  return situacao === 'CONCLUIDA' ? 'Concluída' : 'Em andamento';
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

export default function ImportacaoDetalhePage() {
  const router = useRouter();
  const { id } = router.query;
  const { addToast } = useToast();
  const [detalhe, setDetalhe] = useState<ImportacaoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [errosAbertos, setErrosAbertos] = useState(true);
  const [sucessosAbertos, setSucessosAbertos] = useState(false);

  useEffect(() => {
    if (!id) return;
    const carregar = async () => {
      try {
        setCarregando(true);
        const resposta = await api.get<ImportacaoDetalhe>(`/produtos/importacoes/${id}`);
        setDetalhe(resposta.data);
        setErro(null);
      } catch (error: any) {
        console.error('Erro ao carregar importação', error);
        const mensagem = error.response?.data?.error || 'Não foi possível carregar os detalhes.';
        setErro(mensagem);
        addToast(mensagem, 'error');
      } finally {
        setCarregando(false);
      }
    };
    carregar();
  }, [id, addToast]);

  const itensErro = useMemo(
    () => detalhe?.itens.filter(item => item.resultado === 'ERRO') ?? [],
    [detalhe]
  );
  const itensSucesso = useMemo(
    () => detalhe?.itens.filter(item => item.resultado !== 'ERRO') ?? [],
    [detalhe]
  );

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
            { label: 'Automação', href: '/automacao/importar-produto' },
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
          { label: 'Automação', href: '/automacao/importar-produto' },
          { label: 'Importar Produto', href: '/automacao/importar-produto' },
          { label: `Importação #${detalhe.id}` }
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="flex items-center gap-2 text-gray-300 hover:text-white"
          onClick={() => router.push('/automacao/importar-produto')}
        >
          <ArrowLeft size={16} />
          Voltar para importações
        </Button>
      </div>

      <Card className="mb-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h1 className="text-2xl font-semibold text-white">Importação #{detalhe.id}</h1>
            <p className="mt-1 text-sm text-gray-400">
              {detalhe.nomeArquivo ? `Arquivo ${detalhe.nomeArquivo}` : 'Arquivo não informado'}
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Catálogo {detalhe.catalogo.nome} · Nº {detalhe.catalogo.numero} ·{' '}
              {formatCPFOrCNPJ(detalhe.catalogo.cpf_cnpj || '')}
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Modalidade {traduzModalidade(detalhe.modalidade)} · Situação {traduzSituacao(detalhe.situacao)}
            </p>
            <div className="mt-3">
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${obterClasseResultado(detalhe.resultado)}`}>
                Resultado: {traduzResultado(detalhe.resultado)}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center text-sm text-gray-300">
            <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Registros analisados</p>
              <p className="mt-1 text-2xl font-semibold text-white">{detalhe.totalRegistros}</p>
            </div>
            <div className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-300">Produtos criados</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-200">{detalhe.totalCriados}</p>
            </div>
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="text-xs uppercase tracking-wide text-amber-300">Com atenção</p>
              <p className="mt-1 text-2xl font-semibold text-amber-200">{detalhe.totalComAtencao}</p>
            </div>
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
              <p className="text-xs uppercase tracking-wide text-red-300">Com erro</p>
              <p className="mt-1 text-2xl font-semibold text-red-200">{detalhe.totalComErro}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-sm text-gray-400 md:grid-cols-2">
          <p>
            <span className="font-semibold text-gray-300">Iniciado em:</span> {formatarData(detalhe.iniciadoEm)}
          </p>
          <p>
            <span className="font-semibold text-gray-300">Finalizado em:</span> {formatarData(detalhe.finalizadoEm)}
          </p>
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
    </DashboardLayout>
  );
}
