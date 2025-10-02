// backend/src/services/mensagem.service.ts
import { catalogoPrisma } from '../utils/prisma';
import { Mensagem as MensagemModel, MensagemCategoria, Prisma } from '@prisma/client';

export type MensagemStatusFiltro = 'TODAS' | 'LIDAS' | 'NAO_LIDAS';

export interface MensagemDTO {
  id: number;
  titulo: string;
  conteudo: string;
  categoria: MensagemCategoria;
  metadados?: Record<string, unknown> | null;
  lida: boolean;
  criadaEm: Date;
  lidaEm?: Date | null;
}

export interface ListaMensagensResultado {
  total: number;
  mensagens: MensagemDTO[];
}

export class MensagemService {
  private mapToDTO(mensagem: MensagemModel): MensagemDTO {
    return {
      id: mensagem.id,
      titulo: mensagem.titulo,
      conteudo: mensagem.conteudo,
      categoria: mensagem.categoria,
      metadados: (mensagem.metadados as Record<string, unknown> | null) ?? null,
      lida: mensagem.lida,
      criadaEm: mensagem.criadaEm,
      lidaEm: mensagem.lidaEm ?? null,
    };
  }

  async listar(
    superUserId: number,
    status: MensagemStatusFiltro = 'TODAS',
    limit?: number,
    offset?: number,
    categoria?: MensagemCategoria,
  ): Promise<ListaMensagensResultado> {
    const where: Prisma.MensagemWhereInput = {
      superUserId,
    };

    if (status === 'LIDAS') {
      where.lida = true;
    } else if (status === 'NAO_LIDAS') {
      where.lida = false;
    }

    if (categoria) {
      where.categoria = categoria;
    }

    const [mensagens, total] = await Promise.all([
      catalogoPrisma.mensagem.findMany({
        where,
        orderBy: { criadaEm: 'desc' },
        skip: offset,
        take: limit,
      }),
      catalogoPrisma.mensagem.count({ where }),
    ]);

    return {
      total,
      mensagens: mensagens.map((mensagem) => this.mapToDTO(mensagem)),
    };
  }

  async resumoNaoLidas(superUserId: number, limit: number = 5): Promise<ListaMensagensResultado> {
    return this.listar(superUserId, 'NAO_LIDAS', limit, 0);
  }

  async contarNaoLidas(superUserId: number): Promise<number> {
    return catalogoPrisma.mensagem.count({
      where: {
        superUserId,
        lida: false,
      },
    });
  }

  async buscarPorId(superUserId: number, id: number): Promise<MensagemDTO | null> {
    const mensagem = await catalogoPrisma.mensagem.findFirst({
      where: { id, superUserId },
    });

    if (!mensagem) {
      return null;
    }

    return this.mapToDTO(mensagem);
  }

  async marcarComoLida(superUserId: number, id: number): Promise<MensagemDTO | null> {
    const mensagem = await catalogoPrisma.mensagem.findFirst({
      where: { id, superUserId },
    });

    if (!mensagem) {
      return null;
    }

    if (mensagem.lida) {
      return this.mapToDTO(mensagem);
    }

    const atualizada = await catalogoPrisma.mensagem.update({
      where: { id },
      data: {
        lida: true,
        lidaEm: new Date(),
      },
    });

    return this.mapToDTO(atualizada);
  }

  listarCategorias(): MensagemCategoria[] {
    return Object.values(MensagemCategoria);
  }

  async remover(superUserId: number, id: number): Promise<boolean> {
    const mensagem = await catalogoPrisma.mensagem.findFirst({
      where: { id, superUserId },
      select: { id: true },
    });

    if (!mensagem) {
      return false;
    }

    await catalogoPrisma.mensagem.delete({
      where: { id: mensagem.id },
    });

    return true;
  }
}
