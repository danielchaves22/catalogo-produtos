// backend/src/services/usuario.service.ts
import { catalogoPrisma } from '../utils/prisma';
import { Permissao } from '../constants/permissoes';

export class UsuarioService {
  async listar(superUserId: number) {
    return catalogoPrisma.usuarioCatalogo.findMany({
      where: { superUserId, role: { not: 'SUPER' } },
      select: { id: true, username: true, nome: true },
      orderBy: { nome: 'asc' }
    });
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
