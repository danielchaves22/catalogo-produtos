import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useWorkingCatalog, WorkingCatalog } from '@/contexts/WorkingCatalogContext';

interface CatalogoResumo {
  id: number;
  numero: number;
  nome: string;
  cpf_cnpj?: string | null;
}

interface WorkingCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WorkingCatalogModal({ isOpen, onClose }: WorkingCatalogModalProps) {
  const { workingCatalog, setWorkingCatalog } = useWorkingCatalog();
  const [catalogos, setCatalogos] = useState<CatalogoResumo[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    async function carregar() {
      try {
        const res = await api.get('/catalogos');
        setCatalogos(res.data);
      } catch (err) {
        console.error('Erro ao carregar catálogos:', err);
      }
    }
    carregar();
  }, [isOpen]);

  const selecionar = (cat: CatalogoResumo | null) => {
    const selected: WorkingCatalog | null = cat
      ? { id: cat.id, numero: cat.numero, nome: cat.nome, cpf_cnpj: cat.cpf_cnpj }
      : null;
    setWorkingCatalog(selected);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#151921] rounded-lg p-6 border border-gray-700 w-full max-w-md">
        <h3 className="text-xl font-semibold text-white mb-4">Selecionar Catálogo</h3>
        <ul className="max-h-60 overflow-y-auto mb-4">
          <li className="mb-2">
            <button
              className={`w-full text-left px-3 py-2 rounded hover:bg-[#262b36] ${!workingCatalog ? 'bg-[#262b36]' : ''}`}
              onClick={() => selecionar(null)}
            >
              Todos os catálogos
            </button>
          </li>
          {catalogos.map(cat => (
            <li key={cat.id} className="mb-2">
              <button
                className={`w-full text-left px-3 py-2 rounded hover:bg-[#262b36] ${
                  workingCatalog?.id === cat.id ? 'bg-[#262b36]' : ''
                }`}
                onClick={() => selecionar(cat)}
              >
                {cat.numero} - {cat.nome}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
