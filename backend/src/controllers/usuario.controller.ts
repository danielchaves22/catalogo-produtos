// backend/src/controllers/usuario.controller.ts
import { Request, Response } from 'express';
import { UsuarioService } from '../services/usuario.service';

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
  const usuario = await service.obter(req.user!.id, id);
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
