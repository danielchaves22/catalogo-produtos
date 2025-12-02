// backend/src/controllers/ia.controller.ts
import { Request, Response } from 'express';
import { IaSugestaoAtributosService } from '../services/ia-sugestao-atributos.service';
import { logger } from '../utils/logger';

const iaSugestaoService = new IaSugestaoAtributosService();

export async function sugerirAtributos(req: Request, res: Response) {
  try {
    const { descricao, atributos, ncm, modalidade, maxTokensResposta } = req.body;

    const usuario = req.user;
    const usuarioAdmin = usuario?.role === 'ADMIN' || usuario?.catprodAdmFull;

    if (maxTokensResposta && !usuarioAdmin) {
      return res
        .status(403)
        .json({ error: 'Somente administradores podem configurar o limite de tokens da IA.' });
    }

    const resultado = await iaSugestaoService.sugerirValores({
      descricao,
      atributos,
      ncm,
      modalidade,
      maxTokensResposta: usuarioAdmin ? maxTokensResposta : undefined
    });

    return res.json({
      sucesso: true,
      sugestoes: resultado.sugestoes,
      modelo: resultado.modelo,
      tokens: resultado.tokens
    });
  } catch (error) {
    const mensagemErro =
      error instanceof Error ? error.message : 'Erro ao sugerir atributos';

    logger.error('Erro ao sugerir atributos com IA', error);

    if (mensagemErro.includes('OPENAI_API_KEY')) {
      return res.status(500).json({
        error: 'Serviço de IA não configurado. Informe OPENAI_API_KEY para habilitar.'
      });
    }

    return res.status(500).json({ error: 'Erro ao sugerir atributos com IA' });
  }
}

