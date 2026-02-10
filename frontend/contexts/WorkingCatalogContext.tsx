import React, { createContext, useContext, useEffect, useState } from 'react';

export interface WorkingCatalog {
  id: number;
  numero?: number;
  nome: string;
  cpf_cnpj?: string | null;
}

interface WorkingCatalogContextData {
  workingCatalog: WorkingCatalog | null;
  setWorkingCatalog: (catalog: WorkingCatalog | null) => void;
}

export const WORKING_CATALOG_STORAGE_KEY = 'workingCatalog';

const WorkingCatalogContext = createContext<WorkingCatalogContextData>({
  workingCatalog: null,
  setWorkingCatalog: () => {},
});

export function WorkingCatalogProvider({ children }: { children: React.ReactNode }) {
  const [workingCatalog, setWorkingCatalogState] = useState<WorkingCatalog | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem(WORKING_CATALOG_STORAGE_KEY);
    if (stored) {
      try {
        setWorkingCatalogState(JSON.parse(stored));
      } catch {
        sessionStorage.removeItem(WORKING_CATALOG_STORAGE_KEY);
      }
    }
  }, []);

  const setWorkingCatalog = (catalog: WorkingCatalog | null) => {
    setWorkingCatalogState(catalog);
    if (typeof window !== 'undefined') {
      if (catalog) {
        sessionStorage.setItem(WORKING_CATALOG_STORAGE_KEY, JSON.stringify(catalog));
      } else {
        sessionStorage.removeItem(WORKING_CATALOG_STORAGE_KEY);
      }
    }
  };

  return (
    <WorkingCatalogContext.Provider value={{ workingCatalog, setWorkingCatalog }}>
      {children}
    </WorkingCatalogContext.Provider>
  );
}

export function useWorkingCatalog() {
  return useContext(WorkingCatalogContext);
}
