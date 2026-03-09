// backend/src/utils/prisma.ts
import { PrismaClient as PrismaClientLegacy } from '@prisma/client'
import { PrismaClient as PrismaClientCatalogo } from '@prisma/client'

// Schema legado fixo - sempre será legicex_2
const LEGACY_SCHEMA = "legicex_2";

// Schema do catálogo de produtos - configurável via variável de ambiente
const CATALOG_SCHEMA = process.env.CATALOG_SCHEMA_NAME || "catpro-hml";

// Função para construir URL com schema específico
function buildDatabaseUrlWithSchema(baseUrl: string, schema: string): string {
  // Remove a barra final se existir
  const cleanUrl = baseUrl?.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanUrl}/${schema}`;
}


// Permite URLs separadas por ambiente (fallback para DATABASE_URL)
const LEGACY_DATABASE_URL = process.env.LEGACY_DATABASE_URL || process.env.DATABASE_URL || "";
const CATALOG_DATABASE_URL = process.env.CATALOG_DATABASE_URL || process.env.DATABASE_URL || "";

// Conexão para schema legicex_2
const legacyPrisma = new PrismaClientLegacy({
  datasources: {
    db: {
      url: buildDatabaseUrlWithSchema(LEGACY_DATABASE_URL, LEGACY_SCHEMA)
    }
  }
})

// Conexão para schema dinâmico do catálogo
const catalogoPrisma = new PrismaClientCatalogo({
  datasources: {
    db: {
      url: buildDatabaseUrlWithSchema(CATALOG_DATABASE_URL, CATALOG_SCHEMA)
    }
  }
})

// Log para debug em ambiente de desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  console.log(`Prisma conectado aos schemas: ${LEGACY_SCHEMA} e ${CATALOG_SCHEMA}`);
}

// Exporta ambas as conexões
export { legacyPrisma, catalogoPrisma }
