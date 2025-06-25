import { Request, Response } from 'express';
import { EstruturaService } from '../services/estrutura.service';

const estruturaService = new EstruturaService();

export function obterEstruturaPorNcm(req: Request, res: Response) {
  const { ncm } = req.params;
  const estrutura = estruturaService.obterPorNcm(ncm);
  if (!estrutura) {
    return res.status(404).json({ error: 'Estrutura não encontrada' });
  }
  return res.json(estrutura);
}
