# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# 1) Copia manifestos e schema para gerar o Prisma Client
COPY package.json package-lock.json ./
COPY prisma ./prisma

# 2) Instala dependências (prod + dev) e gera o client
RUN npm ci
RUN npx prisma generate

# 3) Copia todo o código e compila o TypeScript
COPY . .
RUN npm run build

# Stage 2: Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# 1) Copia apenas o código compilado e as deps de produção
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# 2) Copia o prisma/schema para o introspect (sem migrations)
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# 3) Inicia o servidor sem rodar migrations
CMD ["node", "dist/server.js"]