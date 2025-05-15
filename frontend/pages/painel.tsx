// frontend/pages/painel.tsx
import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { ChevronLeft, ChevronRight, FileText, Users } from 'lucide-react';

export default function PainelPage() {
  const [currentMonth, setCurrentMonth] = useState('Este mês');
  
  return (
    <DashboardLayout title="Painel">
      <div className="flex justify-between items-center mb-6">
        <div></div> {/* Espaço vazio à esquerda */}
        
        <div className="flex items-center space-x-4">
          <select className="bg-white border border-gray-300 rounded px-3 py-1.5 text-sm">
            <option>Projeto</option>
            <option>Todos os projetos</option>
          </select>
          
          <select className="bg-white border border-gray-300 rounded px-3 py-1.5 text-sm">
            <option>Equipe</option>
            <option>Todos os membros</option>
          </select>
          
          <div className="flex items-center bg-white border border-gray-300 rounded">
            <button className="px-2 py-1.5">
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 text-sm">{currentMonth}</span>
            <button className="px-2 py-1.5">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Cards de Resumo */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <Card className="bg-[#222531] text-white p-6">
          <div className="text-sm text-gray-400 mb-1">Tempo total</div>
          <div className="text-3xl font-bold mb-1">20:07:43</div>
        </Card>
        
        <Card className="bg-[#222531] text-white p-6">
          <div className="text-sm text-gray-400 mb-1">Projeto principal</div>
          <div className="text-3xl font-bold mb-1">COMEXDEZ Web</div>
        </Card>
        
        <Card className="bg-[#222531] text-white p-6">
          <div className="text-sm text-gray-400 mb-1">Principal cliente</div>
          <div className="text-3xl font-bold mb-1">COMEXDEZ</div>
        </Card>
      </div>
      
      {/* Gráfico de Barras */}
      <Card className="mb-8 p-6">
        <div className="h-64 w-full relative">
          {/* Implementação fictícia de gráfico de barras */}
          <div className="absolute inset-0 flex items-end justify-around">
            {[1, 4, 7, 10, 13, 16, 19, 22, 25, 28].map((day, index) => (
              <div key={index} className="flex flex-col items-center">
                <div 
                  className="bg-[#f59e0b] w-12" 
                  style={{ 
                    height: `${Math.floor(Math.random() * 150) + 50}px`,
                    display: day > 16 ? 'block' : 'none'
                  }}
                ></div>
                <div className="text-xs text-gray-500 mt-2">{`${day < 10 ? '0' + day : day}/05`}</div>
              </div>
            ))}
          </div>
          
          {/* Linhas horizontais de escala */}
          {[0, 1, 2, 3, 4].map((hour, index) => (
            <div 
              key={index} 
              className="absolute w-full border-t border-gray-200 text-xs text-gray-400"
              style={{ bottom: `${25 * index}%`, left: 0 }}
            >
              <span className="absolute -top-3 -left-10">{hour}h</span>
            </div>
          ))}
        </div>
      </Card>
      
      {/* Gráfico de Rosca */}
      <Card className="p-6">
        <div className="flex">
          <div className="w-1/3 flex justify-center">
            <div className="relative w-48 h-48">
              {/* Círculo de rosca laranja */}
              <div className="absolute inset-0 rounded-full border-16 border-[#f59e0b]"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-2xl font-bold">20:07:43</div>
              </div>
            </div>
          </div>
          
          <div className="w-2/3">
            <div className="flex items-center justify-between px-6 py-3">
              <div className="flex items-center">
                <div className="text-lg">COMEXDEZ Web - COMEXDEZ</div>
              </div>
              <div className="flex items-center">
                <span className="text-lg mr-2">20:07:43</span>
                <div className="bg-[#f59e0b] h-6 w-32"></div>
                <span className="ml-2">100.00%</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </DashboardLayout>
  );
}