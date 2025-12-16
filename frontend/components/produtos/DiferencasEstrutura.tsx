// frontend/components/produtos/DiferencasEstrutura.tsx
import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { AlertCircle, CheckCircle, PlusCircle, MinusCircle, RefreshCw } from 'lucide-react';

interface DiferencaAtributo {
  codigo: string;
  tipo: 'ADICIONADO' | 'REMOVIDO' | 'MODIFICADO';
  campo?: string;
  valorAtual?: any;
  valorLegado?: any;
  caminho?: string[];
}

interface DiferencasEstruturaProps {
  ncmCodigo: string;
  modalidade: string;
}

export function DiferencasEstrutura({ ncmCodigo, modalidade }: DiferencasEstruturaProps) {
  const [diferencas, setDiferencas] = useState<DiferencaAtributo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDiferencas();
  }, [ncmCodigo, modalidade]);

  const fetchDiferencas = async () => {
    try {
      setLoading(true);
      setError(null);

      // Buscar o relatório de verificação mais recente
      const response = await api.get('/automacao/jobs', {
        params: {
          tipo: 'AJUSTE_ESTRUTURA',
          limit: 1
        }
      });

      if (response.data.items && response.data.items.length > 0) {
        const job = response.data.items[0];

        // Buscar o arquivo do job
        if (job.arquivo) {
          const fileResponse = await api.get(`/automacao/jobs/${job.id}/arquivo`);
          const conteudo = JSON.parse(atob(fileResponse.data.conteudoBase64));

          // Encontrar a NCM específica
          const ncmData = conteudo.find(
            (item: any) => item.ncmCodigo === ncmCodigo && item.modalidade === modalidade
          );

          if (ncmData && ncmData.diferencas) {
            setDiferencas(ncmData.diferencas);
          } else {
            setDiferencas([]);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar diferenças:', err);
      setError('Não foi possível carregar as diferenças de estrutura');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin">
          <RefreshCw size={24} className="text-gray-400" />
        </div>
        <span className="ml-2 text-gray-400">Carregando diferenças...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
        <div className="flex items-center">
          <AlertCircle className="text-yellow-600 mr-2" size={20} />
          <span className="text-yellow-800 text-sm">{error}</span>
        </div>
      </div>
    );
  }

  if (diferencas.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded p-4">
        <div className="flex items-center">
          <CheckCircle className="text-green-600 mr-2" size={20} />
          <span className="text-green-800 text-sm">
            Nenhuma diferença encontrada. A estrutura está sincronizada.
          </span>
        </div>
      </div>
    );
  }

  const agrupadas = {
    adicionados: diferencas.filter(d => d.tipo === 'ADICIONADO'),
    removidos: diferencas.filter(d => d.tipo === 'REMOVIDO'),
    modificados: diferencas.filter(d => d.tipo === 'MODIFICADO')
  };

  return (
    <div className="space-y-4">
      {agrupadas.adicionados.length > 0 && (
        <div className="border border-green-200 rounded">
          <div className="bg-green-50 px-4 py-2 border-b border-green-200">
            <div className="flex items-center">
              <PlusCircle className="text-green-600 mr-2" size={18} />
              <span className="font-semibold text-green-800">
                Atributos Adicionados ({agrupadas.adicionados.length})
              </span>
            </div>
          </div>
          <div className="p-4">
            <ul className="space-y-2">
              {agrupadas.adicionados.map((diff, index) => (
                <li key={index} className="text-sm text-gray-700">
                  • <span className="font-mono bg-gray-100 px-1 rounded">{diff.codigo}</span>
                  {diff.caminho && diff.caminho.length > 1 && (
                    <span className="text-gray-500 text-xs ml-2">
                      ({diff.caminho.join(' › ')})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {agrupadas.removidos.length > 0 && (
        <div className="border border-red-200 rounded">
          <div className="bg-red-50 px-4 py-2 border-b border-red-200">
            <div className="flex items-center">
              <MinusCircle className="text-red-600 mr-2" size={18} />
              <span className="font-semibold text-red-800">
                Atributos Removidos ({agrupadas.removidos.length})
              </span>
            </div>
          </div>
          <div className="p-4">
            <ul className="space-y-2">
              {agrupadas.removidos.map((diff, index) => (
                <li key={index} className="text-sm text-gray-700">
                  • <span className="font-mono bg-gray-100 px-1 rounded">{diff.codigo}</span>
                  {diff.caminho && diff.caminho.length > 1 && (
                    <span className="text-gray-500 text-xs ml-2">
                      ({diff.caminho.join(' › ')})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {agrupadas.modificados.length > 0 && (
        <div className="border border-blue-200 rounded">
          <div className="bg-blue-50 px-4 py-2 border-b border-blue-200">
            <div className="flex items-center">
              <RefreshCw className="text-blue-600 mr-2" size={18} />
              <span className="font-semibold text-blue-800">
                Atributos Modificados ({agrupadas.modificados.length})
              </span>
            </div>
          </div>
          <div className="p-4">
            <ul className="space-y-3">
              {agrupadas.modificados.map((diff, index) => (
                <li key={index} className="text-sm">
                  <div className="font-mono bg-gray-100 px-1 rounded inline-block mb-1">
                    {diff.codigo}
                  </div>
                  {diff.caminho && diff.caminho.length > 1 && (
                    <span className="text-gray-500 text-xs ml-2">
                      ({diff.caminho.join(' › ')})
                    </span>
                  )}
                  {diff.campo && (
                    <div className="ml-4 mt-1 text-gray-600">
                      Campo <strong>{diff.campo}</strong>:
                      <span className="ml-2 text-red-600 line-through">
                        {JSON.stringify(diff.valorAtual)}
                      </span>
                      <span className="mx-2">→</span>
                      <span className="text-green-600">
                        {JSON.stringify(diff.valorLegado)}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
