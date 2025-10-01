import React, { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { formatCPFOrCNPJ } from '@/lib/validation';
import { FileSpreadsheet, Info, Layers } from 'lucide-react';

interface CatalogoResumo {
  id: number;
  nome: string;
  numero: number;
  cpf_cnpj?: string | null;
}

type ModalidadeImportacao = 'PLANILHA' | 'SISCOMEX';

type ModalidadeProduto = 'IMPORTACAO' | 'EXPORTACAO';

interface ArquivoSelecionado {
  nome: string;
  conteudoBase64: string;
}

export default function NovaImportacaoPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const { workingCatalog } = useWorkingCatalog();

  const [catalogos, setCatalogos] = useState<CatalogoResumo[]>([]);
  const [catalogoId, setCatalogoId] = useState('');
  const [modalidadeImportacao, setModalidadeImportacao] = useState<ModalidadeImportacao>('PLANILHA');
  const [modalidadeProduto, setModalidadeProduto] = useState<ModalidadeProduto>('IMPORTACAO');
  const [arquivo, setArquivo] = useState<ArquivoSelecionado | null>(null);
  const [arquivoNome, setArquivoNome] = useState('');
  const [carregandoArquivo, setCarregandoArquivo] = useState(false);
  const [submetendo, setSubmetendo] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});

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
      setCatalogoId(String(workingCatalog.id));
    }
  }, [workingCatalog]);

  const limparArquivo = () => {
    setArquivo(null);
    setArquivoNome('');
  };

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

  const handleArquivoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setErros(prev => ({ ...prev, arquivo: '' }));

    if (!file) {
      limparArquivo();
      return;
    }

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      limparArquivo();
      setErros(prev => ({ ...prev, arquivo: 'Envie um arquivo no formato .xlsx' }));
      return;
    }

    try {
      setCarregandoArquivo(true);
      const conteudo = await lerArquivoComoBase64(file);
      setArquivo({ nome: file.name, conteudoBase64: conteudo });
      setArquivoNome(file.name);
    } catch (error) {
      console.error('Erro ao carregar arquivo', error);
      limparArquivo();
      setErros(prev => ({ ...prev, arquivo: 'Não foi possível processar o arquivo selecionado.' }));
    } finally {
      setCarregandoArquivo(false);
    }
  };

  const validarFormulario = () => {
    const novosErros: Record<string, string> = {};
    if (!catalogoId) {
      novosErros.catalogoId = 'Selecione um catálogo para realizar a importação';
    }
    if (!arquivo) {
      novosErros.arquivo = 'Envie um arquivo Excel (.xlsx) com os produtos';
    }
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (modalidadeImportacao !== 'PLANILHA') return;

    if (!validarFormulario()) {
      return;
    }

    try {
      setSubmetendo(true);
      const resposta = await api.post('/produtos/importacao', {
        catalogoId: Number(catalogoId),
        modalidade: modalidadeProduto,
        arquivo: arquivo,
      });

      addToast('Importação concluída!', 'success');
      router.push(`/automacao/importar-produto/${resposta.data.id}`);
    } catch (error: any) {
      console.error('Erro ao iniciar importação', error);
      const mensagem = error.response?.data?.error || 'Falha ao iniciar a importação.';
      addToast(mensagem, 'error');
    } finally {
      setSubmetendo(false);
    }
  };

  return (
    <DashboardLayout title="Nova Importação de Produtos">
      <Breadcrumb
        items={[
          { label: 'Automação', href: '/automacao/importar-produto' },
          { label: 'Importar Produto', href: '/automacao/importar-produto' },
          { label: 'Nova Importação' }
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Nova Importação de Produtos</h1>
        <p className="mt-2 text-sm text-gray-400">
          Escolha a modalidade desejada e informe os dados necessários para iniciar a importação do catálogo.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
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
            <p className="text-xs text-gray-400">Importe produtos a partir de um arquivo .xlsx seguindo o layout padrão.</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setModalidadeImportacao('SISCOMEX')}
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
            modalidadeImportacao === 'SISCOMEX'
              ? 'border-slate-500 bg-slate-500/20 text-slate-100'
              : 'border-slate-700 bg-slate-800/40 text-gray-300 hover:border-slate-500/40'
          }`}
        >
          <Layers size={24} />
          <div>
            <p className="text-sm font-semibold">Importar do Siscomex</p>
            <p className="text-xs text-gray-400">Sincronize produtos diretamente do Siscomex (em desenvolvimento).</p>
          </div>
        </button>
      </div>

      {modalidadeImportacao === 'SISCOMEX' ? (
        <Card className="border border-amber-500/40 bg-amber-500/10">
          <div className="flex items-center gap-3">
            <Info size={24} className="text-amber-300" />
            <div>
              <h2 className="text-lg font-semibold text-amber-100">Funcionalidade em desenvolvimento</h2>
              <p className="mt-1 text-sm text-amber-100/80">
                A importação direta do Siscomex ainda está sendo construída. Utilize a opção de Planilha Excel para importar produtos.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <div className="grid gap-4 md:grid-cols-2">
              {workingCatalog ? (
                <Input
                  label="Catálogo"
                  value={`${workingCatalog.nome} · Nº ${workingCatalog.numero} · ${formatCPFOrCNPJ(workingCatalog.cpf_cnpj || '')}`}
                  disabled
                />
              ) : (
                <Select
                  label="Catálogo"
                  value={catalogoId}
                  onChange={event => setCatalogoId(event.target.value)}
                  options={catalogos.map(c => ({
                    value: String(c.id),
                    label: `${c.nome} · Nº ${c.numero} · ${formatCPFOrCNPJ(c.cpf_cnpj || '')}`
                  }))}
                  error={erros.catalogoId}
                  required
                />
              )}

              <Select
                label="Modalidade do produto"
                value={modalidadeProduto}
                onChange={event => setModalidadeProduto(event.target.value as ModalidadeProduto)}
                options={[
                  { value: 'IMPORTACAO', label: 'Importação' },
                  { value: 'EXPORTACAO', label: 'Exportação' }
                ]}
              />
            </div>

            <div className="mt-4">
              <Input
                type="file"
                label="Planilha Excel (.xlsx)"
                accept=".xlsx"
                onChange={handleArquivoChange}
                error={erros.arquivo}
              />
              {arquivoNome && (
                <p className="mt-1 text-sm text-gray-300">
                  Arquivo selecionado: <span className="font-medium text-white">{arquivoNome}</span>
                  {carregandoArquivo && <span className="ml-2 text-xs text-gray-400">Convertendo arquivo...</span>}
                </p>
              )}
            </div>
          </Card>

          <Card className="border border-slate-700 bg-slate-800/40">
            <h2 className="text-lg font-semibold text-white">Instruções do arquivo</h2>
            <p className="mt-2 text-sm text-gray-300">
              A planilha deve conter os seguintes campos na primeira linha (cabeçalho):
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-300">
              <li><strong>Coluna A – NCM:</strong> código numérico de 8 dígitos, sem formatação.</li>
              <li><strong>Coluna B – Denominação:</strong> nome do produto. Será replicado no campo descrição.</li>
              <li><strong>Coluna C – Código interno / Partnumber:</strong> SKUs separados por vírgula (somente números).</li>
            </ul>
            <p className="mt-3 text-xs text-gray-400">
              Dicas: deixe linhas vazias no final da planilha em branco, garanta que a primeira linha contenha o cabeçalho indicado e salve o arquivo no formato .xlsx.
            </p>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/automacao/importar-produto')}
              className="text-gray-300 hover:text-white"
              disabled={submetendo}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submetendo || carregandoArquivo}>
              {submetendo ? 'Importando...' : 'Iniciar importação'}
            </Button>
          </div>
        </form>
      )}
    </DashboardLayout>
  );
}
