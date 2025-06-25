// frontend/pages/produtos.tsx
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Search, Plus } from 'lucide-react';
import Link from 'next/link';

export default function ProdutosPage() {
  return (
    <DashboardLayout title="Produtos">
      {/* Campo de busca */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search size={18} className="text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar produtos..."
            className="pl-10 pr-4 py-2 w-full bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-700"
          />
        </div>
      </div>
      
      {/* Card para a área principal - estado vazio */}
      <div className="rounded-xl overflow-hidden bg-[#151921] border border-gray-700">
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="rounded-full bg-white p-8 mb-6">
            <Search size={40} className="text-gray-400" />
          </div>
          
          <h3 className="text-xl font-medium text-white mb-2">Nenhum produto encontrado</h3>
          <p className="text-gray-400 mb-8">Adicione seus primeiros produtos ao catálogo</p>
          
          <Link
            href="/produtos/novo"
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            <Plus size={18} />
            <span>Adicionar Produto</span>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}