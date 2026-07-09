import React, { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { formatCPFOrCNPJ } from '@/lib/validation';
import {
  AlertTriangle,
  Download,
  FileJson2,
  FileSpreadsheet,
  Info,
  Layers,
  Save,
} from 'lucide-react';

interface CatalogoResumo {
  id: number;
  nome: string;
  numero: number;
  cpf_cnpj?: string | null;
}

type ModalidadeImportacao = 'PLANILHA' | 'SISCOMEX';
type ModalidadeProduto = 'IMPORTACAO' | 'EXPORTACAO';
type FonteSiscomex = 'ARQUIVO' | 'API';

interface ArquivoSelecionado {
  nome: string;
  conteudoBase64: string;
}

interface ArquivosSiscomexSelecionados {
  produtos: ArquivoSelecionado | null;
  operadores: ArquivoSelecionado | null;
  fabricantes: ArquivoSelecionado | null;
}

interface CampoArquivoProps {
  id: string;
  label: string;
  accept: string;
  required?: boolean;
  error?: string;
  arquivoNome?: string | null;
  carregando?: boolean;
  disabled?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
}

function CampoArquivo({
  id,
  label,
  accept,
  required,
  error,
  arquivoNome,
  carregando,
  disabled,
  onChange,
}: CampoArquivoProps) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>

      <div className="flex flex-col gap-3 rounded-md border border-gray-700 bg-[#1e2126] px-3 py-2 sm:flex-row sm:items-center">
        <input
          id={id}
          type="file"
          accept={accept}
          onChange={onChange}
          className="sr-only"
          disabled={disabled}
        />
        <label
          htmlFor={id}
          className={`inline-flex shrink-0 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition ${
            disabled
              ? 'cursor-not-allowed border-gray-700 bg-slate-800 text-gray-500'
              : 'cursor-pointer border-gray-500 bg-slate-900 text-white hover:border-gray-400'
          }`}
        >
          Escolher arquivo
        </label>

        <div className="min-w-0 text-sm text-gray-300">
          {arquivoNome ? (
            <span className="block truncate">
              Arquivo selecionado:{' '}
              <span className="font-medium text-white">{arquivoNome}</span>
            </span>
          ) : (
            <span className="text-gray-500">Nenhum arquivo selecionado</span>
          )}
          {carregando && <span className="mt-1 block text-xs text-gray-400">Convertendo arquivo...</span>}
        </div>
      </div>

      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}

export default function NovaImportacaoPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const { workingCatalog } = useWorkingCatalog();

  const modeloPlanilhaUrl = '/resources/planilha-modelo-importacao-de-produtos.xlsx';

  const [catalogos, setCatalogos] = useState<CatalogoResumo[]>([]);
  const [catalogoId, setCatalogoId] = useState('');
  const [modalidadeImportacao, setModalidadeImportacao] =
    useState<ModalidadeImportacao>('PLANILHA');
  const [modalidadeProduto, setModalidadeProduto] =
    useState<ModalidadeProduto>('IMPORTACAO');
  const [fonteSiscomex, setFonteSiscomex] = useState<FonteSiscomex>('ARQUIVO');
  const [arquivoPlanilha, setArquivoPlanilha] = useState<ArquivoSelecionado | null>(null);
  const [arquivosSiscomex, setArquivosSiscomex] = useState<ArquivosSiscomexSelecionados>({
    produtos: null,
    operadores: null,
    fabricantes: null,
  });
  const [carregandoArquivo, setCarregandoArquivo] = useState(false);
  const [submetendo, setSubmetendo] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [mostrarInfoSiscomex, setMostrarInfoSiscomex] = useState(false);
  const [mostrarConfirmacaoArquivos, setMostrarConfirmacaoArquivos] = useState(false);
  const [arquivosOpcionaisAusentes, setArquivosOpcionaisAusentes] = useState<string[]>([]);

  const formId = 'nova-importacao-form';
  const isPlanilha = modalidadeImportacao === 'PLANILHA';
  const isSiscomexArquivo =
    modalidadeImportacao === 'SISCOMEX' && fonteSiscomex === 'ARQUIVO';
  const podeSubmeter =
    !submetendo &&
    !carregandoArquivo &&
    !(modalidadeImportacao === 'SISCOMEX' && fonteSiscomex === 'API');
  const submitLabel = submetendo
    ? 'Iniciando...'
    : isPlanilha
      ? 'Iniciar importação'
      : 'Iniciar importação SISCOMEX';

  useEffect(() => {
    const carregarCatalogos = async () => {
      try {
        const resposta = await api.get<CatalogoResumo[]>('/catalogos');
        setCatalogos(resposta.data);
      } catch (error) {
        console.error('Erro ao carregar catálogos', error);
        addToast('Não foi possível carregar os catálogos.', 'error');
      }
    };

    carregarCatalogos();
  }, [addToast]);

  useEffect(() => {
    if (workingCatalog) {
      setCatalogoId(currentValue => currentValue || String(workingCatalog.id));
    }
  }, [workingCatalog]);

  const lerArquivoComoBase64 = useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const resultado = reader.result as string;
        const base64 = resultado.includes(',') ? resultado.split(',')[1] : resultado;
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler o arquivo'));
      reader.readAsDataURL(file);
    });
  }, []);

  const atualizarErro = (chave: string, mensagem = '') => {
    setErros(prev => ({ ...prev, [chave]: mensagem }));
  };

  const handleArquivoPlanilhaChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    atualizarErro('arquivo');

    if (!file) {
      setArquivoPlanilha(null);
      return;
    }

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setArquivoPlanilha(null);
      atualizarErro('arquivo', 'Envie um arquivo no formato .xlsx');
      return;
    }

    try {
      setCarregandoArquivo(true);
      const conteudoBase64 = await lerArquivoComoBase64(file);
      setArquivoPlanilha({
        nome: file.name,
        conteudoBase64,
      });
    } catch (error) {
      console.error('Erro ao carregar planilha', error);
      setArquivoPlanilha(null);
      atualizarErro('arquivo', 'Não foi possível processar a planilha selecionada.');
    } finally {
      setCarregandoArquivo(false);
    }
  };

  const handleArquivoSiscomexChange =
    (campo: keyof ArquivosSiscomexSelecionados) =>
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      atualizarErro(campo);

      if (!file) {
        setArquivosSiscomex(prev => ({ ...prev, [campo]: null }));
        return;
      }

      if (!file.name.toLowerCase().endsWith('.json')) {
        setArquivosSiscomex(prev => ({ ...prev, [campo]: null }));
        atualizarErro(campo, 'Envie um arquivo no formato .json');
        return;
      }

      try {
        setCarregandoArquivo(true);
        const conteudoBase64 = await lerArquivoComoBase64(file);
        setArquivosSiscomex(prev => ({
          ...prev,
          [campo]: {
            nome: file.name,
            conteudoBase64,
          },
        }));
      } catch (error) {
        console.error(`Erro ao carregar arquivo ${campo}`, error);
        setArquivosSiscomex(prev => ({ ...prev, [campo]: null }));
        atualizarErro(campo, 'Não foi possível processar o arquivo selecionado.');
      } finally {
        setCarregandoArquivo(false);
      }
    };

  const validarFormulario = () => {
    const novosErros: Record<string, string> = {};

    if (!catalogoId) {
      novosErros.catalogoId = 'Selecione um catálogo para realizar a importação';
    }

    if (isPlanilha && !arquivoPlanilha) {
      novosErros.arquivo = 'Envie um arquivo Excel (.xlsx) com os produtos';
    }

    if (isSiscomexArquivo && !arquivosSiscomex.produtos) {
      novosErros.produtos = 'Envie o arquivo JSON de produtos exportado do SISCOMEX';
    }

    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  };

  const enviarImportacao = useCallback(
    async (confirmadoSemArquivosComplementares = false) => {
      if (!validarFormulario()) {
        return;
      }

      if (isSiscomexArquivo) {
        const faltantes: string[] = [];
        if (!arquivosSiscomex.operadores) {
          faltantes.push('Operadores estrangeiros');
        }
        if (!arquivosSiscomex.fabricantes) {
          faltantes.push('Vínculos de fabricante/produtor');
        }

        if (faltantes.length > 0 && !confirmadoSemArquivosComplementares) {
          setArquivosOpcionaisAusentes(faltantes);
          setMostrarConfirmacaoArquivos(true);
          return;
        }
      }

      try {
        setSubmetendo(true);

        if (isPlanilha) {
          await api.post(
            '/produtos/importacao',
            {
              origem: 'PLANILHA',
              catalogoId: Number(catalogoId),
              modalidade: modalidadeProduto,
              arquivo: arquivoPlanilha,
            },
            { timeout: 60000 }
          );
        } else {
          await api.post(
            '/produtos/importacao',
            {
              origem: 'SISCOMEX_ARQUIVO',
              catalogoId: Number(catalogoId),
              arquivos: arquivosSiscomex,
            },
            { timeout: 60000 }
          );
        }

        addToast('Importação iniciada. Você será avisado quando terminar.', 'success');
        router.push('/automacao/importar-produto');
      } catch (error: any) {
        console.error('Erro ao iniciar importação', error);
        const mensagem =
          error.response?.data?.error || 'Falha ao iniciar a importação.';
        addToast(mensagem, 'error');
      } finally {
        setSubmetendo(false);
      }
    },
    [
      addToast,
      arquivoPlanilha,
      arquivosSiscomex,
      catalogoId,
      isPlanilha,
      isSiscomexArquivo,
      modalidadeProduto,
      router,
    ]
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await enviarImportacao(false);
  };

  return (
    <DashboardLayout title="Nova Importação de Produtos">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação' },
          { label: 'Importar Produto', href: '/automacao/importar-produto' },
          { label: 'Nova Importação' },
        ]}
      />

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold text-white">Nova Importação de Produtos</h1>
        <div className="flex items-center gap-3 self-end md:self-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/automacao/importar-produto')}
            disabled={submetendo || carregandoArquivo}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="accent"
            className="flex items-center gap-2"
            disabled={!podeSubmeter}
          >
            <Save size={16} />
            {submitLabel}
          </Button>
        </div>
      </div>

      <form id={formId} onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Select
                label="Catálogo"
                value={catalogoId}
                onChange={event => setCatalogoId(event.target.value)}
                options={catalogos.map(catalogo => ({
                  value: String(catalogo.id),
                  label: `${catalogo.nome} · Nº ${catalogo.numero} · ${formatCPFOrCNPJ(
                    catalogo.cpf_cnpj || ''
                  )}`,
                }))}
                error={erros.catalogoId}
                required
              />
              {workingCatalog && (
                <p className="-mt-3 text-xs text-gray-400">
                  O catálogo de trabalho foi sugerido automaticamente, mas você pode escolher outro para esta importação.
                </p>
              )}
            </div>

            {isPlanilha ? (
              <Select
                label="Modalidade do produto"
                value={modalidadeProduto}
                onChange={event =>
                  setModalidadeProduto(event.target.value as ModalidadeProduto)
                }
                options={[
                  { value: 'IMPORTACAO', label: 'Importação' },
                  { value: 'EXPORTACAO', label: 'Exportação' },
                ]}
              />
            ) : (
              <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 text-sm text-gray-300">
                <p className="font-medium text-white">Catálogo aplicado a qualquer fonte</p>
                <p className="mt-2 text-gray-400">
                  O catálogo selecionado acima será usado tanto na importação por planilha quanto na importação do SISCOMEX.
                </p>
              </div>
            )}
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setModalidadeImportacao('PLANILHA')}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
              modalidadeImportacao === 'PLANILHA'
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-100'
                : 'border-slate-700 bg-slate-800/40 text-gray-300 hover:border-emerald-500/40'
            }`}
          >
            <FileSpreadsheet size={24} />
            <div>
              <p className="text-sm font-semibold">Planilha Excel</p>
              <p className="text-xs text-gray-400">
                Importe produtos a partir de um arquivo .xlsx seguindo o layout padrão.
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setModalidadeImportacao('SISCOMEX')}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
              modalidadeImportacao === 'SISCOMEX'
                ? 'border-sky-500 bg-sky-500/10 text-sky-100'
                : 'border-slate-700 bg-slate-800/40 text-gray-300 hover:border-sky-500/40'
            }`}
          >
            <Layers size={24} />
            <div>
              <p className="text-sm font-semibold">Importar do SISCOMEX</p>
              <p className="text-xs text-gray-400">
                Carregue os arquivos exportados do Catálogo de Produtos para criar apenas o que ainda não existe localmente.
              </p>
            </div>
          </button>
        </div>

        {isPlanilha ? (
          <>
            <Card>
              <div className="mb-3 flex flex-col gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-emerald-100/80">
                  Baixe o modelo oficial, preencha os dados solicitados e depois selecione o arquivo atualizado para iniciar a importação.
                </p>
                <a
                  href={modeloPlanilhaUrl}
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-400/60 bg-emerald-500/20 px-3 py-2 font-semibold text-emerald-50 transition hover:border-emerald-300 hover:bg-emerald-500/40"
                >
                  <Download size={16} />
                  Baixar modelo (.xlsx)
                </a>
              </div>
              <CampoArquivo
                id="arquivo-planilha"
                label="Planilha Excel (.xlsx)"
                accept=".xlsx"
                onChange={handleArquivoPlanilhaChange}
                error={erros.arquivo}
                arquivoNome={arquivoPlanilha?.nome}
                carregando={carregandoArquivo}
                disabled={submetendo || carregandoArquivo}
              />
            </Card>

            <Card className="border border-slate-700 bg-slate-800/40">
              <h2 className="text-lg font-semibold text-white">Instruções do arquivo</h2>
              <p className="mt-2 text-sm text-gray-300">
                A planilha deve conter os seguintes campos na primeira linha (cabeçalho):
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-300">
                <li>
                  <strong>Coluna A - Código Interno:</strong> informe um ou mais códigos internos separados por vírgula. São aceitos apenas letras e números, sem espaços.
                </li>
                <li>
                  <strong>Coluna B - Descrição Curta do Produto:</strong> nome curto do produto. Campo obrigatório.
                </li>
                <li>
                  <strong>Coluna C - Descrição Longa do Produto:</strong> detalhamento completo do item. Caso esteja vazio, será utilizado o valor da descrição curta.
                </li>
                <li>
                  <strong>Coluna D - NCM:</strong> código numérico de 8 dígitos, sem formatação.
                </li>
                <li>
                  <strong>Coluna E - Fabricante:</strong> indique as siglas de países (duas letras) correspondentes aos fabricantes separados por vírgula.
                </li>
                <li>
                  <strong>Coluna F - Operador Estrangeiro:</strong> informe os números dos operadores estrangeiros já cadastrados na plataforma, separados por vírgula.
                </li>
              </ul>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setFonteSiscomex('ARQUIVO')}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                    fonteSiscomex === 'ARQUIVO'
                      ? 'border-sky-500 bg-sky-500/10 text-sky-100'
                      : 'border-slate-700 bg-slate-800/40 text-gray-300 hover:border-sky-500/40'
                  }`}
                >
                  <FileJson2 size={22} />
                  <div>
                    <p className="text-sm font-semibold">Arquivo JSON</p>
                    <p className="text-xs text-gray-400">
                      Use os arquivos exportados manualmente do Portal Único.
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setFonteSiscomex('API')}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                    fonteSiscomex === 'API'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-100'
                      : 'border-slate-700 bg-slate-800/40 text-gray-300 hover:border-amber-500/40'
                  }`}
                >
                  <Layers size={22} />
                  <div>
                    <p className="text-sm font-semibold">API direta</p>
                    <p className="text-xs text-gray-400">
                      Reservado para a carga incremental automática.
                    </p>
                  </div>
                </button>
              </div>

              {fonteSiscomex === 'ARQUIVO' ? (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setMostrarInfoSiscomex(true)}
                    className="inline-flex items-center gap-2 text-sm font-medium text-sky-300 transition hover:text-sky-200"
                  >
                    <Info size={16} />
                    Ver orientações desta importação
                  </button>

                  <CampoArquivo
                    id="arquivo-siscomex-produtos"
                    label="Produtos (.json)"
                    accept=".json"
                    onChange={handleArquivoSiscomexChange('produtos')}
                    error={erros.produtos}
                    required
                    arquivoNome={arquivosSiscomex.produtos?.nome}
                    carregando={carregandoArquivo}
                    disabled={submetendo || carregandoArquivo}
                  />

                  <CampoArquivo
                    id="arquivo-siscomex-operadores"
                    label="Operadores estrangeiros (.json) - opcional"
                    accept=".json"
                    onChange={handleArquivoSiscomexChange('operadores')}
                    error={erros.operadores}
                    arquivoNome={arquivosSiscomex.operadores?.nome}
                    carregando={carregandoArquivo}
                    disabled={submetendo || carregandoArquivo}
                  />

                  <CampoArquivo
                    id="arquivo-siscomex-fabricantes"
                    label="Vínculos de fabricante/produtor (.json) - opcional"
                    accept=".json"
                    onChange={handleArquivoSiscomexChange('fabricantes')}
                    error={erros.fabricantes}
                    arquivoNome={arquivosSiscomex.fabricantes?.nome}
                    carregando={carregandoArquivo}
                    disabled={submetendo || carregandoArquivo}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                  <div className="flex items-start gap-3">
                    <Info size={18} className="mt-0.5 text-amber-300" />
                    <div>
                      <p className="font-medium">Fluxo ainda não liberado</p>
                      <p className="mt-1 text-amber-100/80">
                        A carga direta pela API do SISCOMEX ficará nesta aba, mas por enquanto a importação inicial deve ser feita pelos arquivos JSON exportados manualmente.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/automacao/importar-produto')}
            className="text-gray-300 hover:text-white"
            disabled={submetendo || carregandoArquivo}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={!podeSubmeter}
            variant="accent"
            className="flex items-center gap-2"
          >
            <Save size={16} />
            {submitLabel}
          </Button>
        </div>
      </form>

      {mostrarConfirmacaoArquivos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg border border-gray-700 bg-[#151921] p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 text-amber-300" size={20} />
              <div>
                <h3 className="text-xl font-semibold text-white">
                  Continuar sem todos os arquivos?
                </h3>
                <p className="mt-2 text-gray-300">
                  Os seguintes arquivos não foram informados:
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-300">
                  {arquivosOpcionaisAusentes.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="mt-4 text-sm text-gray-400">
                  O resumo da importação mostrará os operadores e vínculos que não puderam ser tratados por falta desses arquivos. Deseja continuar mesmo assim?
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setMostrarConfirmacaoArquivos(false)}
                disabled={submetendo}
              >
                Voltar
              </Button>
              <Button
                variant="accent"
                onClick={async () => {
                  setMostrarConfirmacaoArquivos(false);
                  await enviarImportacao(true);
                }}
                disabled={submetendo}
              >
                Prosseguir mesmo assim
              </Button>
            </div>
          </div>
        </div>
      )}

      {mostrarInfoSiscomex && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-2xl rounded-lg border border-slate-700 bg-[#151921] p-6">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 text-sky-300" size={20} />
              <div className="w-full">
                <h3 className="text-xl font-semibold text-white">
                  Orientações da importação SISCOMEX
                </h3>

                <div className="mt-5">
                  <p className="text-sm font-medium text-white">Arquivos esperados</p>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-300">
                    <li>O arquivo de produtos é obrigatório.</li>
                    <li>
                      Os arquivos de operadores estrangeiros e de vínculos de
                      fabricante/produtor são opcionais.
                    </li>
                    <li>
                      Se algum arquivo opcional não for informado, a aplicação pedirá
                      confirmação antes de continuar.
                    </li>
                  </ul>
                </div>

                <div className="mt-5">
                  <p className="text-sm font-medium text-white">
                    Comportamento da importação
                  </p>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-300">
                    <li>Somente o que ainda não existir localmente será criado automaticamente.</li>
                    <li>
                      Produtos já existentes com código SISCOMEX ou código interno + NCM +
                      modalidade serão apenas contabilizados no resumo.
                    </li>
                    <li>
                      Divergências e ambiguidades ficam no resumo como itens não importados
                      para análise manual.
                    </li>
                    <li>
                      Quando os arquivos opcionais forem enviados, operadores e vínculos
                      também entram no resumo da importação.
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                variant="outline"
                onClick={() => setMostrarInfoSiscomex(false)}
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
