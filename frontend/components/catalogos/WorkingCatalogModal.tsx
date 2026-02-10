import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useWorkingCatalog, WorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { formatCPFOrCNPJ } from '@/lib/validation';

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
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    async function carregar() {
      try {
        const res = await api.get<CatalogoResumo[]>('/catalogos');
        setCatalogos(res.data);
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
              {cat.nome}
              {cat.cpf_cnpj ? ` • ${formatCPFOrCNPJ(cat.cpf_cnpj)}` : ''}
            </option>
          ))}
        </select>

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
