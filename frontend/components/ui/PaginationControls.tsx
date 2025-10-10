import React from 'react';
import { Button } from './Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  loading?: boolean;
  displayLabel?: string;
}

export function PaginationControls({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  loading = false,
  displayLabel
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(pageSize, 1)));
  const paginaAtual = Math.min(page, totalPages);
  const podeVoltar = paginaAtual > 1;
  const podeAvancar = paginaAtual < totalPages;

  const handlePageSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!onPageSizeChange) return;
    const novoTamanho = Number(event.target.value);
    onPageSizeChange(novoTamanho);
  };

  return (
    <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      {onPageSizeChange && pageSizeOptions && pageSizeOptions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="pageSize" className="text-sm text-gray-400">
            Itens por página
          </label>
          <select
            id="pageSize"
            className="bg-[#1e2126] border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring focus:border-blue-500"
            value={pageSize}
            onChange={handlePageSizeChange}
          >
            {pageSizeOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {displayLabel && (
            <span className="text-sm text-gray-400 whitespace-nowrap">
              {displayLabel}
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-end">
          {displayLabel && (
            <span className="text-sm text-gray-400 whitespace-nowrap">
              {displayLabel}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="inline-flex items-center gap-2"
          onClick={() => onPageChange(Math.max(1, paginaAtual - 1))}
          disabled={!podeVoltar || loading}
        >
          <ChevronLeft size={16} />
          <span>Anterior</span>
        </Button>
        <span className="text-sm text-gray-400">
          Página {paginaAtual} de {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="inline-flex items-center gap-2"
          onClick={() => onPageChange(paginaAtual + 1)}
          disabled={!podeAvancar || loading}
        >
          <span>Próxima</span>
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
