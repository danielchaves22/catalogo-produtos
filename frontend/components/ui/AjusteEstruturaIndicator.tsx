// frontend/components/ui/AjusteEstruturaIndicator.tsx
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';

export function AjusteEstruturaIndicator() {
  const router = useRouter();
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCount();

    // Atualizar a cada 5 minutos
    const interval = setInterval(fetchCount, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const fetchCount = async () => {
    try {
      const response = await api.get('/ajuste-estrutura/contar');
      setCount(response.data.count || 0);
    } catch (error) {
      console.error('Erro ao buscar contagem de produtos com ajuste:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (count > 0) {
      router.push('/ajuste-estrutura');
    }
  };

  if (loading) {
    return null;
  }

  const temProdutos = count > 0;

  return (
    <button
      onClick={handleClick}
      className={`p-1 rounded hover:bg-[#262b36] ${
        temProdutos ? 'text-red-500' : 'text-green-500'
      }`}
      title={
        temProdutos
          ? 'Produtos precisam ajuste de estrutura'
          : 'Estrutura sincronizada'
      }
      aria-label={
        temProdutos
          ? `${count} produtos precisam ajuste de estrutura`
          : 'Estrutura sincronizada com SISCOMEX'
      }
    >
      {temProdutos ? (
        <AlertTriangle size={18} />
      ) : (
        <CheckCircle size={18} />
      )}
    </button>
  );
}
