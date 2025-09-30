// frontend/contexts/MessagesContext.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import api from '@/lib/api';
import { useAuth } from './AuthContext';

export type MensagemCategoria = 'ATUALIZACAO_SISCOMEX';
export type MensagemStatusFiltro = 'TODAS' | 'LIDAS' | 'NAO_LIDAS';

export interface Mensagem {
  id: number;
  titulo: string;
  conteudo: string;
  categoria: MensagemCategoria;
  lida: boolean;
  criadaEm: string;
  lidaEm?: string | null;
}

interface ListaMensagensResponse {
  total: number;
  mensagens: Mensagem[];
}

interface MessagesContextValue {
  unreadMessages: Mensagem[];
  unreadCount: number;
  isLoadingUnread: boolean;
  refreshUnread: () => Promise<void>;
  listMessages: (
    status?: MensagemStatusFiltro,
    categoria?: MensagemCategoria,
    limit?: number,
    offset?: number,
  ) => Promise<ListaMensagensResponse>;
  getMessage: (id: number) => Promise<Mensagem>;
  markAsRead: (id: number) => Promise<Mensagem | null>;
  listarCategorias: () => Promise<MensagemCategoria[]>;
}

const MessagesContext = createContext<MessagesContextValue | undefined>(undefined);

export function MessagesProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState<Mensagem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingUnread, setIsLoadingUnread] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const listMessages = useCallback<MessagesContextValue['listMessages']>(
    async (status = 'TODAS', categoria, limit, offset) => {
      const params: Record<string, string | number> = {};
      if (status) params.status = status;
      if (categoria) params.categoria = categoria;
      if (typeof limit === 'number') params.limit = limit;
      if (typeof offset === 'number') params.offset = offset;

      const { data } = await api.get<ListaMensagensResponse>('/mensagens', { params });
      return data;
    },
    [],
  );

  const getMessage = useCallback(async (id: number) => {
    const { data } = await api.get<Mensagem>(`/mensagens/${id}`);
    return data;
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!token) {
      if (isMountedRef.current) {
        setUnreadMessages([]);
        setUnreadCount(0);
      }
      return;
    }

    setIsLoadingUnread(true);
    try {
      const { data } = await api.get<ListaMensagensResponse>('/mensagens/resumo-nao-lidas', {
        params: { limit: 5 },
      });
      if (!isMountedRef.current) return;
      setUnreadMessages(data.mensagens);
      setUnreadCount(data.total);
    } catch (error) {
      if (!isMountedRef.current) return;
      setUnreadMessages([]);
      setUnreadCount(0);
      console.error('Erro ao carregar mensagens não lidas:', error);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingUnread(false);
      }
    }
  }, [token]);

  const markAsRead = useCallback(async (id: number) => {
    try {
      const { data } = await api.patch<Mensagem>(`/mensagens/${id}/lida`);
      await refreshUnread();
      return data;
    } catch (error) {
      console.error('Erro ao marcar mensagem como lida:', error);
      throw error;
    }
  }, [refreshUnread]);

  const listarCategorias = useCallback(async () => {
    const { data } = await api.get<{ categorias: MensagemCategoria[] }>('/mensagens/categorias');
    return data.categorias;
  }, []);

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread, token]);

  const value = useMemo<MessagesContextValue>(() => ({
    unreadMessages,
    unreadCount,
    isLoadingUnread,
    refreshUnread,
    listMessages,
    getMessage,
    markAsRead,
    listarCategorias,
  }), [
    unreadMessages,
    unreadCount,
    isLoadingUnread,
    refreshUnread,
    listMessages,
    getMessage,
    markAsRead,
    listarCategorias,
  ]);

  return (
    <MessagesContext.Provider value={value}>
      {children}
    </MessagesContext.Provider>
  );
}

export function useMessages(): MessagesContextValue {
  const context = useContext(MessagesContext);
  if (!context) {
    throw new Error('useMessages deve ser utilizado dentro de um MessagesProvider');
  }
  return context;
}
