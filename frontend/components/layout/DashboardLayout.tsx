// frontend/components/layout/DashboardLayout.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { User } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function DashboardLayout({ children, title = 'Dashboard' }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  
  // Obtém o estado salvo no localStorage ou usa o padrão
  const getSavedCollapsedState = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebarCollapsed');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  };
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getSavedCollapsedState);

  // Esta função será passada para o Sidebar para atualizar o estado aqui
  const handleSidebarToggle = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebarCollapsed', JSON.stringify(collapsed));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f4f5f7]">
      {/* Top Navigation com uma borda sutil */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#1e2126] text-white py-3 px-6 flex justify-between items-center h-[60px] border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <Image
            src="/assets/images/logo_principal.png"
            alt="COMEXDEZ"
            width={100}
            height={50}
            priority
            className="h-6 w-auto"
          />
          <span className="text-white text-lg font-bold font-heading">Catálogo de Produtos</span>
        </div>

        <div className="flex items-center space-x-3">
          {/* Botão ATUALIZAR removido */}
          <div className="relative group">
            <button className="flex items-center space-x-1">
              <div className="bg-[#f59e0b] rounded-full p-1">
                <User size={18} className="text-white" />
              </div>
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-white shadow-lg rounded-md invisible group-hover:visible z-10">
              <div className="p-3 border-b">
                <p className="font-medium">{user?.name}</p>
                <p className="text-sm text-gray-500">{user?.email}</p>
              </div>
              <div className="p-2">
                <button 
                  onClick={() => router.push('/perfil')}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                >
                  Meu Perfil
                </button>
                <button 
                  onClick={logout}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-100 rounded"
                >
                  Sair
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content with Sidebar - Abaixo da barra de navegação fixa */}
      <div className="flex h-full pt-[60px]"> {/* Padding top para compensar a altura da navbar fixa */}
        <Sidebar onToggle={handleSidebarToggle} isCollapsed={sidebarCollapsed} />
        
        {/* Conteúdo principal com margem esquerda para não ficar escondido pelo sidebar */}
        <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
          sidebarCollapsed ? 'ml-16' : 'ml-52'
        }`}>
          {/* Page Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <h1 className="text-xl font-medium text-gray-800">{title}</h1>
          </div>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto p-6 bg-[#f4f5f7]">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}