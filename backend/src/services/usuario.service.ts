// backend/src/services/usuario.service.ts
import { catalogoPrisma, legacyPrisma } from '../utils/prisma';
import { Permissao } from '../constants/permissoes';

export class UsuarioService {
  async listar(superUserId: number) {
    // Usuários já cadastrados no catálogo (não SUPER)
    const cadastrados = await catalogoPrisma.usuarioCatalogo.findMany({
      where: { superUserId, role: { not: 'SUPER' } },
      select: { id: true, username: true, nome: true },
      orderBy: { nome: 'asc' }
    });

    // Subusuários do legado (comex_subsessoes) vinculados ao superuser
    const subsLegado = await legacyPrisma.subUsuario.findMany({
      where: { superUserId },
      select: { id: true, email: true },
      orderBy: { email: 'asc' }
    });

    const existentes = new Set(cadastrados.map(u => u.username.toLowerCase()));

    // Monta lista adicional apenas dos que ainda não existem no catálogo
    const adicionais = subsLegado
      .filter(s => !existentes.has(s.email.toLowerCase()))
      .map(s => ({
        // Para listagem não persistimos; marcamos como legado para o front tratar a navegação
        id: s.id,
        username: s.email,
        nome: s.email,
        isLegacy: true as const,
      }));

    // Itens do catálogo recebem isLegacy: false
    const atuais = cadastrados.map(u => ({ ...u, isLegacy: false as const }));

    // Combina e ordena por nome (case-insensitive)
    const combinados = [...atuais, ...adicionais].sort((a, b) =>
      a.nome.localeCompare(b.nome, undefined, { sensitivity: 'base' })
    );

    return combinados;
  }

  async obter(superUserId: number, id: number) {
    return catalogoPrisma.usuarioCatalogo.findFirst({
      where: { id, superUserId },
      select: {
        id: true,
        username: true,
        nome: true,
        permissoes: { select: { codigo: true } }
      }
    });
  }

  async atualizarPermissoes(superUserId: number, id: number, permissoes: Permissao[]) {
    const usuario = await catalogoPrisma.usuarioCatalogo.findFirst({
      where: { id, superUserId },
      select: { id: true }
    });
    if (!usuario) {
      return null;
    }
    await catalogoPrisma.usuarioPermissao.deleteMany({ where: { usuarioCatalogoId: id } });
    if (permissoes.length) {
      await catalogoPrisma.usuarioPermissao.createMany({
        data: permissoes.map(codigo => ({ usuarioCatalogoId: id, codigo })),
      });
    }
    return this.obter(superUserId, id);
  }
}
