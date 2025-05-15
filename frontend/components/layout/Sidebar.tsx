// frontend/components/layout/Sidebar.tsx
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  FileText, Calendar, Activity, PieChart, BarChart2, 
  Briefcase, Users, Tag, ChevronLeft, ChevronRight, User
} from 'lucide-react';

// Tipo para submenu - href é opcional para itens não clicáveis
type SubMenuItem = {
  label: string;
  href?: string;
  isHeader?: boolean; // Para identificar itens que atuam como cabeçalhos/separadores
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
  
  // Estado para controlar qual submenu está aberto
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  // Coordenadas do submenu
  const [submenuPosition, setSubmenuPosition] = useState({ top: 0 });

  // Salva o estado atual no localStorage sempre que mudar
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(collapsed));
  }, [collapsed]);

  const menuItems: SidebarItem[] = [
    {
      title: 'ANALISANDO',
      type: 'title',
    },
    {
      icon: <FileText size={20} />,
      label: 'Planilha',
      subItems: [
        { label: 'Planilha', href: '/planilha' },
      ],
    },
    {
      icon: <Activity size={20} />,
      label: 'Rastreador',
      subItems: [
        { label: 'Rastreador', href: '/rastreador' },
      ],
    },
    {
      icon: <Calendar size={20} />,
      label: 'Calendário',
      subItems: [
        { label: 'Calendário', href: '/calendario' },
      ],
    },
    {
      icon: <PieChart size={20} />,
      label: 'Painel',
      subItems: [
        { label: 'Painel', href: '/painel' },
      ],
    },
    {
      icon: <BarChart2 size={20} />,
      label: 'Relatórios',
      subItems: [
        { label: 'Relatórios', isHeader: true }, // Item de cabeçalho sem link
        { label: 'Resumido', href: '/relatorios/resumido' },
        { label: 'Detalhado', href: '/relatorios/detalhado' },
        { label: 'Semanal', href: '/relatorios/semanal' },
        { label: 'Compartilhado', href: '/relatorios/compartilhado' },
      ]
    },
    {
      title: 'GERENCIANDO',
      type: 'title',
    },
    {
      icon: <Briefcase size={20} />,
      label: 'Produtos',
      subItems: [
        { label: 'Produtos', href: '/produtos' },
      ],
    },
    {
      icon: <Users size={20} />,
      label: 'Equipe',
      subItems: [
        { label: 'Equipe', isHeader: true }, // Item de cabeçalho sem link
        { label: 'Presença', href: '/equipe/presenca' },
        { label: 'Atribuições', href: '/equipe/atribuicoes' },
      ]
    },
    {
      icon: <Users size={20} />,
      label: 'Clientes',
      subItems: [
        { label: 'Clientes', href: '/clientes' },
      ],
    },
    {
      icon: <Tag size={20} />,
      label: 'Etiquetas',
      subItems: [
        { label: 'Etiquetas', href: '/etiquetas' },
      ],
    },
    {
      icon: <User size={20} />,
      label: 'Perfil',
      subItems: [
        { label: 'Perfil', href: '/perfil' },
      ],
    },
  ];

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
    if (collapsed) {
      // Pega a posição do elemento para posicionar o submenu
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      setSubmenuPosition({ top: rect.top });
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
        className={`h-[calc(100vh-60px)] bg-[#1e2126] text-gray-300 flex flex-col transition-all duration-300 fixed z-30 top-[60px] left-0 ${
          collapsed ? 'w-16' : 'w-52'
        }`}
        style={{ marginTop: "-1px" }}
      >
        {/* Botão de toggle no centro da borda direita */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-1/2 transform -translate-y-1/2 bg-[#1e2126] rounded-full p-1 text-gray-300 z-10"
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
              return (
                <div key={index} className={`px-4 py-2 text-xs text-gray-500 ${collapsed ? 'hidden' : ''}`}>
                  {item.title}
                </div>
              );
            }

            const menuItem = item as MenuItem;
            const hasMultipleSubItems = hasMultipleClickableSubItems(menuItem);
            const firstClickableSubItem = getFirstClickableSubItem(menuItem);
            const href = firstClickableSubItem?.href || '#';
            
            // Verificar se algum dos subitens corresponde à rota atual
            const isActive = menuItem.subItems.some(
              subItem => subItem.href && router.pathname === subItem.href
            );

            return (
              <div key={index}>
                {collapsed ? (
                  <div 
                    className={`cursor-pointer px-4 py-3 ${
                      isActive ? 'bg-[#f59e0b] text-white' : 'text-gray-300 hover:bg-gray-700'
                    } flex justify-center items-center`}
                    onMouseEnter={(e) => handleMouseEnter(menuItem, e)}
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
                        isActive ? 'bg-[#f59e0b] text-white font-medium' : 'hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center">
                        <span className="mr-3">{menuItem.icon}</span>
                        <span>{menuItem.label}</span>
                      </div>
                      
                      {hasMultipleSubItems && <ChevronRight size={16} className="ml-2" />}
                    </Link>

                    {/* Submenu para modo expandido - apenas para itens com múltiplos subitens */}
                    {hasMultipleSubItems && (
                      <div className={`pl-10 bg-[#181c24] overflow-hidden transition-all duration-200 ${
                        isActive ? 'max-h-64' : 'max-h-0'
                      }`}>
                        {menuItem.subItems.map((subItem, subIndex) => (
                          subItem.href ? (
                            <Link
                              key={subIndex}
                              href={subItem.href}
                              className={`block py-2 pl-2 pr-4 hover:bg-gray-700 text-sm ${
                                router.pathname === subItem.href ? 'text-[#f59e0b]' : 'text-gray-400'
                              }`}
                            >
                              {subItem.label}
                            </Link>
                          ) : (
                            <div 
                              key={subIndex}
                              className="block py-2 pl-2 pr-4 text-sm text-gray-600 font-medium"
                            >
                              {subItem.label}
                            </div>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Submenu flutuante para modo colapsado */}
      {collapsed && activeMenu && (
        <div 
          className="fixed bg-[#262b36] border border-gray-700 rounded shadow-lg z-50"
          style={{ 
            left: '64px', // 16px (largura do sidebar) + pequeno espaço
            top: submenuPosition.top, 
            minWidth: '200px',
            display: 'block'
          }}
          onMouseEnter={() => setActiveSubmenu(activeMenu.label)}
          onMouseLeave={handleMouseLeave}
        >
          <div className="py-2 px-3 border-b border-gray-700 text-white font-medium">
            {activeMenu.label}
          </div>
          <div className="py-1">
            {activeMenu.subItems.map((subItem, index) => (
              subItem.href ? (
                <Link
                  key={index}
                  href={subItem.href}
                  className="block px-4 py-2 hover:bg-gray-700 text-gray-300 text-sm whitespace-nowrap"
                >
                  {subItem.label}
                </Link>
              ) : (
                <div 
                  key={index}
                  className="block px-4 py-2 text-gray-600 text-sm font-medium whitespace-nowrap"
                >
                  {subItem.label}
                </div>
              )
            ))}
          </div>
        </div>
      )}
    </>
  );
}