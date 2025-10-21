import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { ArrowLeft, Calendar, CheckCircle2, User } from 'lucide-react';
import { formatCPFOrCNPJ } from '@/lib/validation';

interface AtributoEstrutura {
  codigo: string;
  nome: string;
  tipo: string;
  obrigatorio: boolean;
  multivalorado?: boolean;
  dominio?: { codigo: string; descricao: string }[];
  subAtributos?: AtributoEstrutura[];
}

interface CatalogoResumo {
  id: number;
  nome: string | null;
  numero: number | null;
  cpf_cnpj: string | null;
}

interface ProdutoResumo {
  id: number;
  codigo: string | null;
  denominacao: string;
  catalogo?: CatalogoResumo | null;
}

interface RegistroDetalhe {
  id: number;
  ncmCodigo: string;
  modalidade: string | null;
  catalogos: CatalogoResumo[];
  valoresAtributos: Record<string, unknown>;
  estruturaSnapshot: AtributoEstrutura[] | null;
  produtosExcecao: ProdutoResumo[];
  produtosImpactados: number;
  criadoEm: string;
  criadoPor: string | null;
}

function formatarNCM(ncm: string) {
  const digits = ncm.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return digits.replace(/(\d{4})(\d{1,2})/, '$1.$2');
  return digits.replace(/(\d{4})(\d{2})(\d{1,2})/, '$1.$2.$3');
}

function formatarModalidade(modalidade?: string | null) {
  if (!modalidade) return '-';
  const valor = modalidade.toUpperCase();
  if (valor === 'IMPORTACAO') return 'Importação';
  if (valor === 'EXPORTACAO') return 'Exportação';
  return modalidade;
}

function formatarData(dataIso: string) {
  if (!dataIso) return '-';
  const data = new Date(dataIso);
  if (Number.isNaN(data.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(data);
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

export default function PreenchimentoMassaDetalhePage() {
  const router = useRouter();
  const { addToast } = useToast();
  const { id } = router.query;

  const [registro, setRegistro] = useState<RegistroDetalhe | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || typeof id !== 'string') return;
    carregar(id);
  }, [router.isReady, id]);

  async function carregar(registroId: string) {
    try {
      setLoading(true);
      const resposta = await api.get<RegistroDetalhe>(`/automacao/atributos-massa/${registroId}`);
      setRegistro(resposta.data);
      setErro(null);
    } catch (error) {
      console.error('Erro ao carregar detalhe do preenchimento em massa:', error);
      setErro('Registro não encontrado ou inacessível.');
      addToast('Não foi possível carregar o registro solicitado.', 'error');
      setTimeout(() => router.push('/automacao/atributos-massa'), 2000);
    } finally {
      setLoading(false);
    }
  }

  const mapaEstrutura = useMemo(() => {
    const map = new Map<string, AtributoEstrutura>();
    if (!registro?.estruturaSnapshot) return map;
    function coletar(lista: AtributoEstrutura[]) {
      for (const attr of lista) {
        map.set(attr.codigo, attr);
        if (attr.subAtributos) coletar(attr.subAtributos);
      }
    }
    coletar(registro.estruturaSnapshot);
    return map;
  }, [registro]);

  const atributosComValores = useMemo(() => {
    if (!registro) return [] as Array<{ atributo: AtributoEstrutura | undefined; valor: unknown }>;
    return Object.entries(registro.valoresAtributos).map(([codigo, valor]) => ({
      atributo: mapaEstrutura.get(codigo),
      valor
    }));
  }, [registro, mapaEstrutura]);

  function voltar() {
    router.push('/automacao/atributos-massa');
  }

  return (
    <DashboardLayout title="Detalhes da atribuição em massa">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao/importar-produto' },
          { label: 'Preencher Atributos em Massa', href: '/automacao/atributos-massa' },
          { label: 'Detalhes' }
        ]}
      />

      <div className="mb-6 flex items-center gap-2">
        <button onClick={voltar} className="text-gray-400 transition-colors hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-semibold text-white">Resumo da atribuição</h1>
      </div>

      {loading && <p className="text-gray-300">Carregando informações...</p>}
      {erro && <p className="text-red-400">{erro}</p>}

      {registro && !loading && !erro && (
        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <div className="space-y-6">
            <Card>
              <h2 className="mb-4 text-lg font-semibold text-white">Informações principais</h2>
              <div className="space-y-2 text-sm text-gray-200">
                <p>
                  <span className="text-gray-400">NCM:</span> {formatarNCM(registro.ncmCodigo)}
                </p>
                <p>
                  <span className="text-gray-400">Modalidade:</span> {formatarModalidade(registro.modalidade)}
                </p>
                <p>
                  <span className="text-gray-400">Catálogos impactados:</span>{' '}
                  {registro.catalogos.length > 0
                    ? registro.catalogos
                        .map(item => {
                          const partes: string[] = [];
                          if (item.nome) partes.push(item.nome);
                          if (item.numero) partes.push(`Catálogo ${item.numero}`);
                          if (item.cpf_cnpj) partes.push(formatCPFOrCNPJ(item.cpf_cnpj));
                          return partes.join(' • ') || `Catálogo #${item.id}`;
                        })
                        .join(', ')
                    : 'Todos os catálogos vinculados ao superusuário'}
                </p>
                <p>
                  <span className="text-gray-400">Produtos atualizados:</span> {registro.produtosImpactados}
                </p>
                <p className="flex items-center gap-2">
                  <Calendar size={16} className="text-gray-400" /> {formatarData(registro.criadoEm)}
                </p>
                <p className="flex items-center gap-2">
                  <User size={16} className="text-gray-400" /> {registro.criadoPor || 'Usuário não informado'}
                </p>
              </div>
            </Card>

            <Card>
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 size={20} className="text-emerald-400" />
                <h2 className="text-lg font-semibold text-white">Atributos aplicados</h2>
              </div>
              {atributosComValores.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum atributo foi armazenado para esta atribuição.</p>
              ) : (
                <ul className="space-y-3">
                  {atributosComValores.map(({ atributo, valor }) => (
                    <li key={atributo?.codigo || String(valor)} className="rounded border border-gray-800 bg-gray-900 p-4">
                      <p className="text-sm font-semibold text-white">{atributo?.nome || atributo?.codigo || 'Atributo'}</p>
                      <p className="text-sm text-gray-300">{formatarValorAtributo(atributo, valor)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 text-lg font-semibold text-white">Produtos marcados como exceção</h2>
              {registro.produtosExcecao.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum produto foi marcado como exceção.</p>
              ) : (
                <ul className="space-y-2 text-sm text-gray-200">
                  {registro.produtosExcecao.map(item => (
                    <li key={item.id} className="rounded border border-gray-800 bg-gray-900 p-3">
                      <p className="font-semibold text-white">{item.denominacao}</p>
                      <p className="text-xs text-gray-400">
                        {item.codigo ? `Código: ${item.codigo}` : 'Sem código interno'}
                        {item.catalogo?.nome ? ` • ${item.catalogo.nome}` : ''}
                        {item.catalogo?.numero ? ` • Catálogo ${item.catalogo.numero}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <h2 className="mb-3 text-lg font-semibold text-white">Estrutura utilizada</h2>
              <p className="text-sm text-gray-400">
                A estrutura de atributos foi registrada no momento da execução para consulta futura.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Total de atributos conhecidos: {mapaEstrutura.size}
              </p>
            </Card>

            <Button variant="outline" onClick={voltar} className="w-full">
              Voltar para o histórico
            </Button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
