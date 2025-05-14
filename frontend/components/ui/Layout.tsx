// frontend/components/ui/Layout.tsx
import React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from './Button';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { logout, user } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-neutral text-gray-800 font-sans">
      {/* Navbar */}
      <header className="bg-white shadow-md py-4 px-6 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <Image
            src="/assets/images/logo_principal.png"
            alt="Logo"
            width={80}
            height={24}
            priority
            className="h-6 w-auto"
          />
          <span className="font-medium">Sistema</span>
        </div>
        
        <div className="flex items-center space-x-2">
          {user && (
            <span className="text-sm mr-4">Olá, {user.name}</span>
          )}
          <Button variant="danger" onClick={logout}>Sair</Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto py-12 px-6">{children}</main>
      
      {/* Footer simplificado */}
      <footer className="bg-white shadow-inner py-4 text-center text-gray-500 text-sm">
        <p>&copy; {new Date().getFullYear()} - Todos os direitos reservados</p>
      </footer>
    </div>
  );
}