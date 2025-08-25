// frontend/components/operador-estrangeiro/OperadorEstrangeiroSelector.tsx
import React, { useState, useEffect } from 'react';
import { Search, Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useOperadorEstrangeiro, OperadorEstrangeiro } from '@/hooks/useOperadorEstrangeiro';

interface OperadorEstrangeiroSelectorProps {
  onSelect: (operador: OperadorEstrangeiro) => void;
  onCancel: () => void;
  selectedOperadores?: OperadorEstrangeiro[];
  multiSelect?: boolean;
  title?: string;
  catalogoId?: number;
}

export function OperadorEstrangeiroSelector({
  onSelect,
  onCancel,
  selectedOperadores = [],
  multiSelect = false,
  title = 'Selecionar Operador Estrangeiro',
  catalogoId
}: OperadorEstrangeiroSelectorProps) {
  const [busca, setBusca] = useState('');
  const [operadores, setOperadores] = useState<OperadorEstrangeiro[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { buscarOperadores, buscarOperadoresPorTin } = useOperadorEstrangeiro();

  useEffect(() => {
    carregarOperadores();
  }, [catalogoId]);

  async function carregarOperadores() {
    try {
      setLoading(true);
      const dados = await buscarOperadores(catalogoId ? { catalogoId } : undefined);
      setOperadores(dados.filter(op => op.situacao === 'ATIVADO'));
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar operadores:', err);
      setError('Erro ao carregar operadores estrangeiros');
    } finally {
      setLoading(false);
    }
  }

  async function handleBusca() {
    if (!busca.trim()) {
      carregarOperadores();
      return;
    }

    try {
      setLoading(true);
      let resultados: OperadorEstrangeiro[] = [];

      // Se parece com TIN, buscar por TIN
      if (busca.length >= 5 && /^[A-Z]{2}/.test(busca.toUpperCase())) {
        resultados = await buscarOperadoresPorTin(busca);
        if (catalogoId) {
          resultados = resultados.filter(op => op.catalogoId === catalogoId);
        }
      } else {
        // Buscar todos e filtrar localmente
        const todos = await buscarOperadores(catalogoId ? { catalogoId } : undefined);
        resultados = todos.filter(op =>
          op.situacao === 'ATIVADO' && (
            op.nome.toLowerCase().includes(busca.toLowerCase()) ||
            op.tin?.toLowerCase().includes(busca.toLowerCase()) ||
            op.pais.nome.toLowerCase().includes(busca.toLowerCase()) ||
            op.cidade?.toLowerCase().includes(busca.toLowerCase())
          )
        );
      }

      setOperadores(resultados.filter(op => op.situacao === 'ATIVADO'));
      setError(null);
    } catch (err) {
      console.error('Erro na busca:', err);
      setError('Erro ao buscar operadores');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleBusca();
    }
  }

  function isSelected(operador: OperadorEstrangeiro) {
    return selectedOperadores.some(selected => selected.id === operador.id);
  }

  function formatarData(dataString: string) {
    return new Date(dataString).toLocaleDateString('pt-BR');
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#151921] rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-700">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">{title}</h2>
          
          {/* Busca */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar por nome, TIN, país ou cidade..."
                className="pl-10 pr-4 py-2 w-full bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyPress={handleKeyPress}
              />
            </div>
            <Button variant="primary" onClick={handleBusca} disabled={loading}>
              {loading ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {error && (
            <div className="bg-red-500/20 border border-red-700 p-4 rounded-lg mb-4 text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#f59e0b] mx-auto mb-4"></div>
              <p className="text-gray-400">Carregando operadores...</p>
            </div>
          ) : operadores.length === 0 ? (
            <div className="text-center py-8">
              <Globe size={48} className="mx-auto text-gray-500 mb-4" />
              <p className="text-gray-400 mb-4">
                {busca ? 'Nenhum operador encontrado com os critérios de busca' : 'Nenhum operador estrangeiro cadastrado'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {operadores.map((operador) => (
                <div
                  key={operador.id}
                  className={`p-4 bg-[#1a1f2b] rounded-lg border transition-colors cursor-pointer ${
                    isSelected(operador) 
                      ? 'border-[#f59e0b] bg-[#f59e0b]/10' 
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                  onClick={() => onSelect(operador)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium text-white">{operador.nome}</h3>
                        {isSelected(operador) && (
                          <Check size={16} className="text-[#f59e0b]" />
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-400">
                        <div>
                          <span className="font-medium">TIN:</span> {operador.tin || 'Não informado'}
                        </div>
                        <div>
                          <span className="font-medium">País:</span> {operador.pais.nome}
                        </div>
                        <div>
                          <span className="font-medium">Cidade:</span> {operador.cidade || 'Não informado'}
                        </div>
                        <div>
                          <span className="font-medium">Versão:</span> {operador.versao}
                        </div>
                      </div>
                      
                      {operador.email && (
                        <div className="mt-2 text-sm text-gray-400">
                          <span className="font-medium">Email:</span> {operador.email}
                        </div>
                      )}
                    </div>
                    
                    <div className="text-right text-xs text-gray-500">
                      <div>ID: {operador.id}</div>
                      <div>Atualizado: {formatarData(operador.dataUltimaAlteracao)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 flex justify-between items-center">
          <div className="text-sm text-gray-400">
            {operadores.length > 0 && `${operadores.length} operador(es) encontrado(s)`}
            {multiSelect && selectedOperadores.length > 0 && ` • ${selectedOperadores.length} selecionado(s)`}
          </div>
          
          <div className="flex gap-3">
            <Button variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            
            {multiSelect && selectedOperadores.length > 0 && (
              <Button variant="accent">
                Confirmar Seleção ({selectedOperadores.length})
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}