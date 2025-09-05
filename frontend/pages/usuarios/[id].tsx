// frontend/pages/usuarios/[id].tsx
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { PageLoader } from '@/components/ui/PageLoader';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { GRUPOS_PERMISSOES } from '@/lib/permissoes';
import { useToast } from '@/components/ui/ToastContext';

interface Usuario {
  id: number;
  username: string;
  nome: string;
  permissoes: string[];
}

export default function EditarUsuarioPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { addToast } = useToast();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== 'SUPER') {
      router.replace('/');
      return;
    }
    if (id) {
      carregar();
    }
  }, [id, user]);

  async function carregar() {
    try {
      const res = await api.get(`/usuarios/${id}`);
      setUsuario(res.data);
      setSelecionadas(res.data.permissoes);
    } finally {
      setLoading(false);
    }
  }

  function togglePermissao(codigo: string) {
    setSelecionadas(prev =>
      prev.includes(codigo) ? prev.filter(c => c !== codigo) : [...prev, codigo]
    );
  }

  async function salvar() {
    if (!id) return;
    try {
      await api.put(`/usuarios/${id}/permissoes`, { permissoes: selecionadas });
      addToast('Permissões atualizadas', 'success');
      router.push('/usuarios');
    } catch {
      addToast('Erro ao salvar permissões', 'error');
    }
  }

  if (loading || !usuario) {
    return (
      <DashboardLayout title="Usuários">
        <PageLoader message="Carregando usuário..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Usuários">
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Usuários', href: '/usuarios' }, { label: usuario.nome }]} />

      <div className="space-y-6">
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400">Login</label>
              <input value={usuario.username} disabled className="mt-1 w-full bg-[#1e2126] border border-gray-700 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-400">Nome</label>
              <input value={usuario.nome} disabled className="mt-1 w-full bg-[#1e2126] border border-gray-700 rounded px-3 py-2" />
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-4 text-white">Permissões</h2>
          {GRUPOS_PERMISSOES.map(grupo => (
            <Card key={grupo.titulo} headerTitle={grupo.titulo} className="mb-4">
              {grupo.permissoes.map(p => (
                <div key={p.codigo} className="flex items-center gap-3 text-gray-300 mb-1">
                  <Toggle
                    checked={selecionadas.includes(p.codigo)}
                    onChange={() => togglePermissao(p.codigo)}
                  />
                  <span>{p.descricao}</span>
                </div>
              ))}
            </Card>
          ))}
          <Button onClick={salvar} className="mt-4">Salvar</Button>
        </Card>
      </div>
    </DashboardLayout>
  );
}
