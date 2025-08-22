// frontend/hooks/useOperadorEstrangeiro.ts - CORRIGIDO
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { formatCPFOrCNPJ } from '@/lib/validation';

export interface Pais {
  codigo: string;
  sigla: string;
  nome: string;
}

export interface Subdivisao {
  codigo: string;
  sigla: string;
  nome: string;
  paisCodigo: string;
  pais?: Pais;
}

export interface AgenciaEmissora {
  codigo: string;
  sigla: string;
  nome: string;
}

export interface OperadorEstrangeiro {
  id: number;
  catalogoId: number;
  catalogo: { id: number; cpf_cnpj?: string | null; nome: string };
  tin?: string;
  nome: string;
  email?: string;
  codigoInterno?: string;
  codigo?: string;
  versao: number;
  situacao: 'ATIVO' | 'INATIVO' | 'DESATIVADO';
  dataInclusao: string;
  dataUltimaAlteracao: string;

  // Campos de endereço
  codigoPostal?: string;
  logradouro?: string;
  cidade?: string;

  pais: Pais;
  subdivisao?: Subdivisao;
  identificacoesAdicionais?: Array<{
    id: number;
    numero: string;
    agenciaEmissora: AgenciaEmissora;
  }>;
}

export interface CatalogoOption {
  id: number;
  cpf_cnpj?: string | null;
  nome: string;
}

export function useOperadorEstrangeiro() {
  const [paises, setPaises] = useState<Pais[]>([]);
  const [subdivisoes, setSubdivisoes] = useState<Subdivisao[]>([]);
  const [agenciasEmissoras, setAgenciasEmissoras] = useState<AgenciaEmissora[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    carregarDadosAuxiliares();
  }, []);

  async function carregarDadosAuxiliares() {
    try {
      setLoading(true);
      const [paisesRes, agenciasRes, catalogosRes] = await Promise.all([
        api.get('/operadores-estrangeiros/aux/paises'),
        api.get('/operadores-estrangeiros/aux/agencias-emissoras'),
        api.get('/operadores-estrangeiros/aux/catalogos')
      ]);

      setPaises(paisesRes.data);
      setAgenciasEmissoras(agenciasRes.data);
      setCatalogos(catalogosRes.data);
      setSubdivisoes([]);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar dados auxiliares:', err);
      setError('Erro ao carregar dados auxiliares');
    } finally {
      setLoading(false);
    }
  }

  async function buscarOperadores(filtros?: { catalogoId?: number }) {
    try {
      const params = new URLSearchParams();
      if (filtros?.catalogoId) {
        params.append('catalogoId', String(filtros.catalogoId));
      }

      const response = await api.get(`/operadores-estrangeiros?${params.toString()}`);
      return response.data as OperadorEstrangeiro[];
    } catch (err) {
      console.error('Erro ao buscar operadores:', err);
      throw new Error('Erro ao buscar operadores estrangeiros');
    }
  }

  async function buscarOperadorPorId(id: number | string) {
    try {
      const response = await api.get(`/operadores-estrangeiros/${id}`);
      return response.data as OperadorEstrangeiro;
    } catch (err) {
      console.error(`Erro ao buscar operador ${id}:`, err);
      throw new Error('Operador estrangeiro não encontrado');
    }
  }

  async function buscarOperadoresPorTin(tin: string) {
    try {
      const response = await api.get(`/operadores-estrangeiros/buscar-por-tin/${tin}`);
      return response.data as OperadorEstrangeiro[];
    } catch (err) {
      console.error(`Erro ao buscar operadores por TIN ${tin}:`, err);
      throw new Error('Erro ao buscar operadores por TIN');
    }
  }

  async function criarOperador(data: any) {
    try {
      const response = await api.post('/operadores-estrangeiros', data);
      return response.data as OperadorEstrangeiro;
    } catch (err) {
      console.error('Erro ao criar operador:', err);
      throw new Error('Erro ao criar operador estrangeiro');
    }
  }

  async function atualizarOperador(id: number | string, data: any) {
    try {
      const response = await api.put(`/operadores-estrangeiros/${id}`, data);
      return response.data as OperadorEstrangeiro;
    } catch (err) {
      console.error(`Erro ao atualizar operador ${id}:`, err);
      throw new Error('Erro ao atualizar operador estrangeiro');
    }
  }

  async function carregarSubdivisoesPorPais(paisCodigo: string) {
    try {
      const response = await api.get(`/operadores-estrangeiros/aux/subdivisoes/${paisCodigo}`);
      return response.data as Subdivisao[];
    } catch (err) {
      console.error(`Erro ao carregar subdivisões do país ${paisCodigo}:`, err);
      throw new Error(`Erro ao carregar subdivisões do país ${paisCodigo}`);
    }
  }

  async function desativarOperador(id: number | string) {
    try {
      await api.delete(`/operadores-estrangeiros/${id}`);
    } catch (err) {
      console.error(`Erro ao desativar operador ${id}:`, err);
      throw new Error('Erro ao desativar operador estrangeiro');
    }
  }

  function getCatalogoOptions() {
    return [
      { value: '', label: 'Selecione uma empresa' },
      ...catalogos.map(cat => ({
        value: String(cat.id),
        label: `${formatCPFOrCNPJ(cat.cpf_cnpj || '')} - ${cat.nome}`
      }))
    ];
  }

  function getPaisOptions() {
    return [
      { value: '', label: 'Selecione um país' },
      ...paises.map(pais => ({ 
        value: pais.codigo, 
        label: `${pais.sigla} - ${pais.nome}` 
      }))
    ];
  }

  function getSubdivisaoOptions(paisCodigo?: string) {
    const subdivisoesFiltradas = paisCodigo 
      ? subdivisoes.filter(sub => sub.paisCodigo === paisCodigo)
      : subdivisoes;
      
    return [
      { value: '', label: 'Selecione uma subdivisão' },
      ...subdivisoesFiltradas.map(sub => ({ 
        value: sub.codigo, 
        label: `${sub.sigla} - ${sub.nome}` 
      }))
    ];
  }

  function getAgenciaEmissoraOptions() {
    return [
      { value: '', label: 'Selecione uma agência' },
      ...agenciasEmissoras.map(agencia => ({ 
        value: agencia.codigo, 
        label: `${agencia.sigla} - ${agencia.nome}` 
      }))
    ];
  }

  function getPaisNome(codigo: string) {
    const pais = paises.find(p => p.codigo === codigo);
    return pais ? pais.nome : codigo;
  }

  function getSubdivisaoNome(codigo: string) {
    const subdivisao = subdivisoes.find(s => s.codigo === codigo);
    return subdivisao ? subdivisao.nome : codigo;
  }

  function getAgenciaEmissoraNome(codigo: string) {
    const agencia = agenciasEmissoras.find(a => a.codigo === codigo);
    return agencia ? agencia.nome : codigo;
  }

  function getCatalogoNome(id: number) {
    const catalogo = catalogos.find(c => c.id === id);
    return catalogo ? catalogo.nome : String(id);
  }

  return {
    // Dados
    paises,
    subdivisoes,
    agenciasEmissoras,
    catalogos,
    loading,
    error,
    
    // Operações CRUD
    buscarOperadores,
    buscarOperadorPorId,
    buscarOperadoresPorTin,
    criarOperador,
    atualizarOperador,
    desativarOperador,
    carregarSubdivisoesPorPais,
    
    // Utilitários
    getCatalogoOptions,
    getPaisOptions,
    getSubdivisaoOptions,
    getAgenciaEmissoraOptions,
    getCatalogoNome,
    getPaisNome,
    getSubdivisaoNome,
    getAgenciaEmissoraNome,
    
    // Recarregar dados
    recarregarDados: carregarDadosAuxiliares
  };
}