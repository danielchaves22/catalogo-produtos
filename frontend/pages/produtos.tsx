// frontend/pages/produtos.tsx
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Search, Plus } from 'lucide-react';

export default function ProdutosPage() {
  return (
    <DashboardLayout title="Produtos">
      <div className="mb-6 flex justify-between items-center">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search size={18} className="text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar produtos..."
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <Button variant="primary" className="flex items-center space-x-2">
          <Plus size={16} />
          <span>Novo Produto</span>
        </Button>
      </div>
      
      <Card className="overflow-hidden">
        <div className="p-8 text-center text-gray-500">
          <div className="flex justify-center mb-4">
            <div className="bg-gray-100 p-4 rounded-full">
              <Search size={32} className="text-gray-400" />
            </div>
          </div>
          <h3 className="text-lg font-medium text-gray-700 mb-2">Nenhum produto encontrado</h3>
          <p className="mb-4">Adicione seus primeiros produtos ao catálogo</p>
          <Button variant="primary" className="flex items-center space-x-2 mx-auto">
            <Plus size={16} />
            <span>Adicionar Produto</span>
          </Button>
        </div>
      </Card>
    </DashboardLayout>
  );
}
