// frontend/middleware.ts - VERSÃO SEGURA
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// CONSTANTE DE SEGURANÇA - deve coincidir com AuthContext
const COOKIE_NAME = 'catalogo_produtos_auth';

// Rotas que não precisam de autenticação
const publicRoutes = ['/login', '/api/auth/login']

// Arquivos estáticos e API routes que não devem passar pelo middleware
const excludedPaths = [
  '/_next', 
  '/favicon.ico', 
  '/assets',
  '/api/auth/login', // Permitir login
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Ignora arquivos estáticos e APIs específicas
  if (excludedPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }
  
  // Verifica se é uma rota pública
  const isPublicRoute = publicRoutes.some(route => pathname === route)
  
  // SEGURANÇA: Verifica apenas NOSSO cookie específico
  const token = request.cookies.get(COOKIE_NAME)?.value
  
  // Rota protegida e sem autenticação
  if (!isPublicRoute && !token) {
    const url = new URL('/login', request.url)
    
    // Preservar rota de destino, exceto se já estiver no login
    if (pathname !== '/login') {
      url.searchParams.set('redirect', pathname)
    }
    
    // Adicionar header para indicar redirecionamento por token inválido
    const response = NextResponse.redirect(url)
    response.headers.set('X-Redirect-Reason', 'no-token')
    response.headers.set('X-App-Name', 'catalogo-produtos') // Identificar nossa app
    
    return response
  }
  
  // Rota de login com autenticação válida
  if (pathname === '/login' && token) {
    // Se tem redirect, ir para lá; senão, ir para home
    const redirect = request.nextUrl.searchParams.get('redirect')
    const destination = redirect && redirect !== '/login' ? redirect : '/'
    
    return NextResponse.redirect(new URL(destination, request.url))
  }
  
  return NextResponse.next()
}

// Configura quais caminhos acionam o middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * 1. /_next/static (static files)
     * 2. /_next/image (image optimization files)
     * 3. /favicon.ico (favicon file)
     * 4. /assets (public assets)
     * 5. /api/auth/login (login endpoint)
     */
    '/((?!_next/static|_next/image|favicon.ico|assets/|api/auth/login).*)',
  ],
}