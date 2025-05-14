import React from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/ui/Layout'
import { Card } from '@/components/ui/Card'

export default function HomePage() {
  const { user } = useAuth();

  return (
    <Layout>
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-3xl font-heading font-semibold mb-4">
          Bem-vindo ao Sistema
        </h1>
        
        <Card className="p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Informações do Usuário</h2>
          {user ? (
            <div className="text-left">
              <p><strong>Nome:</strong> {user.name}</p>
              <p><strong>Email:</strong> {user.email}</p>
            </div>
          ) : (
            <p>Carregando informações do usuário...</p>
          )}
        </Card>
        
        <p className="text-gray-600">
          Esta é uma página de exemplo. Adicione seu conteúdo aqui.
        </p>
      </div>
    </Layout>
  );
}