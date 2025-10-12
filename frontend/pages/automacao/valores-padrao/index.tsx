// frontend/pages/automacao/valores-padrao/index.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { isValorPreenchido } from '@/lib/atributos';
import { formatCPFOrCNPJ } from '@/lib/validation';
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';

interface AtributoSnapshot {
  codigo: string;
  nome?: string;
  tipo?: string;
  dominio?: { codigo: string; descricao: string }[];
  subAtributos?: AtributoSnapshot[];
}

interface CatalogoRelacionamento {
  catalogoId: number;
  catalogo?: {
    id: number;
    nome: string;
    numero: number;
    cpf_cnpj: string | null;
  };
}

interface NcmValorPadrao {
  id: number;
  ncmCodigo: string;
  modalidade?: string | null;
  criadoEm: string;
  atualizadoEm: string;
  catalogos: CatalogoRelacionamento[];
  valoresJson?: Record<string, unknown> | null;
  estruturaSnapshotJson?: AtributoSnapshot[] | null;
}

type NcmValorPadraoDetalhe = NcmValorPadrao;

function formatarNCM(ncm: string) {
  const digits = ncm.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return digits.replace(/(\d{4})(\d{1,2})/, '$1.$2');
  return digits.replace(/(\d{4})(\d{2})(\d{1,2})/, '$1.$2.$3');
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

function formatarModalidade(modalidade?: string | null) {
  if (!modalidade) return '-';
  const valor = modalidade.toUpperCase();
  if (valor === 'IMPORTACAO') return 'Importação';
  if (valor === 'EXPORTACAO') return 'Exportação';
  return modalidade;
}

function descreverCatalogos(item: NcmValorPadrao) {
  if (!item.catalogos || item.catalogos.length === 0) {
    return '-';
  }

  return item.catalogos
    .map(relacao => {
      if (relacao.catalogo) {
        const partes = [relacao.catalogo.nome];
        if (relacao.catalogo.numero) {
          partes.push(`Catálogo ${relacao.catalogo.numero}`);
        }
        if (relacao.catalogo.cpf_cnpj) {
          partes.push(formatCPFOrCNPJ(relacao.catalogo.cpf_cnpj));
        }
        return partes.join(' • ');
      }
      return `Catálogo #${relacao.catalogoId}`;
    })
    .join(', ');
}

export default function ValoresPadraoNcmListaPage() {
  const [registros, setRegistros] = useState<NcmValorPadrao[]>([]);
  const [loading, setLoading] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [registroParaExcluir, setRegistroParaExcluir] = useState<NcmValorPadrao | null>(null);
  const [registroParaVisualizar, setRegistroParaVisualizar] = useState<NcmValorPadraoDetalhe | null>(null);
  const [visualizacaoAberta, setVisualizacaoAberta] = useState(false);
  const [carregandoVisualizacao, setCarregandoVisualizacao] = useState(false);
  const [erroVisualizacao, setErroVisualizacao] = useState<string | null>(null);
  const { addToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setLoading(true);
      setErroCarregamento(false);
      const resposta = await api.get('/ncm-valores-padrao');
      const dados = (resposta.data || []) as NcmValorPadrao[];
      setRegistros(
        dados.map(item => ({
          ...item,
          catalogos: item.catalogos || [],
          valoresJson: (item as NcmValorPadrao).valoresJson || null,
          estruturaSnapshotJson: (item as NcmValorPadrao).estruturaSnapshotJson || null
        }))
      );
    } catch (error) {
      console.error('Erro ao carregar valores padrão de NCM:', error);
      setErroCarregamento(true);
      addToast('Erro ao carregar valores padrão de NCM', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function remover() {
    if (!registroParaExcluir) return;
    try {
      await api.delete(`/ncm-valores-padrao/${registroParaExcluir.id}`);
      setRegistros(prev => prev.filter(item => item.id !== registroParaExcluir.id));
      addToast('Valores padrão removidos com sucesso', 'success');
    } catch (error) {
      console.error('Erro ao remover valores padrão de NCM:', error);
      addToast('Erro ao remover valores padrão de NCM', 'error');
    } finally {
      setRegistroParaExcluir(null);
    }
  }

  const registrosFiltrados = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    if (!termo) return registros;
    return registros.filter(item => {
      const ncmMatch = formatarNCM(item.ncmCodigo).replace(/\./g, '').includes(termo.replace(/\D/g, ''));
      const modalidadeMatch = (item.modalidade || '').toLowerCase().includes(termo);
      const catalogoMatch = item.catalogos?.some(relacao => {
        const nome = relacao.catalogo?.nome?.toLowerCase() || '';
        const numero = relacao.catalogo?.numero ? String(relacao.catalogo.numero) : '';
        const documento = relacao.catalogo?.cpf_cnpj?.replace(/\D/g, '') || '';
        const termoNumerico = termo.replace(/\D/g, '');
        return (
          nome.includes(termo) ||
          (numero && numero.includes(termo)) ||
          (documento && termoNumerico && documento.includes(termoNumerico))
        );
      });
      return ncmMatch || modalidadeMatch || Boolean(catalogoMatch);
    });
  }, [filtro, registros]);

  function coletarAtributos(estrutura: AtributoSnapshot[] | null | undefined) {
    const lista: AtributoSnapshot[] = [];
    if (!estrutura) return lista;
    const percorrer = (itens: AtributoSnapshot[]) => {
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

  function formatarValorAtributo(
    atributo: AtributoSnapshot | undefined,
    valor: unknown
  ): string {
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
          if (opcao) {
            return `${opcao.codigo} - ${opcao.descricao}`;
          }
        }
        return texto;
      })
      .filter(Boolean)
      .join(', ');
  }

  const atributosPreenchidos = useMemo(() => {
    if (!registroParaVisualizar) return [];
    const valores = (registroParaVisualizar.valoresJson || {}) as Record<string, unknown>;
    const estrutura = registroParaVisualizar.estruturaSnapshotJson || [];
    const atributosOrdenados = coletarAtributos(estrutura);
    const mapa = new Map(atributosOrdenados.map(attr => [attr.codigo, attr] as const));
    const adicionados = new Set<string>();
    const lista = atributosOrdenados
      .filter(attr => {
        const valor = valores[attr.codigo];
        return isValorPreenchido(valor as any);
      })
      .map(attr => {
        const valor = valores[attr.codigo]!;
        adicionados.add(attr.codigo);
        return {
          codigo: attr.codigo,
          nome: attr.nome || attr.codigo,
          valorFormatado: formatarValorAtributo(attr, valor)
        };
      });

    Object.entries(valores).forEach(([codigo, valor]) => {
      if (adicionados.has(codigo)) return;
      if (!isValorPreenchido(valor as any)) return;
      lista.push({
        codigo,
        nome: codigo,
        valorFormatado: formatarValorAtributo(mapa.get(codigo), valor)
      });
    });

    return lista;
  }, [registroParaVisualizar]);

  async function abrirVisualizacao(item: NcmValorPadrao) {
    setVisualizacaoAberta(true);
    setCarregandoVisualizacao(true);
    setErroVisualizacao(null);
    try {
      if (item.estruturaSnapshotJson && item.valoresJson) {
        setRegistroParaVisualizar({
          ...item,
          estruturaSnapshotJson: item.estruturaSnapshotJson,
          valoresJson: item.valoresJson
        });
      } else {
        const resposta = await api.get<NcmValorPadraoDetalhe>(`/ncm-valores-padrao/${item.id}`);
        setRegistroParaVisualizar(resposta.data);
      }
    } catch (error) {
      console.error('Erro ao visualizar valores padrão:', error);
      setErroVisualizacao('Não foi possível carregar os valores padrão para visualização.');
      addToast('Erro ao carregar valores padrão', 'error');
    } finally {
      setCarregandoVisualizacao(false);
    }
  }

  function fecharVisualizacao() {
    setVisualizacaoAberta(false);
    setRegistroParaVisualizar(null);
    setErroVisualizacao(null);
  }

  return (
    <DashboardLayout title="Valores Padrão por NCM">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao/importar-produto' },
          { label: 'Valores Padrão por NCM' }
        ]}
      />

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold text-white">Valores Padrão por NCM</h1>
        <Button
          variant="accent"
          className="flex items-center gap-2 self-end md:self-auto"
          onClick={() => router.push('/automacao/valores-padrao/novo')}
        >
          <Plus size={16} />
          Novo Grupo
        </Button>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="relative md:col-span-2">
            <label className="block text-sm font-medium mb-2 text-gray-300">Filtrar por NCM, modalidade ou catálogo</label>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 pl-3 pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              className="pl-10 pr-4 py-2 w-full bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
              value={filtro}
              onChange={event => setFiltro(event.target.value)}
              placeholder="Digite a NCM, modalidade ou catálogo"
            />
          </div>
          <div className="text-sm text-gray-400">
            Exibindo {registrosFiltrados.length} de {registros.length} grupos
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="py-10 text-center text-gray-400">Carregando valores padrão...</div>
        ) : erroCarregamento ? (
          <div className="py-10 text-center text-gray-400">
            Não foi possível carregar os valores padrão. <br />
            <button className="text-blue-400 hover:underline" onClick={carregar}>
              Tentar novamente
            </button>
          </div>
        ) : registros.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            Nenhum valor padrão cadastrado.
          </div>
        ) : registrosFiltrados.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            Nenhum registro encontrado com os filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                <tr>
                  <th className="w-20 px-4 py-3 text-center">Ações</th>
                  <th className="px-4 py-3">NCM</th>
                  <th className="px-4 py-3">Modalidade</th>
                  <th className="px-4 py-3">Catálogos</th>
                  <th className="px-4 py-3">Criado em</th>
                  <th className="px-4 py-3">Atualizado em</th>
                </tr>
              </thead>
              <tbody>
                {registrosFiltrados.map(item => (
                  <tr key={item.id} className="border-b border-gray-700 hover:bg-[#1a1f2b] transition-colors">
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          className="p-1 text-gray-300 hover:text-emerald-400 transition-colors"
                          onClick={() => abrirVisualizacao(item)}
                          title="Visualizar valores padrão"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="p-1 text-gray-300 hover:text-blue-500 transition-colors"
                          onClick={() => router.push(`/automacao/valores-padrao/${item.id}`)}
                          title="Editar valores padrão"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                          onClick={() => setRegistroParaExcluir(item)}
                          title="Excluir valores padrão"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{formatarNCM(item.ncmCodigo)}</td>
                    <td className="px-4 py-3 text-gray-200">{formatarModalidade(item.modalidade)}</td>
                    <td className="px-4 py-3 text-gray-200">{descreverCatalogos(item)}</td>
                    <td className="px-4 py-3 text-gray-200">{formatarData(item.criadoEm)}</td>
                    <td className="px-4 py-3 text-gray-200">{formatarData(item.atualizadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {registroParaExcluir && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Confirmar exclusão</h3>
            <p className="text-gray-300 mb-6">
              Deseja remover os valores padrão da NCM {formatarNCM(registroParaExcluir.ncmCodigo)}?
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRegistroParaExcluir(null)}>
                Cancelar
              </Button>
              <Button variant="accent" onClick={remover}>
                Remover
              </Button>
            </div>
          </Card>
        </div>
      )}

      {visualizacaoAberta && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4">
          <Card className="w-full max-w-3xl p-6">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-xl font-semibold text-white">Atributos padrão preenchidos</h3>
                {registroParaVisualizar && (
                  <p className="text-sm text-gray-300 mt-1">
                    NCM {formatarNCM(registroParaVisualizar.ncmCodigo)}{' '}
                    {registroParaVisualizar.modalidade
                      ? `• Modalidade ${formatarModalidade(registroParaVisualizar.modalidade)}`
                      : ''}
                  </p>
                )}
              </div>

              {carregandoVisualizacao ? (
                <div className="py-10 text-center text-gray-400">Carregando informações...</div>
              ) : erroVisualizacao ? (
                <div className="py-6 text-center text-gray-300">{erroVisualizacao}</div>
              ) : atributosPreenchidos.length === 0 ? (
                <div className="py-6 text-center text-gray-300">
                  Nenhum atributo padrão foi preenchido para este grupo.
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                      <tr>
                        <th className="px-4 py-2">Atributo</th>
                        <th className="px-4 py-2">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {atributosPreenchidos.map(attr => (
                        <tr key={attr.codigo} className="border-b border-gray-700">
                          <td className="px-4 py-3 font-medium text-white">{attr.nome}</td>
                          <td className="px-4 py-3 text-gray-200">{attr.valorFormatado}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={fecharVisualizacao}>
                  Fechar
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
