// frontend/components/ui/LoadingScreen.tsx
import React from 'react';
import Image from 'next/image';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Carregando...' }: LoadingScreenProps) {
  return (
    <div className="fixed inset-0 bg-[#1d2330] flex flex-col items-center justify-center z-50">
      <div className="mb-6">
        <Image
          src="/assets/images/logo_principal.png"
          alt="COMEXDEZ"
          width={120}
          height={36}
          priority
          className="h-10 w-auto"
        />
      </div>
      
      <div className="w-16 h-16 border-4 border-t-[#f59e0b] border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin mb-4"></div>
      
      <p className="text-white text-lg font-medium">{message}</p>
    </div>
  );
}
