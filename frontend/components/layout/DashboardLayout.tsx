// frontend/components/layout/DashboardLayout.tsx - CORREÇÃO
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { User, RefreshCcw } from 'lucide-react';
import { EnvironmentBadge } from '@/components/ui/EnvironmentBadge';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { WorkingCatalogModal } from '@/components/catalogos/WorkingCatalogModal';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function DashboardLayout({ children, title = 'Dashboard' }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { workingCatalog } = useWorkingCatalog();
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  
  // Estado para controlar a visibilidade do menu do usuário
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  
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

  // Efeito para detectar cliques fora do menu do usuário
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    // Adiciona o listener quando o menu está aberto
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // Cleanup
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen]);

  // Função para alternar o menu do usuário
  const toggleUserMenu = () => {
    setUserMenuOpen(!userMenuOpen);
  };

  // Função para fechar o menu e executar ação
  const handleMenuAction = (action: () => void) => {
    setUserMenuOpen(false);
    action();
  };

  return (
    <div className="flex flex-col h-screen bg-[#1e2126]">
      {/* Top Navigation com uma borda sutil */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#151921] text-white py-3 px-6 flex justify-between items-center h-[60px] border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <Link href="/" className="flex items-center space-x-2 hover:opacity-90">
            <Image
              src="/assets/images/logo_principal.png"
              alt="COMEXDEZ"
              width={100}
              height={50}
              priority
            />
            <span className="text-white text-lg font-bold font-heading">Catálogo de Produtos</span>
          </Link>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-300 mr-1">
            {workingCatalog ? `${workingCatalog.numero} - ${workingCatalog.nome}` : 'Todos os catálogos'}
          </span>
          <button
            className="p-1 rounded hover:bg-[#262b36] text-gray-300 hover:text-white"
            onClick={() => setCatalogModalOpen(true)}
            title="Trocar catálogo de trabalho"
            aria-label="Trocar catálogo de trabalho"
          >
            <RefreshCcw size={16} />
          </button>

          <div className="relative" ref={userMenuRef}>
            <button 
              onClick={toggleUserMenu}
              className="flex items-center space-x-1 focus:outline-none"
            >
              <div className="bg-[#f59e0b] rounded-full p-1">
                <User size={18} className="text-white" />
              </div>
            </button>
            
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-[#1e2126] shadow-lg rounded-md z-10 border border-gray-700 animate-fadeIn">
                <div className="p-3 border-b border-gray-700">
                  <p className="font-medium text-white">{user?.name}</p>
                  <p className="text-sm text-gray-400">{user?.email}</p>
                </div>
                <div className="p-2">
                  <button 
                    onClick={() => handleMenuAction(() => router.push('/perfil'))}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[#262b36] rounded text-gray-300"
                  >
                    Meu Perfil
                  </button>
                  <button 
                    onClick={() => handleMenuAction(logout)}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-[#262b36] rounded"
                  >
                    Sair
                  </button>
                </div>
              </div>
            )}
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
          {/* REMOVIDO: Page Header que exibia o título redundante */}
          {/* 
          <div className="bg-[#1e2126] border-b border-gray-700 px-6 py-4">
            <h1 className="text-xl font-medium text-gray-100">{title}</h1>
          </div>
          */}

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto p-6 bg-[#1e2126] text-gray-300">
            {children}
          </main>
        </div>
      </div>
      <WorkingCatalogModal
        isOpen={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
      />
    </div>
  );
}