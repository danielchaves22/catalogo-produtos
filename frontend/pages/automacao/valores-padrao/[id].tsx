// frontend/pages/automacao/valores-padrao/[id].tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MaskedInput } from '@/components/ui/MaskedInput';
import { Select } from '@/components/ui/Select';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Hint } from '@/components/ui/Hint';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { algumValorIgual, algumValorSatisfazCondicao, isValorPreenchido, normalizarValoresMultivalorados } from '@/lib/atributos';
import { PageLoader } from '@/components/ui/PageLoader';
import useDebounce from '@/hooks/useDebounce';
import { ArrowLeft, Save } from 'lucide-react';

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

interface NcmValorPadraoDetalhe {
  id: number;
  ncmCodigo: string;
  modalidade?: string | null;
  valoresJson: Record<string, string | string[]> | null;
  estruturaSnapshotJson?: AtributoEstrutura[];
}

export default function ValoresPadraoNcmPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const { id } = router.query;
  const isModoEdicao = router.isReady && typeof id === 'string' && id !== 'novo';
  const isNew = !isModoEdicao;
  const camposBloqueados = isModoEdicao;

  const [ncm, setNcm] = useState('');
  const [ncmDescricao, setNcmDescricao] = useState('');
  const [unidadeMedida, setUnidadeMedida] = useState('');
  const [modalidade, setModalidade] = useState<'IMPORTACAO' | 'EXPORTACAO'>('IMPORTACAO');
  const [estrutura, setEstrutura] = useState<AtributoEstrutura[]>([]);
  const [valores, setValores] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadingEstrutura, setLoadingEstrutura] = useState(false);
  const [estruturaCarregada, setEstruturaCarregada] = useState(false);
  const [ncmSugestoes, setNcmSugestoes] = useState<Array<{ codigo: string; descricao: string | null }>>([]);
  const [mostrarSugestoesNcm, setMostrarSugestoesNcm] = useState(false);
  const [carregandoSugestoesNcm, setCarregandoSugestoesNcm] = useState(false);
  const debouncedNcm = useDebounce(ncm, 800);
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isModoEdicao || typeof id !== 'string') return;
    carregarRegistro(id);
  }, [isModoEdicao, id]);

  useEffect(() => {
    if (!isNew) return;

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
  }, [debouncedNcm, isNew]);

  useEffect(() => {
    if (!estruturaCarregada || !estrutura.length) return;
    setErroFormulario(null);
  }, [estruturaCarregada, estrutura.length]);

  function formatarNCMExibicao(codigo?: string) {
    if (!codigo) return '';
    const digits = String(codigo).replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return digits.replace(/(\d{4})(\d{1,2})/, '$1.$2');
    return digits.replace(/(\d{4})(\d{2})(\d{1,2})/, '$1.$2.$3');
  }

  function ordenarAtributos(lista: AtributoEstrutura[]): AtributoEstrutura[] {
    const map = new Map(lista.map(a => [a.codigo, a]));
    const resultado: AtributoEstrutura[] = [];
    const visitados = new Set<string>();

    function inserir(attr: AtributoEstrutura) {
      if (visitados.has(attr.codigo)) return;
      visitados.add(attr.codigo);
      if (attr.subAtributos) {
        attr.subAtributos = ordenarAtributos(attr.subAtributos);
      }
      resultado.push(attr);
      for (const a of lista) {
        if (a.parentCodigo === attr.codigo && map.get(attr.codigo)?.tipo !== 'COMPOSTO') {
          inserir(a);
        }
      }
    }

    for (const attr of lista) {
      if (!attr.parentCodigo || map.get(attr.parentCodigo)?.tipo === 'COMPOSTO') {
        inserir(attr);
      }
    }

    for (const attr of lista) if (!visitados.has(attr.codigo)) inserir(attr);

    return resultado;
  }

  async function carregarEstrutura(ncmCodigo: string, modalidadeSelecionada: string, valoresIniciais?: Record<string, string | string[]>) {
    if (ncmCodigo.length < 8) return;
    setLoadingEstrutura(true);
    try {
      const response = await api.get(`/siscomex/atributos/ncm/${ncmCodigo}?modalidade=${modalidadeSelecionada}`);
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
      setValores(valoresIniciais ? { ...valoresIniciais } : {});
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

  async function carregarRegistro(registroId: string) {
    try {
      setLoading(true);
      const resposta = await api.get<NcmValorPadraoDetalhe>(`/ncm-valores-padrao/${registroId}`);
      const registro = resposta.data;
      setNcm(registro.ncmCodigo);
      const modalidadeRegistro = (registro.modalidade || 'IMPORTACAO') as 'IMPORTACAO' | 'EXPORTACAO';
      setModalidade(modalidadeRegistro);
      const valoresIniciais = (registro.valoresJson || {}) as Record<string, string | string[]>;
      await carregarEstrutura(registro.ncmCodigo, modalidadeRegistro, valoresIniciais);
      setLoading(false);
    } catch (error) {
      console.error('Erro ao carregar valores padrão:', error);
      addToast('Erro ao carregar valores padrão', 'error');
      setLoading(false);
      router.push('/automacao/valores-padrao');
    }
  }

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
            onChange={e => handleValor(attr.codigo, e.target.value)}
            step={attr.tipo === 'NUMERO_REAL' ? '0.01' : undefined}
          />
        );
      case 'COMPOSTO':
        return (
          <div key={attr.codigo} className="col-span-3">
            <p className="font-medium mb-2 text-sm">{attr.nome}</p>
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
                onChange={(valorLimpo) => handleValor(attr.codigo, valorLimpo)}
                className={span}
              />
            );
          }

          if (max >= 100) {
            return (
              <div key={attr.codigo} className="col-span-3 mb-4">
                <label
                  htmlFor={attr.codigo}
                  className="block text-sm font-medium mb-1 text-gray-300"
                >
                  {attr.nome}
                  {attr.obrigatorio && (
                    <span className="text-red-400 ml-1">*</span>
                  )}
                  {attr.orientacaoPreenchimento && (
                    <Hint text={attr.orientacaoPreenchimento} />
                  )}
                </label>
                <textarea
                  id={attr.codigo}
                  rows={3}
                  className="w-full px-2 py-1 text-sm bg-[#1e2126] border border-gray-700 text-white rounded-md focus:outline-none focus:ring focus:border-blue-500"
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

  function handleNcmChange(valor: string) {
    if (camposBloqueados) return;

    setNcm(valor);
    if (valor.length < 4 || valor.length >= 8) {
      setNcmSugestoes([]);
      setMostrarSugestoesNcm(false);
      setCarregandoSugestoesNcm(false);
    }
    if (valor.length === 8) {
      carregarEstrutura(valor, modalidade);
    } else {
      setNcmDescricao('');
      setUnidadeMedida('');
      setEstruturaCarregada(false);
      setEstrutura([]);
      setValores({});
    }
  }

  function selecionarSugestaoNcm(sugestao: { codigo: string; descricao: string | null }) {
    if (camposBloqueados) return;

    setNcmDescricao(sugestao.descricao || '');
    setMostrarSugestoesNcm(false);
    setNcmSugestoes([]);
    handleNcmChange(sugestao.codigo);
  }

  async function salvar() {
    if (ncm.length !== 8) {
      setErroFormulario('Informe uma NCM válida (8 dígitos).');
      addToast('Informe uma NCM válida para salvar os valores padrão.', 'error');
      return;
    }

    if (!estruturaCarregada) {
      setErroFormulario('Carregue os atributos da NCM antes de salvar.');
      addToast('Carregue os atributos da NCM antes de salvar.', 'error');
      return;
    }

    try {
      setErroFormulario(null);
      setLoading(true);
      const payloadBase = {
        valoresAtributos: valores,
        estruturaSnapshot: estrutura
      };

      if (isNew) {
        await api.post('/ncm-valores-padrao', {
          ...payloadBase,
          ncmCodigo: ncm,
          modalidade
        });
        addToast('Valores padrão cadastrados com sucesso!', 'success');
      } else if (isModoEdicao && typeof id === 'string') {
        await api.put(`/ncm-valores-padrao/${id}`, payloadBase);
        addToast('Valores padrão atualizados com sucesso!', 'success');
      }
      router.push('/automacao/valores-padrao');
    } catch (error: any) {
      console.error('Erro ao salvar valores padrão:', error);
      if (error.response?.data?.error) {
        addToast(error.response.data.error, 'error');
      } else {
        addToast('Erro ao salvar valores padrão', 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  function voltar() {
    router.push('/automacao/valores-padrao');
  }

  return (
    <DashboardLayout title={isNew ? 'Novo Valor Padrão de NCM' : 'Editar Valor Padrão de NCM'}>
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao/importar-produto' },
          { label: 'Valores Padrão por NCM', href: '/automacao/valores-padrao' },
          { label: isNew ? 'Novo' : 'Editar' }
        ]}
      />

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <button onClick={voltar} className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-semibold text-white">
            {isNew ? 'Cadastrar Valores Padrão' : 'Editar Valores Padrão'}
          </h1>
        </div>
        <div className="flex items-center gap-3 self-end md:self-auto">
          <Button type="button" variant="outline" onClick={voltar}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="accent"
            className="flex items-center gap-2"
            onClick={salvar}
            disabled={loading}
          >
            <Save size={16} />
            Salvar
          </Button>
        </div>
      </div>

      <Card className="mb-6 overflow-visible">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[9rem_11rem_10rem_minmax(0,1fr)]">
          <div className="relative">
            <MaskedInput
              label="NCM"
              mask="ncm"
              value={ncm}
              onChange={handleNcmChange}
              className="md:mb-0"
              required
              disabled={loading || camposBloqueados}
              onFocus={() => {
                if (
                  !camposBloqueados &&
                  ncm.length >= 4 &&
                  ncm.length < 8 &&
                  ncmSugestoes.length > 0
                ) {
                  setMostrarSugestoesNcm(true);
                }
              }}
              onBlur={() => {
                setTimeout(() => setMostrarSugestoesNcm(false), 100);
              }}
              autoComplete="off"
            />

            {(carregandoSugestoesNcm || mostrarSugestoesNcm) && ncm.length < 8 && isNew && (
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 md:max-h-80 overflow-y-auto rounded-md border border-gray-700 bg-[#1e2126] shadow-lg">
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
                      <span className="font-medium">{formatarNCMExibicao(sugestao.codigo)}</span>
                      {sugestao.descricao && (
                        <span className="text-xs text-gray-400">{sugestao.descricao}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <Select
            label="Modalidade"
            options={[
              { value: 'IMPORTACAO', label: 'Importação' },
              { value: 'EXPORTACAO', label: 'Exportação' }
            ]}
            value={modalidade}
            onChange={e => {
              if (camposBloqueados) return;
              const novaModalidade = e.target.value as 'IMPORTACAO' | 'EXPORTACAO';
              setModalidade(novaModalidade);
              if (ncm.length === 8) {
                carregarEstrutura(ncm, novaModalidade);
              }
            }}
            disabled={camposBloqueados}
            className="md:mb-0 md:w-[11rem]"
          />
          <Input
            label="Unidade de Medida"
            value={unidadeMedida}
            disabled
            className="md:mb-0 md:w-[10rem]"
            maxLength={10}
          />
          <Input
            label="Descrição NCM"
            value={ncmDescricao}
            disabled
            className="md:mb-0"
          />
        </div>
      </Card>

      {erroFormulario && (
        <Card className="mb-6 border border-red-500/40 bg-red-500/10 text-sm text-red-300">
          <p>{erroFormulario}</p>
        </Card>
      )}

      {loading && !estruturaCarregada ? (
        <Card>
          <PageLoader message="Carregando dados..." />
        </Card>
      ) : (
        <Card>
          {loadingEstrutura ? (
            <PageLoader message="Carregando atributos da NCM..." />
          ) : !estruturaCarregada ? (
            <div className="py-10 text-center text-gray-400">
              Informe uma NCM válida para carregar os atributos.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 text-sm">
              {estrutura.map(attr => renderCampo(attr))}
            </div>
          )}
        </Card>
      )}
    </DashboardLayout>
  );
}
