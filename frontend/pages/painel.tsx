// frontend/pages/painel.tsx
import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import api from '@/lib/api';
import { ListaProdutosPainel } from '@/components/dashboard/ListaProdutosPainel';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';

interface ResumoDashboard {
  catalogos: {
    total: number;
    porStatus: Record<string, number>; // Catálogos agrupados por status dos produtos
  };
  produtos: {
    total: number;
    porStatus: Record<string, number>;
  };
  atributos: {
    total: number;
    obrigatoriosPendentes: number;
    validosTransmissao: number;
  };
}

// Mapeamento de cores para cada status (mesmo padrão da listagem)
const STATUS_COLORS = {
  PENDENTE: '#e4a835',
  APROVADO: '#27f58a', 
  PROCESSANDO: '#4c82d3',
  TRANSMITIDO: '#4c82d3',
  ERRO: '#f2545f'
};

const STATUS_LABELS = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado', 
  PROCESSANDO: 'Processando',
  TRANSMITIDO: 'Transmitido',
  ERRO: 'Erro'
};

// Cores para atributos
const ATRIBUTOS_COLORS = {
  PENDENTES: '#e4a835',
  VALIDOS: '#27f58a',
  TOTAL: '#4c82d3'
};

const ATRIBUTOS_LABELS = {
  PENDENTES: 'Pendentes',
  VALIDOS: 'Válidos',
  TOTAL: 'Total de Atributos'
};

export default function PainelPage() {
  const [resumo, setResumo] = useState<ResumoDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverData, setHoverData] = useState<{ name: string; value: number } | null>(null);
  const { workingCatalog } = useWorkingCatalog();

  useEffect(() => {
    async function carregarResumo() {
      try {
        const params = workingCatalog?.id ? { catalogoId: workingCatalog.id } : undefined;
        const response = await api.get('/dashboard/resumo', { params });
        
        // Simular dados de catálogos e atributos até a API ser atualizada
        const resumoCompleto = {
          ...response.data,
          catalogos: {
            total: response.data.catalogos?.total || 0,
            porStatus: response.data.catalogos?.porStatus || {
              PENDENTE: 1,
              APROVADO: 0,
              PROCESSANDO: 0,
              TRANSMITIDO: 0,
              ERRO: 0
            }
          },
          atributos: response.data.atributos || {
            total: 50,
            obrigatoriosPendentes: 5,
            validosTransmissao: 45
          }
        };
        
        setResumo(resumoCompleto);
      } catch (error) {
        console.error('Erro ao carregar resumo do painel:', error);
      } finally {
        setLoading(false);
      }
    }

    carregarResumo();
  }, [workingCatalog]);

  // Preparar dados para o gráfico de rosca de produtos
  const dadosGraficoProdutos = React.useMemo(() => {
    if (!resumo?.produtos.porStatus) return [];
    
    return Object.entries(resumo.produtos.porStatus)
      .filter(([_, quantidade]) => quantidade > 0) // Só mostrar fatias com quantidade > 0
      .map(([status, quantidade]) => ({
        name: STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status,
        value: quantidade,
        status: status,
        color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] || '#gray'
      }));
  }, [resumo]);

  // Preparar dados para a legenda de produtos (todos os status)
  const dadosLegendaProdutos = React.useMemo(() => {
    if (!resumo?.produtos.porStatus) return [];
    
    // Garantir que todos os status apareçam na legenda
    const todosStatus = ['PENDENTE', 'APROVADO', 'PROCESSANDO', 'TRANSMITIDO', 'ERRO'];
    
    return todosStatus.map(status => ({
      name: STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status,
      value: resumo.produtos.porStatus[status] || 0,
      status: status,
      color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] || '#gray'
    }));
  }, [resumo]);

  // Preparar dados para o gráfico de rosca de catálogos
  const dadosGraficoCatalogos = React.useMemo(() => {
    if (!resumo?.catalogos.porStatus) return [];
    
    return Object.entries(resumo.catalogos.porStatus)
      .filter(([_, quantidade]) => quantidade > 0)
      .map(([status, quantidade]) => ({
        name: STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status,
        value: quantidade,
        status: status,
        color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] || '#gray'
      }));
  }, [resumo]);

  // Preparar dados para a legenda de catálogos (todos os status)
  const dadosLegendaCatalogos = React.useMemo(() => {
    if (!resumo?.catalogos.porStatus) return [];
    
    const todosStatus = ['PENDENTE', 'APROVADO', 'PROCESSANDO', 'TRANSMITIDO', 'ERRO'];
    
    return todosStatus.map(status => ({
      name: STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status,
      value: resumo.catalogos.porStatus[status] || 0,
      status: status,
      color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] || '#gray'
    }));
  }, [resumo]);

  // Preparar dados para o gráfico de atributos
  const dadosGraficoAtributos = React.useMemo(() => {
    if (!resumo?.atributos) return [];
    
    const dados = [
      {
        name: 'Pendentes',
        value: resumo.atributos.obrigatoriosPendentes,
        status: 'PENDENTES',
        color: ATRIBUTOS_COLORS.PENDENTES
      },
      {
        name: 'Válidos',
        value: resumo.atributos.validosTransmissao,
        status: 'VALIDOS',
        color: ATRIBUTOS_COLORS.VALIDOS
      }
    ];
    
    return dados.filter(item => item.value > 0);
  }, [resumo]);

  // Preparar dados para a legenda de atributos
  const dadosLegendaAtributos = React.useMemo(() => {
    if (!resumo?.atributos) return [];
    
    return [
      {
        name: 'Pendentes',
        value: resumo.atributos.obrigatoriosPendentes,
        status: 'PENDENTES',
        color: ATRIBUTOS_COLORS.PENDENTES
      },
      {
        name: 'Válidos',
        value: resumo.atributos.validosTransmissao,
        status: 'VALIDOS',
        color: ATRIBUTOS_COLORS.VALIDOS
      }
    ];
  }, [resumo]);

  // Componente para renderizar texto no centro do donut - produtos
  const renderCenterLabelProdutos = () => {
    if (!hoverData) return null;
    
    return (
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
        <tspan x="50%" dy="-0.5em" fontSize="14" fontWeight="bold" fill="#ffffff">
          {hoverData.value}
        </tspan>
        <tspan x="50%" dy="1.2em" fontSize="10" fill="#9ca3af">
          {hoverData.name}
        </tspan>
      </text>
    );
  };

  // Componente para renderizar texto no centro do donut - catálogos
  const renderCenterLabelCatalogos = () => {
    if (!hoverDataCatalogos) return null;
    
    return (
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
        <tspan x="50%" dy="-0.5em" fontSize="14" fontWeight="bold" fill="#ffffff">
          {hoverDataCatalogos.value}
        </tspan>
        <tspan x="50%" dy="1.2em" fontSize="10" fill="#9ca3af">
          {hoverDataCatalogos.name}
        </tspan>
      </text>
    );
  };

  // Componente para renderizar texto no centro do donut - atributos
  const renderCenterLabelAtributos = () => {
    if (!hoverDataAtributos) return null;
    
    return (
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
        <tspan x="50%" dy="-0.5em" fontSize="14" fontWeight="bold" fill="#ffffff">
          {hoverDataAtributos.value}
        </tspan>
        <tspan x="50%" dy="1.2em" fontSize="10" fill="#9ca3af">
          {hoverDataAtributos.name}
        </tspan>
      </text>
    );
  };

  // Handlers para mouse events - produtos
  const handleMouseEnterProdutos = (data: any) => {
    setHoverData({ name: data.name, value: data.value });
  };

  const handleMouseLeaveProdutos = () => {
    setHoverData(null);
  };

  // Handlers para mouse events - catálogos  
  const [hoverDataCatalogos, setHoverDataCatalogos] = useState<{ name: string; value: number } | null>(null);
  
  const handleMouseEnterCatalogos = (data: any) => {
    setHoverDataCatalogos({ name: data.name, value: data.value });
  };

  const handleMouseLeaveCatalogos = () => {
    setHoverDataCatalogos(null);
  };

  // Handlers para mouse events - atributos
  const [hoverDataAtributos, setHoverDataAtributos] = useState<{ name: string; value: number } | null>(null);
  
  const handleMouseEnterAtributos = (data: any) => {
    setHoverDataAtributos({ name: data.name, value: data.value });
  };

  const handleMouseLeaveAtributos = () => {
    setHoverDataAtributos(null);
  };

  return (
    <DashboardLayout title="Painel">
      {loading ? (
        <p className="text-gray-400">Carregando...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-3">
            {/* Card de Produtos com Gráfico de Rosca */}
            <Card headerTitle="Produtos">
              <div className="py-2">
                {resumo && resumo.produtos.total > 0 ? (
                  <div className="grid grid-cols-2 gap-4 items-center min-h-[120px]">
                    {/* Coluna da Esquerda - Total e Legendas */}
                    <div className="flex flex-col justify-center">
                      <div className="mb-2">
                        <p className="text-2xl font-bold text-white mb-1">
                          {resumo?.produtos.total ?? 0}
                        </p>
                        <p className="text-sm text-gray-400">Total de Produtos</p>
                      </div>
                      
                      {/* Legendas em lista vertical */}
                      <div className="space-y-1">
                        {dadosLegendaProdutos.map((item, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-gray-300 text-xs">
                              {item.name}: <span className="font-medium text-white">{item.value}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Coluna da Direita - Gráfico */}
                    <div className="flex items-center justify-center h-[120px]">
                      <div className="w-full h-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={dadosGraficoProdutos}
                              cx="50%"
                              cy="50%"
                              innerRadius={30}
                              outerRadius={55}
                              paddingAngle={2}
                              dataKey="value"
                              onMouseEnter={handleMouseEnterProdutos}
                              onMouseLeave={handleMouseLeaveProdutos}
                            >
                              {dadosGraficoProdutos.map((entry, index) => (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={entry.color}
                                />
                              ))}
                            </Pie>
                            {renderCenterLabelProdutos()}
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                    <p className="text-2xl font-bold text-white mb-2">
                      {resumo?.produtos.total ?? 0}
                    </p>
                    <p className="text-sm">Nenhum produto cadastrado</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Card de Catálogos com Gráfico de Rosca */}
            <Card headerTitle="Catálogos">
              <div className="py-2">
                {resumo && resumo.catalogos.total > 0 ? (
                  <div className="grid grid-cols-2 gap-4 items-center min-h-[120px]">
                    {/* Coluna da Esquerda - Total e Legendas */}
                    <div className="flex flex-col justify-center">
                      <div className="mb-2">
                        <p className="text-2xl font-bold text-white mb-1">
                          {resumo?.catalogos.total ?? 0}
                        </p>
                        <p className="text-sm text-gray-400">Total de Catálogos</p>
                      </div>
                      
                      {/* Legendas em lista vertical */}
                      <div className="space-y-1">
                        {dadosLegendaCatalogos.map((item, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-gray-300 text-xs">
                              {item.name}: <span className="font-medium text-white">{item.value}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Coluna da Direita - Gráfico */}
                    <div className="flex items-center justify-center h-[120px]">
                      <div className="w-full h-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={dadosGraficoCatalogos}
                              cx="50%"
                              cy="50%"
                              innerRadius={30}
                              outerRadius={55}
                              paddingAngle={2}
                              dataKey="value"
                              onMouseEnter={handleMouseEnterCatalogos}
                              onMouseLeave={handleMouseLeaveCatalogos}
                            >
                              {dadosGraficoCatalogos.map((entry, index) => (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={entry.color}
                                />
                              ))}
                            </Pie>
                            {renderCenterLabelCatalogos()}
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                    <p className="text-2xl font-bold text-white mb-2">
                      {resumo?.catalogos.total ?? 0}
                    </p>
                    <p className="text-sm">Nenhum catálogo cadastrado</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Card de Atributos com Gráfico de Rosca */}
            <Card headerTitle="Atributos">
              <div className="py-2">
                {resumo && resumo.atributos.total > 0 ? (
                  <div className="grid grid-cols-2 gap-4 items-center min-h-[120px]">
                    {/* Coluna da Esquerda - Total e Legendas */}
                    <div className="flex flex-col justify-center">
                      <div className="mb-2">
                        <p className="text-2xl font-bold text-white mb-1">
                          {resumo?.atributos.total ?? 0}
                        </p>
                        <p className="text-sm text-gray-400">Total de Atributos</p>
                      </div>
                      
                      {/* Legendas em lista vertical */}
                      <div className="space-y-1">
                        {dadosLegendaAtributos.map((item, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-gray-300 text-xs">
                              {item.name}: <span className="font-medium text-white">{item.value}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Coluna da Direita - Gráfico */}
                    <div className="flex items-center justify-center h-[120px]">
                      <div className="w-full h-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={dadosGraficoAtributos}
                              cx="50%"
                              cy="50%"
                              innerRadius={30}
                              outerRadius={55}
                              paddingAngle={2}
                              dataKey="value"
                              onMouseEnter={handleMouseEnterAtributos}
                              onMouseLeave={handleMouseLeaveAtributos}
                            >
                              {dadosGraficoAtributos.map((entry, index) => (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={entry.color}
                                />
                              ))}
                            </Pie>
                            {renderCenterLabelAtributos()}
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                    <p className="text-2xl font-bold text-white mb-2">
                      {resumo?.atributos.total ?? 0}
                    </p>
                    <p className="text-sm">Nenhum atributo cadastrado</p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <section className="bg-[#151921] rounded-lg border border-gray-700">
            <ListaProdutosPainel />
          </section>
        </>
      )}
    </DashboardLayout>
  );
}