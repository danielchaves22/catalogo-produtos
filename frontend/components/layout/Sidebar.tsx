// frontend/components/layout/Sidebar.tsx
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  FileText, PieChart, Briefcase, Users,
  ChevronLeft, ChevronRight, User, Key, UserCog, Mail, MoreHorizontal, Send
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// Tipo para submenu - href é opcional para itens não clicáveis
type SubMenuItem = {
  label: string;
  href?: string;
  isHeader?: boolean; // Para identificar itens que atuam como categorias
  hideWhenExpanded?: boolean; // Controla visibilidade no modo expandido
};

// Tipo para item de menu
type MenuItem = {
  icon: React.ReactNode;
  label: string;
  subItems: SubMenuItem[]; // Todos terão pelo menos um subitem
};

// Tipo para título de seção
type SectionTitle = {
  title: string;
  type: 'title';
};

type SidebarItem = MenuItem | SectionTitle;

interface SidebarProps {
  onToggle?: (collapsed: boolean) => void;
  isCollapsed?: boolean; 
}

export function Sidebar({ onToggle, isCollapsed }: SidebarProps) {
  // Obtém o estado salvo no localStorage ou usa o padrão
  const getSavedCollapsedState = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebarCollapsed');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  };
  
  // Se isCollapsed for fornecido, use-o; caso contrário, gerencia o estado internamente
  const [internalCollapsed, setInternalCollapsed] = useState(getSavedCollapsedState);
  const collapsed = isCollapsed !== undefined ? isCollapsed : internalCollapsed;
  
  const router = useRouter();
  
  // Estado para controlar qual submenu está aberto (para flutuante)
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  // Coordenadas do submenu flutuante
  const [submenuPosition, setSubmenuPosition] = useState({ top: 0, left: 0 });

  // Salva o estado atual no localStorage sempre que mudar
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(collapsed));
  }, [collapsed]);

  const { user } = useAuth();

  // Menu com páginas existentes - Dashboard aponta para /
  const menuItems: SidebarItem[] = [
    {
      icon: <PieChart size={20} />,
      label: 'Painel',
      subItems: [
        { label: 'Painel', href: '/', hideWhenExpanded: true },
      ],
    },
    {
      icon: <FileText size={20} />,
      label: 'Catálogos',
      subItems: [
        { label: 'Catálogos', href: '/catalogos', hideWhenExpanded: true  },
      ],
    },
    {
      icon: <Users size={20} />,
      label: 'Operadores Estrangeiros',
      subItems: [
        { label: 'Operadores Estrangeiros', href: '/operadores-estrangeiros', hideWhenExpanded: true  },
      ],
    },
    {
      icon: <Briefcase size={20} />,
      label: 'Produtos',
      subItems: [
        { label: 'Produtos', href: '/produtos', hideWhenExpanded: true  },
      ],
    },
    {
      icon: <Key size={20} />,
      label: 'Certificados',
      subItems: [
        { label: 'Certificados', href: '/certificados', hideWhenExpanded: true  },
      ],
    },
    {
      icon: <MoreHorizontal size={20} />,
      label: 'Automação',
      subItems: [
        { label: 'Automação', hideWhenExpanded: true },
        { label: 'Processos Assíncronos', href: '/automacao/processos' },
        { label: 'Importar Produto', href: '/automacao/importar-produto' },
        { label: 'Definir Valor de Atributo Padrão', href: '/automacao/valores-padrao' },
        { label: 'Preencher Atributos em Massa', href: '/automacao/atributos-massa' },
        // { label: 'Ajuste de Produtos em Massa', href: '/automacao/ajuste-de-produtos-em-massa' },
      ],
    },
    {
      icon: <Send size={20} />,
      label: 'Transmissões ao SISCOMEX',
      subItems: [
        { label: 'Transmissões ao SISCOMEX', href: '/automacao/transmissoes-siscomex', hideWhenExpanded: true },
      ],
    },
  ];

  if (user?.role === 'SUPER') {
    menuItems.push({
      icon: <UserCog size={20} />,
      label: 'Usuários',
      subItems: [
        { label: 'Usuários', href: '/usuarios', hideWhenExpanded: true  },
      ],
    });
  }

  menuItems.push(    {
      icon: <Mail size={20} />,
      label: 'Mensagens',
      subItems: [
        { label: 'Mensagens', href: '/mensagens', hideWhenExpanded: true  },
      ],
    });

  const toggleSidebar = () => {
    const newCollapsedState = !collapsed;
    
    // Se estamos controlando internamente, atualize o estado
    if (isCollapsed === undefined) {
      setInternalCollapsed(newCollapsedState);
    }
    
    // Notifica o componente pai (DashboardLayout) sobre a mudança
    if (onToggle) {
      onToggle(newCollapsedState);
    }

    // Fecha qualquer submenu aberto
    setActiveSubmenu(null);
  };

  const handleMouseEnter = (item: MenuItem, event: React.MouseEvent) => {
    // No modo colapsado, sempre mostrar o submenu flutuante
    // No modo expandido, mostrar quando houver ao menos um subitem visível (não hiddenWhenExpanded)
    const hasVisibleExpandedSubItems = item.subItems.some(subItem => !subItem.hideWhenExpanded);
    if (collapsed || hasVisibleExpandedSubItems) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();

      // Posição diferente dependendo do modo
      setSubmenuPosition({
        top: rect.top,
        left: collapsed ? 64 : 208 // 16px ou 52px + um espaço
      });

      setActiveSubmenu(item.label);
    }
  };

  const handleMouseLeave = () => {
    setActiveSubmenu(null);
  };

  // Verifica se um item tem mais de um subitem clicável (com href)
  const hasMultipleClickableSubItems = (item: MenuItem) => {
    return item.subItems.filter(subItem => subItem.href).length > 1;
  };

  // Obtém o primeiro subitem clicável
  const getFirstClickableSubItem = (item: MenuItem) => {
    return item.subItems.find(subItem => subItem.href);
  };

  // Determina qual item de menu está ativo
  const getActiveMenuItem = () => {
    if (!activeSubmenu) return null;
    
    return menuItems.find(item => 
      !('type' in item) && item.label === activeSubmenu
    ) as MenuItem | null;
  };

  const activeMenu = getActiveMenuItem();

  return (
    <>
      <div
        className={`h-[calc(100vh-60px)] bg-[#151921] text-gray-300 flex flex-col transition-all duration-300 fixed z-30 top-[60px] left-0 ${
          collapsed ? 'w-16' : 'w-52'
        }`}
        style={{ marginTop: "-1px" }}
      >
        {/* Botão de toggle no centro da borda direita */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-1/2 transform -translate-y-1/2 bg-[#151921] rounded-full p-1 text-gray-300 z-10"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronLeft size={16} />
          )}
        </button>

        <div className="flex-1 overflow-y-auto">
          {menuItems.map((item, index) => {
            if ('type' in item && item.type === 'title') {
              return null;
            }

            const menuItem = item as MenuItem;
            const hasMultipleSubItems = hasMultipleClickableSubItems(menuItem);
            // Verifica se existem subitens visíveis no modo expandido (não hiddenWhenExpanded)
            const hasVisibleExpandedSubItems = menuItem.subItems.some(subItem => !subItem.hideWhenExpanded);
            const firstClickableSubItem = getFirstClickableSubItem(menuItem);
            const href = firstClickableSubItem?.href || '#';
            
            // Verificar se algum dos subitens corresponde à rota atual
            const isActive = menuItem.subItems.some(subItem => {
              if (!subItem.href) return false;
              
              // Verifica rota exata
              if (router.pathname === subItem.href) return true;
              
              // Verifica se é uma sub-rota (ex: /operadores-estrangeiros/novo)
              if (subItem.href !== '/' && router.pathname.startsWith(subItem.href + '/')) {
                return true;
              }
              
              return false;
            });

            return (
              <div key={index}>
                {collapsed ? (
                  <div 
                    className={`cursor-pointer px-4 py-3 ${
                      isActive ? 'bg-[#f59e0b] text-white' : 'text-gray-300 hover:bg-[#1e2126]'
                    } flex justify-center items-center`}
                    onMouseEnter={(e) => handleMouseEnter(menuItem, e)}
                    onMouseLeave={handleMouseLeave}
                    onClick={() => {
                      if (href && href !== '#') {
                        router.push(href);
                      }
                    }}
                  >
                    {menuItem.icon}
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <Link
                      href={href}
                      className={`flex items-center justify-between px-4 py-3 ${
                        isActive ? 'bg-[#f59e0b] text-white font-medium' : 'hover:bg-[#1e2126]'
                      }`}
                      onMouseEnter={(e) => handleMouseEnter(menuItem, e)}
                      onMouseLeave={handleMouseLeave}
                    >
                      <div className="flex items-center">
                        <span className="mr-3">{menuItem.icon}</span>
                        <span>{menuItem.label}</span>
                      </div>
                      
                      {(hasVisibleExpandedSubItems) && <ChevronRight size={16} className="ml-2" />}
                    </Link>

                    {/* Submenu inline removido: manter apenas o flutuante no hover */}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Submenu flutuante - para todos os itens no modo colapsado ou apenas múltiplos subitens no expandido */}
      {activeMenu && (
        <div 
          className="fixed bg-[#1e2126] border border-gray-700 rounded shadow-lg z-50 transition-opacity duration-200 ease-in-out opacity-100"
          style={{ 
            left: `${submenuPosition.left}px`,
            top: submenuPosition.top, 
            minWidth: '200px',
            display: 'block'
          }}
          onMouseEnter={() => setActiveSubmenu(activeMenu.label)}
          onMouseLeave={handleMouseLeave}
        >
          <div className="py-1">
            {(activeMenu.subItems
              // No expandido, esconder itens marcados com hideWhenExpanded; no colapsado, mostrar todos
              .filter(subItem => collapsed || !subItem.hideWhenExpanded)
            ).map((subItem, index) => {
              // Determina se deve renderizar como categoria de destaque
              const isSingleItem = activeMenu.subItems.length === 1;
              const renderAsCategory = !subItem.href || isSingleItem;
              
              return renderAsCategory ? (
                <div 
                  key={index}
                  className="block px-4 py-2 text-gray-300 whitespace-nowrap"
                  onClick={() => {
                    if (subItem.href) {
                      router.push(subItem.href);
                    }
                  }}
                  style={{ cursor: subItem.href ? 'pointer' : 'default' }}
                >
                  {subItem.label}
                </div>
              ) : (
                <Link
                  key={index}
                  href={subItem.href || '#'}
                  className="block px-4 py-2 hover:bg-[#262b36] text-gray-300 text-sm whitespace-nowrap"
                >
                  {subItem.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
