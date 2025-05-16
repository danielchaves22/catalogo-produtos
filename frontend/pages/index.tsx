// frontend/pages/index.tsx
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Briefcase, BarChart2 } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { user } = useAuth();

  return (
    <DashboardLayout title="Bem-vindo ao Sistema">
      <div className="max-w-5xl mx-auto">
        {/* Card de informações do usuário */}
        <Card className="mb-8 bg-[#151921] overflow-hidden">
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-white">Informações do Usuário</h2>
            <div className="space-y-2">
              <p className="text-gray-300"><span className="font-medium text-white">Nome:</span> {user?.name}</p>
              <p className="text-gray-300"><span className="font-medium text-white">Email:</span> {user?.email}</p>
            </div>
          </div>
        </Card>
        
        {/* Card de acesso rápido */}
        <Card className="bg-[#151921] overflow-hidden">
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-6 text-white">Acesso Rápido</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <Link href="/produtos" className="block bg-white rounded-lg p-6 transition-transform hover:scale-[1.02]">
                <div className="flex items-center mb-2">
                  <Briefcase className="text-blue-600 mr-2" size={24} />
                  <h3 className="text-lg font-medium text-gray-800">Produtos</h3>
                </div>
                <p className="text-gray-600">Acesse o catálogo de produtos</p>
              </Link>
              
              <Link href="/relatorios" className="block bg-white rounded-lg p-6 transition-transform hover:scale-[1.02]">
                <div className="flex items-center mb-2">
                  <BarChart2 className="text-blue-600 mr-2" size={24} />
                  <h3 className="text-lg font-medium text-gray-800">Relatórios</h3>
                </div>
                <p className="text-gray-600">Visualize relatórios e estatísticas</p>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}