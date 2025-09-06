// backend/src/controllers/usuario.controller.ts
import { Request, Response } from 'express';
import { UsuarioService } from '../services/usuario.service';
import { legacyPrisma, catalogoPrisma } from '../utils/prisma';

const service = new UsuarioService();

function ensureSuper(req: Request, res: Response) {
  if (req.user?.role !== 'SUPER') {
    res.status(403).json({ error: 'Acesso restrito a superusuários' });
    return false;
  }
  return true;
}

export async function listarSubUsuarios(req: Request, res: Response) {
  if (!ensureSuper(req, res)) return;
  const usuarios = await service.listar(req.user!.id);
  res.json(usuarios);
}

export async function obterSubUsuario(req: Request, res: Response) {
  if (!ensureSuper(req, res)) return;
  const id = Number(req.params.id);
  const superUserId = req.user!.id;

  // Se query ?legacy=1, trata o ID como do legado (comex_subsessoes). Faz o insert transparente.
  const legacyFlag = String(req.query.legacy || '').toLowerCase();
  const isLegacy = legacyFlag === '1' || legacyFlag === 'true';

  if (isLegacy) {
    // Busca subsessão do legado pertencente ao super usuário logado
    const sub = await legacyPrisma.subUsuario.findFirst({
      where: { id, superUserId },
      select: { id: true, email: true }
    });
    if (!sub) return res.status(404).json({ error: 'Usuário (legado) não encontrado' });

    // Verifica se já existe no catálogo; se não, cria agora (insert transparente)
    const existente = await catalogoPrisma.usuarioCatalogo.findFirst({
      where: { superUserId, username: sub.email },
      select: { id: true }
    });

    const criado = existente
      ? existente
      : await catalogoPrisma.usuarioCatalogo.create({
          data: {
            legacyId: sub.id,
            username: sub.email,
            nome: sub.email,
            superUserId,
            role: 'USER',
          },
          select: { id: true }
        });

    // Retorna no mesmo formato da edição padrão
    const usuario = await service.obter(superUserId, criado.id);
    if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado após criação' });
    return res.json({
      id: usuario.id,
      username: usuario.username,
      nome: usuario.nome,
      permissoes: usuario.permissoes.map(p => p.codigo)
    });
  }

  // Fluxo normal: busca por ID do catálogo
  const usuario = await service.obter(superUserId, id);
  if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({
    id: usuario.id,
    username: usuario.username,
    nome: usuario.nome,
    permissoes: usuario.permissoes.map(p => p.codigo)
  });
}

export async function atualizarPermissoes(req: Request, res: Response) {
  if (!ensureSuper(req, res)) return;
  const id = Number(req.params.id);
  const { permissoes } = req.body;
  const usuario = await service.atualizarPermissoes(req.user!.id, id, permissoes);
  if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({
    id: usuario.id,
    username: usuario.username,
    nome: usuario.nome,
    permissoes: usuario.permissoes.map(p => p.codigo)
  });
}
