import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Hint } from '@/components/ui/Hint';
import { LegendInfoModal } from '@/components/ui/LegendInfoModal';
import { Search, Pencil, Trash2 } from 'lucide-react';
import { MultiSelect } from '@/components/ui/MultiSelect';
import api from '@/lib/api';
import { produtoStatusLegend, produtoSituacaoLegend } from '@/constants/statusLegends';
import { useRouter } from 'next/router';
import { useToast } from '@/components/ui/ToastContext';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { PaginationControls } from '@/components/ui/PaginationControls';
import { MaskedInput } from '@/components/ui/MaskedInput';
import useDebounce from '@/hooks/useDebounce';

interface Produto {
  id: number;
  codigo?: string | null;
  ncmCodigo: string;
  status: 'PENDENTE' | 'APROVADO' | 'PROCESSANDO' | 'TRANSMITIDO' | 'ERRO';
  atualizadoEm: string;
  catalogoNumero?: number | null;
  catalogoNome?: string | null;
  catalogoCpfCnpj?: string | null;
  denominacao?: string;
  descricao?: string;
  codigosInternos?: string[];
  situacao?: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO' | string;
  modalidade?: 'IMPORTACAO' | 'EXPORTACAO' | null;
}

interface ProdutosPainelResponse {
  items: Produto[];
  total: number;
  page: number;
  pageSize: number;
}

export function ListaProdutosPainel() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [totalProdutos, setTotalProdutos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const statusOptions = [
    { value: 'PENDENTE', label: 'Pendente' },
    { value: 'APROVADO', label: 'Aprovado' },
    { value: 'PROCESSANDO', label: 'Processando' },
    { value: 'TRANSMITIDO', label: 'Transmitido' },
    { value: 'ERRO', label: 'Erro' }
  ] satisfies Array<{ value: Produto['status']; label: string }>;

  const [filtros, setFiltros] = useState<{
    status: Produto['status'][];
    situacoes: Array<'ATIVADO' | 'DESATIVADO' | 'RASCUNHO'>;
    ncm: string;
  }>(() => ({
    status: [],
    situacoes: ['RASCUNHO', 'ATIVADO'],
    ncm: ''
  }));
  const [ncmSugestoes, setNcmSugestoes] = useState<Array<{ codigo: string; descricao: string | null }>>([]);
  const [mostrarSugestoesNcm, setMostrarSugestoesNcm] = useState(false);
  const [carregandoSugestoesNcm, setCarregandoSugestoesNcm] = useState(false);
  const [produtoParaExcluir, setProdutoParaExcluir] = useState<number | null>(null);
  const router = useRouter();
  const { addToast } = useToast();
  const { workingCatalog } = useWorkingCatalog();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const pageSizeOptions = [10, 20, 50];
  const totalPages = Math.max(1, Math.ceil(totalProdutos / Math.max(pageSize, 1)));
  const paginaAtual = Math.min(page, totalPages);
  const debouncedNcmFiltro = useDebounce(filtros.ncm, 800);

  useEffect(() => {
    setPage(1);
  }, [workingCatalog?.id]);

  useEffect(() => {
    const prefixo = debouncedNcmFiltro.replace(/\D/g, '');
    if (prefixo.length >= 4 && prefixo.length < 8) {
      let ativo = true;
      setCarregandoSugestoesNcm(true);
      setMostrarSugestoesNcm(true);

      api
        .get('/siscomex/ncm/sugestoes', { params: { prefixo } })
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
  }, [debouncedNcmFiltro, addToast]);

  const carregarProdutos = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { page, pageSize };
      if (busca.trim()) params.busca = busca.trim();
      const ncmLimpo = filtros.ncm.replace(/\D/g, '');
      if (ncmLimpo.length === 8) params.ncm = ncmLimpo;
      if (filtros.status.length > 0) params.status = filtros.status.join(',');
      if (filtros.situacoes.length > 0)
        params.situacao = filtros.situacoes.join(',');
      if (workingCatalog?.id) params.catalogoId = workingCatalog.id;
      const response = await api.get<ProdutosPainelResponse>('/produtos', { params });
      const { items, total, page: paginaResposta, pageSize: tamanhoResposta } = response.data;
      setProdutos(items);
      setTotalProdutos(total);
      if (paginaResposta && paginaResposta !== page) {
        setPage(paginaResposta);
      }
      if (tamanhoResposta && tamanhoResposta !== pageSize) {
        setPageSize(tamanhoResposta);
      }
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
      setError('Não foi possível carregar os produtos.');
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    busca,
    filtros.status,
    filtros.situacoes,
    filtros.ncm,
    workingCatalog?.id
  ]);

  useEffect(() => {
    carregarProdutos();
  }, [carregarProdutos]);

  const possuiItensNaPagina = totalProdutos > 0 && produtos.length > 0;
  const inicioExibicao = possuiItensNaPagina ? (paginaAtual - 1) * pageSize + 1 : 0;
  const fimExibicao = possuiItensNaPagina
    ? Math.min(totalProdutos, inicioExibicao + produtos.length - 1)
    : 0;
  const exibicaoLabel = possuiItensNaPagina
    ? `Exibindo ${inicioExibicao}-${fimExibicao} de ${totalProdutos} produtos`
    : undefined;

  function formatarData(dataString: string) {
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR');
  }

  function getStatusClasses(status: string) {
    switch (status) {
      case 'PENDENTE':
        return 'bg-[#e4a8351a] text-[#e4a835] border border-[#e4a835]';
      case 'APROVADO':
        return 'bg-[#27f58a1a] text-[#27f58a] border border-[#27f58a]';
      case 'PROCESSANDO':
        return 'bg-[#4c82d31a] text-[#4c82d3] border border-[#4c82d3]';
      case 'TRANSMITIDO':
        return 'bg-[#5e17eb1a] text-[#5e17eb] border border-[#5e17eb]';
      case 'ERRO':
        return 'bg-[#ff57571a] text-[#ff5757] border border-[#ff5757]';
      default:
        return 'bg-gray-900/50 text-gray-400 border border-gray-700';
    }
  }

  function getSituacaoClasses(situacao?: string) {
    switch (situacao) {
      case 'ATIVADO':
        return 'bg-[#27f58a1a] text-[#27f58a] border border-[#27f58a]';
      case 'DESATIVADO':
        return 'bg-[#f2545f1a] text-[#f2545f] border border-[#f2545f]';
      case 'RASCUNHO':
        return 'bg-[#e4a8351a] text-[#e4a835] border border-[#e4a835]';
      default:
        return 'bg-gray-900/50 text-gray-400 border border-gray-700';
    }
  }

  function formatarNCM(ncm?: string) {
    if (!ncm) return '-';
    const digits = ncm.replace(/\D/g, '').slice(0, 8);
    if (!digits) return '-';
    let formatted = digits;
    if (digits.length <= 4) {
      formatted = digits;
    } else if (digits.length <= 6) {
      formatted = digits.replace(/(\d{4})(\d{1,2})/, '$1.$2');
    } else {
      formatted = digits.replace(/(\d{4})(\d{2})(\d{1,2})/, '$1.$2.$3');
    }
    return `${formatted}`;
  }

  function selecionarSugestaoNcm(sugestao: { codigo: string; descricao: string | null }) {
    setFiltros(prev => ({ ...prev, ncm: sugestao.codigo.replace(/\D/g, '') }));
    setMostrarSugestoesNcm(false);
    setNcmSugestoes([]);
    setPage(1);
  }

  function getModalidadeLabel(modalidade: string) {
    switch (modalidade) {
      case 'IMPORTACAO':
        return 'Importação';
      case 'EXPORTACAO':
        return 'Exportação';
      default:
        return modalidade;
    }
  }

  function editarProduto(id: number) {
    router.push(`/produtos/${id}`);
  }

  function confirmarExclusao(id: number) {
    setProdutoParaExcluir(id);
  }

  function cancelarExclusao() {
    setProdutoParaExcluir(null);
  }

  async function excluirProduto() {
    if (!produtoParaExcluir) return;
    try {
      await api.delete(`/produtos/${produtoParaExcluir}`);
      setProdutos(produtos.filter(p => p.id !== produtoParaExcluir));
      addToast('Produto excluído com sucesso', 'success');
    } catch (err) {
      console.error('Erro ao excluir produto:', err);
      addToast('Erro ao excluir produto', 'error');
    } finally {
      setProdutoParaExcluir(null);
    }
  }

  return (
    <>
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative md:col-span-2">
            <label className="block text-sm font-medium mb-2 text-gray-300">Buscar por nome, catálogo ou código</label>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 pl-3 pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              className="pl-10 pr-4 py-2 w-full bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500 h-11 text-sm"
              value={busca}
              onChange={e => {
                setBusca(e.target.value);
                setPage(1);
              }}
              aria-label="Buscar por nome, catálogo ou código"
            />
          </div>
          <div className="relative">
            <MaskedInput
              label="NCM"
              mask="ncm"
              value={filtros.ncm}
              onChange={valor => {
                setFiltros(prev => ({ ...prev, ncm: valor }));
                setPage(1);
              }}
              className="mb-0"
              inputClassName="h-11"
              placeholder="9999.99.99"
              onFocus={() => {
                if (filtros.ncm.length >= 4 && filtros.ncm.length < 8 && ncmSugestoes.length > 0) {
                  setMostrarSugestoesNcm(true);
                }
              }}
              onBlur={() => {
                setTimeout(() => setMostrarSugestoesNcm(false), 100);
              }}
              aria-label="Filtrar por NCM"
            />
            {(carregandoSugestoesNcm || mostrarSugestoesNcm) && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-700 bg-[#1e2126] shadow-lg">
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
                      <span className="font-medium">{formatarNCM(sugestao.codigo)}</span>
                      {sugestao.descricao && (
                        <span className="text-xs text-gray-400">{sugestao.descricao}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <MultiSelect
            label="Status"
            options={statusOptions}
            values={filtros.status}
            onChange={vals => {
              setFiltros(prev => ({
                ...prev,
                status: vals as Produto['status'][]
              }));
              setPage(1);
            }}
            placeholder="Status"
          />
          <MultiSelect
            label="Situação"
            options={[
              { value: 'ATIVADO', label: 'Ativado' },
              { value: 'DESATIVADO', label: 'Desativado' },
              { value: 'RASCUNHO', label: 'Rascunho' },
            ]}
            values={filtros.situacoes}
            onChange={vals => {
              setFiltros(prev => ({ ...prev, situacoes: vals as Array<'ATIVADO' | 'DESATIVADO' | 'RASCUNHO'> }));
              setPage(1);
            }}
            placeholder="Situação"
          />
          {false && ( <select
            className="bg-[#1e2126] border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring focus:border-blue-500"
            value={''}
            onChange={() => {}}
          >
            <option value="TODOS">Todas as situações</option>
            <option value="ATIVADO">Ativado</option>
            <option value="DESATIVADO">Desativado</option>
            <option value="RASCUNHO">Rascunho</option>
          </select> ) }

        </div>
      </Card>

      {error && (
        <div className="bg-red-500/20 border border-red-700 p-4 rounded-lg mb-6 flex items-center gap-3">
          <span>{error}</span>
        </div>
      )}

      <Card>
        {loading ? (
          <div className="text-center py-10">
            <p className="text-gray-400">Carregando produtos...</p>
          </div>
        ) : produtos.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-400 mb-4">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                  <tr>
                    <th className="w-16 px-4 py-3 text-center">Ações</th>
                    <th className="px-4 py-3">Nº CATÁLOGO</th>
                    <th className="px-4 py-3">Catálogo</th>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Cód. Int. (SKU/PN)</th>
                    <th className="px-4 py-3">NCM</th>
                    <th className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        Status
                        <LegendInfoModal
                          title="Status dos Produtos"
                          legend={produtoStatusLegend}
                          triggerAriaLabel="Ver detalhes sobre os status dos produtos"
                        />
                      </span>
                    </th>
                    <th className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        Situação
                        <LegendInfoModal
                          title="Situação dos Produtos"
                          legend={produtoSituacaoLegend}
                          triggerAriaLabel="Ver detalhes sobre as situações dos produtos"
                        />
                      </span>
                    </th>
                    <th className="px-4 py-3">Última Alteração</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 text-gray-300">
                  {produtos.map((produto) => (
                    <tr
                      key={produto.id}
                      className="border-b border-gray-700 hover:bg-[#1a1f2b] transition-colors"
                    >
                      <td className="px-4 py-3 flex gap-2">
                        <button
                          className="p-1 text-gray-300 hover:text-blue-500 transition-colors"
                          onClick={() => editarProduto(produto.id)}
                          title="Editar produto"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                          onClick={() => confirmarExclusao(produto.id)}
                          title="Excluir produto"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                      <td className="px-4 py-3">{produto.catalogoNumero ?? '-'}</td>
                      <td className="px-4 py-3">{produto.catalogoNome ?? '-'}</td>
                      <td className="px-4 py-3">{produto.denominacao ?? produto.codigo ?? '-'}</td>
                      <td className="px-4 py-3">
                        {produto.codigosInternos && produto.codigosInternos.length > 0 ? (
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-[150px]">
                              {produto.codigosInternos.join(', ')}
                            </span>
                            {produto.codigosInternos.join(', ').length > 20 && (
                              <Hint text={produto.codigosInternos.join(', ')} />
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3">{formatarNCM(produto.ncmCodigo)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusClasses(
                            produto.status
                          )}`}
                        >
                          {produto.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {produto.situacao ? (
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getSituacaoClasses(
                              produto.situacao
                            )}`}
                          >
                            {produto.situacao}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3">{formatarData(produto.atualizadoEm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PaginationControls
              page={paginaAtual}
              pageSize={pageSize}
              totalItems={totalProdutos}
              onPageChange={novo => setPage(Math.max(1, Math.min(novo, totalPages)))}
              onPageSizeChange={novo => {
                setPageSize(novo);
                setPage(1);
              }}
              pageSizeOptions={pageSizeOptions}
              loading={loading}
              displayLabel={exibicaoLabel}
            />
          </>
        )}
      </Card>

      {produtoParaExcluir && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#151921] rounded-lg max-w-md w-full p-6 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Confirmar Exclusão</h3>
            <p className="text-gray-300 mb-6">
              Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={cancelarExclusao}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={excluirProduto}>
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ListaProdutosPainel;
