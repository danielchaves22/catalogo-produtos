// backend/src/setup.ts
// Este arquivo deve ser importado no início da aplicação
import dotenv from 'dotenv';
import path from 'path';

// Carrega variáveis de ambiente no início da aplicação
dotenv.config({
  path: path.resolve(process.cwd(), process.env.NODE_ENV === 'test' ? '.env.test' : '.env')
});

// Log das variáveis configuradas para debug (apenas em desenvolvimento)
if (process.env.NODE_ENV === 'development') {
  console.log('Variáveis de ambiente carregadas:');
  console.log(`- Porta: ${process.env.PORT}`);
  console.log(`- Ambiente: ${process.env.NODE_ENV}`);
  console.log(`- Schema do Catálogo: ${process.env.CATALOG_SCHEMA_NAME || 'catpro-hml (padrão)'}`);
  
  // Ofusca a URL do banco para segurança (não mostrar senhas)
  const dbUrl = process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':****@') || 'não definida';
  console.log(`- Database URL: ${dbUrl}`);
}

// Importações iniciais para garantir que os serviços estejam prontos
import './utils/prisma';