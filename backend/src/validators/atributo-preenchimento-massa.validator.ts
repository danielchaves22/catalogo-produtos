import { z } from 'zod';

export const createAtributoPreenchimentoMassaSchema = z
  .object({
    ncmCodigo: z.string().length(8),
    modalidade: z.string().min(1).optional(),
    catalogoIds: z.array(z.number().int().positive()).optional(),
    valoresAtributos: z.record(z.any()).optional(),
    estruturaSnapshot: z.any().optional(),
    modoAtribuicao: z.enum(['TODOS_COM_EXCECOES', 'SELECIONADOS']).optional(),
    produtosExcecao: z
      .array(
        z.object({
          id: z.number().int().positive()
        })
      )
      .optional(),
    produtosSelecionados: z
      .array(
        z.object({
          id: z.number().int().positive()
        })
      )
      .optional()
  })
  .superRefine((dados, ctx) => {
    const modo = dados.modoAtribuicao ?? 'TODOS_COM_EXCECOES';

    if (modo === 'SELECIONADOS' && (!dados.produtosSelecionados || dados.produtosSelecionados.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe ao menos um produto para aplicar a atribuição em massa.',
        path: ['produtosSelecionados']
      });
    }
  });
