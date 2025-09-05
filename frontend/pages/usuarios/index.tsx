// frontend/pages/usuarios/index.tsx
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/PageLoader';
import { Pencil } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface Usuario {
  id: number;
  username: string;
  nome: string;
}

export default function UsuariosPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== 'SUPER') {
      router.replace('/');
      return;
    }
    if (user) {
      carregar();
    }
  }, [user]);

  async function carregar() {
    try {
      const res = await api.get('/usuarios');
      setUsuarios(res.data);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Usuários">
        <PageLoader message="Carregando usuários..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Usuários">
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Usuários' }]} />
      <Card>
        <table className="w-full text-sm text-left">
          <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
            <tr>
              <th className="w-24 px-4 py-3 text-center">Ações</th>
              <th className="px-4 py-3">Login</th>
              <th className="px-4 py-3">Nome</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-gray-700 hover:bg-[#1a1f2b]">
                <td className="px-4 py-3 text-center">
                  <button
                    className="p-1 text-gray-300 hover:text-blue-500"
                    onClick={() => router.push(`/usuarios/${u.id}`)}
                    title="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                </td>
                <td className="px-4 py-3 font-mono text-white">{u.username}</td>
                <td className="px-4 py-3 text-white">{u.nome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </DashboardLayout>
  );
}
