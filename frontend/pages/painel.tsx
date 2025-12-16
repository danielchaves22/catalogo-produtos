// frontend/pages/painel.tsx
import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import api from '@/lib/api';
import { ListaProdutosPainel } from '@/components/dashboard/ListaProdutosPainel';
import { useWorkingCatalog } from '@/contexts/WorkingCatalogContext';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface StatusResumo {
  status: 'PENDENTE' | 'APROVADO' | 'PROCESSANDO' | 'TRANSMITIDO' | 'ERRO' | 'AJUSTAR_ESTRUTURA';
  total: number;
}

interface ResumoDashboard {
  catalogos: {
    total: number;
    porStatus: StatusResumo[];
  };
  produtos: {
    total: number;
    porStatus: StatusResumo[];
  };
  atributos: {
    total: number;
    obrigatoriosPendentes: number;
    validosTransmissao: number;
  };
}

// Mapeamento de cores para cada status (mesmo padrão da listagem)
const STATUS_COLORS = {
  PENDENTE: '#ff9900',
  APROVADO: '#01aa4d',
  PROCESSANDO: '#4c82d3',
  TRANSMITIDO: '#5e17eb',
  ERRO: '#ff5757',
  AJUSTAR_ESTRUTURA: '#ff5757'
};

const STATUS_LABELS = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  PROCESSANDO: 'Processando',
  TRANSMITIDO: 'Transmitido',
  ERRO: 'Erro',
  AJUSTAR_ESTRUTURA: 'Ajustar Estrutura'
};

// Cores para atributos
const ATRIBUTOS_COLORS = {
  PENDENTES: '#ff9900',
  VALIDOS: '#01aa4d',
  TOTAL: '#4c82d3'
};

const ATRIBUTOS_LABELS = {
  PENDENTES: 'Pendentes',
  VALIDOS: 'Válidos',
  TOTAL: 'Total de Atributos'
};

const TODOS_STATUS = [
  'PENDENTE',
  'APROVADO',
  'PROCESSANDO',
  'TRANSMITIDO',
  'ERRO',
  'AJUSTAR_ESTRUTURA'
] as const;

function statusListaParaMapa(lista: StatusResumo[] | undefined): Record<(typeof TODOS_STATUS)[number], number> {
  const mapa = TODOS_STATUS.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as Record<(typeof TODOS_STATUS)[number], number>);

  if (!lista) return mapa;

  for (const item of lista) {
    if (TODOS_STATUS.includes(item.status)) {
      mapa[item.status] = item.total;
    }
  }

  return mapa;
}

export default function PainelPage() {
  const [resumo, setResumo] = useState<ResumoDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverData, setHoverData] = useState<{ name: string; value: number } | null>(null);
  const { workingCatalog } = useWorkingCatalog();

  useEffect(() => {
    async function carregarResumo() {
      try {
        const params = workingCatalog?.id ? { catalogoId: workingCatalog.id } : undefined;
        const response = await api.get<ResumoDashboard>('/dashboard/resumo', { params });

        setResumo(response.data);
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

    const mapa = statusListaParaMapa(resumo.produtos.porStatus);

    return Object.entries(mapa)
      .filter(([_, quantidade]) => quantidade > 0)
      .map(([status, quantidade]) => ({
        name: STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status,
        value: quantidade,
        status: status,
        color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] || '#gray'
      }));
  }, [resumo?.produtos.porStatus]);

  // Preparar dados para a legenda de produtos (todos os status)
  const dadosLegendaProdutos = React.useMemo(() => {
    if (!resumo?.produtos.porStatus) return [];

    const mapa = statusListaParaMapa(resumo.produtos.porStatus);

    return TODOS_STATUS.map(status => ({
      name: STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status,
      value: mapa[status] || 0,
      status: status,
      color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] || '#gray'
    }));
  }, [resumo?.produtos.porStatus]);

  // Preparar dados para o gráfico de rosca de catálogos
  const dadosGraficoCatalogos = React.useMemo(() => {
    if (!resumo?.catalogos.porStatus) return [];

    const mapa = statusListaParaMapa(resumo.catalogos.porStatus);

    return Object.entries(mapa)
      .filter(([_, quantidade]) => quantidade > 0)
      .map(([status, quantidade]) => ({
        name: STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status,
        value: quantidade,
        status: status,
        color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] || '#gray'
      }));
  }, [resumo?.catalogos.porStatus]);

  // Preparar dados para a legenda de catálogos (todos os status)
  const dadosLegendaCatalogos = React.useMemo(() => {
    if (!resumo?.catalogos.porStatus) return [];

    const mapa = statusListaParaMapa(resumo.catalogos.porStatus);

    return TODOS_STATUS.map(status => ({
      name: STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status,
      value: mapa[status] || 0,
      status: status,
      color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] || '#gray'
    }));
  }, [resumo?.catalogos.porStatus]);

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
