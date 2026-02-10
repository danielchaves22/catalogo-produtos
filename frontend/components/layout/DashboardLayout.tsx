// frontend/components/layout/DashboardLayout.tsx - CORREÇÃO
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { User, RefreshCcw, Bell, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { WorkingCatalogModal } from '@/components/catalogos/WorkingCatalogModal';
import { useMessages } from '@/contexts/MessagesContext';
import { formatCPFOrCNPJ } from '@/lib/validation';
import api from '@/lib/api';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function DashboardLayout({ children, title = 'Dashboard' }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { workingCatalog } = useWorkingCatalog();
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [pendenciasAjuste, setPendenciasAjuste] = useState<number | null>(null);

  const catalogLabel = useMemo(() => {
    if (!workingCatalog) {
      return 'Todos os catálogos';
    }

    const partes: string[] = [workingCatalog.nome];
    const cnpjFormatado = formatCPFOrCNPJ(workingCatalog.cpf_cnpj || '');

    if (cnpjFormatado) {
      partes.push(cnpjFormatado);
    }

    return partes.join(' • ');
  }, [workingCatalog]);
  
  // Estado para controlar a visibilidade do menu do usuário
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [messagesMenuOpen, setMessagesMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const messagesMenuRef = useRef<HTMLDivElement>(null);
  const { unreadMessages, unreadCount, markAsRead, refreshUnread } = useMessages();
  
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
      const target = event.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
      if (messagesMenuRef.current && !messagesMenuRef.current.contains(target)) {
        setMessagesMenuOpen(false);
      }
    };

    if (userMenuOpen || messagesMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen, messagesMenuOpen]);

  // Função para alternar o menu do usuário
  const toggleUserMenu = () => {
    setUserMenuOpen((prev) => {
      const novoEstado = !prev;
      if (novoEstado) {
        setMessagesMenuOpen(false);
      }
      return novoEstado;
    });
  };

  const toggleMessagesMenu = () => {
    const novoEstado = !messagesMenuOpen;
    setMessagesMenuOpen(novoEstado);
    if (novoEstado) {
      setUserMenuOpen(false);
    }
    if (novoEstado) {
      refreshUnread();
    }
  };

  const carregarPendenciasAjuste = useCallback(async () => {
    try {
      const resposta = await api.get<{ total: number }>('/produtos/pendencias/ajuste-estrutura');
      setPendenciasAjuste(resposta.data.total ?? 0);
    } catch (error) {
      console.error('Erro ao carregar pendências de ajuste de estrutura', error);
      setPendenciasAjuste(0);
    }
  }, []);

  useEffect(() => {
    carregarPendenciasAjuste();
    const interval = setInterval(carregarPendenciasAjuste, 60000);
    return () => clearInterval(interval);
  }, [carregarPendenciasAjuste]);

  const handleMessageClick = async (mensagemId: number) => {
    try {
      await markAsRead(mensagemId);
    } finally {
      setMessagesMenuOpen(false);
      router.push({
        pathname: '/mensagens',
        query: { mensagem: mensagemId },
      });
    }
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
          <div className="flex items-center text-sm text-gray-300 space-x-2 mr-1">
            <span className="text-gray-400">Catálogo de trabalho:</span>
            <span className="text-gray-100">{catalogLabel}</span>
          </div>
          <button
            className="p-1 rounded hover:bg-[#262b36] text-gray-300 hover:text-white"
            onClick={() => setCatalogModalOpen(true)}
            title="Trocar catálogo de trabalho"
            aria-label="Trocar catálogo de trabalho"
          >
            <RefreshCcw size={16} />
          </button>

          <div className="relative" ref={messagesMenuRef}>
            <button
              onClick={toggleMessagesMenu}
              className={`relative p-1 rounded hover:bg-[#262b36] ${
                unreadCount > 0 ? 'text-[#f59e0b]' : 'text-gray-300 hover:text-white'
              }`}
              aria-label="Mensagens"
              title={unreadCount > 0 ? `${unreadCount} mensagem(ns) não lida(s)` : 'Mensagens'}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#f59e0b] text-xs font-semibold text-black rounded-full px-1 min-w-[18px] text-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

          {messagesMenuOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-[#1e2126] shadow-lg rounded-md z-20 border border-gray-700">
              <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-200">Mensagens não lidas</span>
                <span className="text-xs text-gray-400">{unreadCount} no total</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {unreadMessages.length === 0 ? (
                    <p className="text-sm text-gray-400 px-4 py-3">
                      Nenhuma mensagem não lida no momento.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-700">
                      {unreadMessages.map((mensagem) => (
                        <li key={mensagem.id}>
                          <button
                            onClick={() => handleMessageClick(mensagem.id)}
                            className="w-full text-left px-4 py-3 hover:bg-[#262b36]"
                          >
                            <p className="text-sm font-semibold text-gray-200 truncate">
                              {mensagem.titulo}
                            </p>
                            <p className="text-xs text-gray-400 truncate mt-1">
                              {new Date(mensagem.criadaEm).toLocaleString('pt-BR')}
                            </p>
                            <p className="text-xs text-gray-400 truncate mt-1">
                              {mensagem.conteudo}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="px-4 py-2 border-t border-gray-700 text-right">
                  <button
                    onClick={() => {
                      setMessagesMenuOpen(false);
                      router.push('/mensagens');
                    }}
                    className="text-sm text-[#f59e0b] hover:text-[#f97316]"
                  >
                    Ver todas as mensagens
                  </button>
              </div>
            </div>
          )}
        </div>

          <button
            onClick={() => router.push('/ajustes-estrutura')}
            className={`p-1 rounded transition ${
              (pendenciasAjuste ?? 0) > 0
                ? 'text-[#ef4444] hover:bg-[#2b1f1f]'
                : 'text-[#22c55e] hover:bg-[#1f2b20]'
            }`}
            title={
              (pendenciasAjuste ?? 0) > 0
                ? `${pendenciasAjuste} produto(s) aguardando ajuste de estrutura`
                : 'Nenhuma pendência de ajuste de estrutura'
            }
            aria-label="Ajustes de estrutura"
          >
            {(pendenciasAjuste ?? 0) > 0 ? (
              <AlertCircle size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}
          </button>

          {user?.catprodAdmFull && (
            <span className="uppercase text-[11px] font-semibold bg-red-600 text-white px-2 py-1 rounded-md shadow-sm">
              Admin
            </span>
          )}

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
