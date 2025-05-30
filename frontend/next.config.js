// frontend/next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Para acessar API no mesmo host durante desenvolvimento
  async rewrites() {
    // Só aplicar rewrite em desenvolvimento local
    // if (process.env.NODE_ENV === 'development') {
    //   return [
    //     {
    //       source: '/api/:path*',
    //       destination: 'http://localhost:3000/api/:path*',
    //     },
    //   ];
    // }
    return [];
  },
};

module.exports = nextConfig;