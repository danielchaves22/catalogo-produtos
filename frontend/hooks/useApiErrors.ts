// frontend/hooks/useApiError.ts (NOVO ARQUIVO)
import { useToast } from '@/components/ui/ToastContext';

export function useApiError() {
  const { addToast } = useToast();

  const handleApiError = (error: any, defaultMessage: string = 'Erro inesperado') => {
    console.error('API Error:', error);
    
    // Se foi redirecionamento para login, não mostrar toast
    if (error.message === 'REDIRECT_TO_LOGIN') {
      return;
    }
    
    // Extrair mensagem do erro
    let errorMessage = defaultMessage;
    
    if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    } else if (error.message && error.message !== 'REDIRECT_TO_LOGIN') {
      errorMessage = error.message;
    }
    
    addToast(errorMessage, 'error');
  };

  return { handleApiError };
}