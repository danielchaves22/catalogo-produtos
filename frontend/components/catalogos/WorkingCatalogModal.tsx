import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useWorkingCatalog, WorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { EnvironmentBadge } from '@/components/ui/EnvironmentBadge';

type CatalogoAmbiente = 'HOMOLOGACAO' | 'PRODUCAO';

interface CatalogoResumo {
  id: number;
  numero: number;
  nome: string;
  cpf_cnpj?: string | null;
  ambiente: CatalogoAmbiente;
}

interface WorkingCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WorkingCatalogModal({ isOpen, onClose }: WorkingCatalogModalProps) {
  const { workingCatalog, setWorkingCatalog } = useWorkingCatalog();
  const [catalogos, setCatalogos] = useState<CatalogoResumo[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    async function carregar() {
      try {
        const res = await api.get<CatalogoResumo[]>('/catalogos');
        setCatalogos(res.data);
        if (workingCatalog && !workingCatalog.ambiente) {
          const atual = res.data.find(c => c.id === workingCatalog.id);
          if (atual) {
            setWorkingCatalog({ ...workingCatalog, ambiente: atual.ambiente });
          }
        }
      } catch (err) {
        console.error('Erro ao carregar catálogos:', err);
      }
    }
    carregar();
    setSelectedId(workingCatalog ? String(workingCatalog.id) : '');
  }, [isOpen, workingCatalog, setWorkingCatalog]);

  const selecionar = (cat: CatalogoResumo | null) => {
    const selected: WorkingCatalog | null = cat
      ? {
          id: cat.id,
          numero: cat.numero,
          nome: cat.nome,
          cpf_cnpj: cat.cpf_cnpj,
          ambiente: cat.ambiente
        }
      : null;
    setWorkingCatalog(selected);
    onClose();
  };

  const handleConfirm = () => {
    const cat = selectedId ? catalogos.find(c => c.id === Number(selectedId)) || null : null;
    selecionar(cat);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1e2126] rounded-lg p-6 border border-gray-700 w-full max-w-md text-gray-300">
        <h3 className="text-xl font-semibold text-white mb-4">Selecionar Catálogo</h3>
        <select
          className="w-full mb-4 px-3 py-2 bg-[#1e2126] border border-gray-700 rounded text-gray-100 focus:outline-none focus:ring focus:border-blue-500"
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
        >
          <option value="">Todos os catálogos</option>
          {catalogos.map(cat => (
            <option key={cat.id} value={cat.id}>
              {cat.numero} - {cat.nome} ({cat.ambiente === 'PRODUCAO' ? 'Produção' : 'Homologação'})
            </option>
          ))}
        </select>

        {selectedId && (
          <div className="mb-4 rounded border border-gray-700 bg-[#151921] px-3 py-2 text-sm">
            {(() => {
              const cat = catalogos.find(c => c.id === Number(selectedId));
              if (!cat) return null;
              return (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-gray-300">Ambiente selecionado</span>
                    <span className="text-gray-200 font-medium">{cat.nome}</span>
                  </div>
                  <EnvironmentBadge ambiente={cat.ambiente} size="sm" />
                </div>
              );
            })()}
          </div>
        )}

        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>Selecionar</Button>
        </div>
      </div>
    </div>
  );
}
