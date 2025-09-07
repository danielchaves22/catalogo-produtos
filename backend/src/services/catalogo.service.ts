// backend/src/services/catalogo.service.ts
import { CatalogoStatus, Prisma } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';

export interface CreateCatalogoDTO {
  nome: string;
  cpf_cnpj?: string;
  status: CatalogoStatus;
}

export interface UpdateCatalogoDTO {
  nome: string;
  cpf_cnpj?: string;
  status: CatalogoStatus;
}

export class CatalogoService {
  /**
   * Lista todos os catálogos
   */
  async listarTodos(superUserId: number) {
    try {
      return await catalogoPrisma.catalogo.findMany({
        where: { superUserId },
        orderBy: { ultima_alteracao: 'desc' },
        select: {
          id: true,
          nome: true,
          cpf_cnpj: true,
          ultima_alteracao: true,
          numero: true,
          status: true,
          superUserId: true,
          certificadoId: true
        }
      });
    } catch (error: unknown) {
      logger.error('Erro ao listar catálogos:', error);
      throw new Error('Falha ao listar catálogos');
    }
  }

  /**
   * Busca um catálogo pelo ID
   */
  async buscarPorId(id: number, superUserId: number) {
    try {
      return await catalogoPrisma.catalogo.findFirst({
        where: { id, superUserId },
        select: {
          id: true,
          nome: true,
          cpf_cnpj: true,
          ultima_alteracao: true,
          numero: true,
          status: true,
          superUserId: true,
          certificadoId: true
        }
      });
    } catch (error: unknown) {
      logger.error(`Erro ao buscar catálogo ID ${id}:`, error);
      throw new Error(`Falha ao buscar catálogo ID ${id}`);
    }
  }

  /**
   * Cria um novo catálogo
   */
  async criar(data: CreateCatalogoDTO, superUserId: number) {
    try {
      const existenteNome = await catalogoPrisma.catalogo.findFirst({
        where: { nome: data.nome, superUserId }
      });
      if (existenteNome) {
        throw new Error('Já existe um catálogo com este nome');
      }

      if (data.cpf_cnpj) {
        const existenteCpf = await catalogoPrisma.catalogo.findFirst({
          where: { cpf_cnpj: data.cpf_cnpj, superUserId }
        });
        if (existenteCpf) {
          throw new Error('Já existe um catálogo com este CPF/CNPJ');
        }
      }
      return await catalogoPrisma.catalogo.create({
        data: {
          nome: data.nome,
          cpf_cnpj: data.cpf_cnpj,
          status: data.status,
          ultima_alteracao: new Date(),
          numero: 0,
          superUserId
        },
        select: {
          id: true,
          nome: true,
          cpf_cnpj: true,
          ultima_alteracao: true,
          numero: true,
          status: true,
          superUserId: true,
          certificadoId: true
        }
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Já existe')) {
        throw error;
      }
      logger.error('Erro ao criar catálogo:', error);
      throw new Error('Falha ao criar catálogo');
    }
  }

  /**
   * Atualiza um catálogo existente
   */
  async atualizar(id: number, data: UpdateCatalogoDTO, superUserId: number) {
    try {
      const existenteNome = await catalogoPrisma.catalogo.findFirst({
        where: { nome: data.nome, superUserId, id: { not: id } }
      });
      if (existenteNome) {
        throw new Error('Já existe um catálogo com este nome');
      }

      if (data.cpf_cnpj) {
        const existenteCpf = await catalogoPrisma.catalogo.findFirst({
          where: { cpf_cnpj: data.cpf_cnpj, superUserId, id: { not: id } }
        });
        if (existenteCpf) {
          throw new Error('Já existe um catálogo com este CPF/CNPJ');
        }
      }

      const atualizado = await catalogoPrisma.catalogo.updateMany({
        where: { id, superUserId },
        data: {
          nome: data.nome,
          cpf_cnpj: data.cpf_cnpj,
          status: data.status,
          ultima_alteracao: new Date()
        }
      });

      if (atualizado.count === 0) {
        throw new Error(`Catálogo ID ${id} não encontrado`);
      }

      return (await catalogoPrisma.catalogo.findFirst({
        where: { id, superUserId },
        select: {
          id: true,
          nome: true,
          cpf_cnpj: true,
          ultima_alteracao: true,
          numero: true,
          status: true,
          superUserId: true,
          certificadoId: true
        }
      }))!;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Já existe')) {
        throw error;
      }
      logger.error(`Erro ao atualizar catálogo ID ${id}:`, error);

      throw new Error(`Falha ao atualizar catálogo ID ${id}`);
    }
  }

  /**
   * Remove um catálogo
   */
  async remover(id: number, superUserId: number): Promise<void> {
    try {
      const removido = await catalogoPrisma.catalogo.deleteMany({
        where: { id, superUserId }
      });

      if (removido.count === 0) {
        throw new Error(`Catálogo ID ${id} não encontrado`);
      }
    } catch (error: unknown) {
      logger.error(`Erro ao remover catálogo ID ${id}:`, error);
      throw new Error(`Falha ao remover catálogo ID ${id}`);
    }
  }

  async clonar(id: number, cpf_cnpj: string, superUserId: number) {
    const existente = await catalogoPrisma.catalogo.findFirst({
      where: { cpf_cnpj, superUserId }
    });
    if (existente) {
      throw new Error('CNPJ já esta vinculado a um catálogo !!');
    }

    const original = await catalogoPrisma.catalogo.findFirst({
      where: { id, superUserId },
      include: {
        produtos: {
          include: {
            atributos: true,
            codigosInternos: true,
            operadoresEstrangeiros: true
          }
        },
        operadoresEstrangeiros: {
          include: { identificacoesAdicionais: true }
        }
      }
    });

    if (!original) {
      throw new Error(`Catálogo ID ${id} não encontrado`);
    }

    return await catalogoPrisma.$transaction(async (tx) => {
      const novo = await tx.catalogo.create({
        data: {
          nome: original.nome,
          cpf_cnpj,
          status: original.status,
          ultima_alteracao: new Date(),
          numero: 0,
          superUserId
        }
      });

      const opMap = new Map<number, number>();
      for (const op of original.operadoresEstrangeiros) {
        const novoOp = await tx.operadorEstrangeiro.create({
          data: {
            catalogoId: novo.id,
            paisCodigo: op.paisCodigo,
            tin: op.tin,
            nome: op.nome,
            email: op.email,
            codigoInterno: op.codigoInterno,
            codigoPostal: op.codigoPostal,
            logradouro: op.logradouro,
            cidade: op.cidade,
            subdivisaoCodigo: op.subdivisaoCodigo,
            situacao: op.situacao,
            dataReferencia: op.dataReferencia,
            identificacoesAdicionais: op.identificacoesAdicionais.length
              ? {
                  create: op.identificacoesAdicionais.map((i) => ({
                    numero: i.numero,
                    agenciaEmissoraCodigo: i.agenciaEmissoraCodigo
                  }))
                }
              : undefined
          }
        });
        opMap.set(op.id, novoOp.id);
      }

      for (const prod of original.produtos) {
        const attr = prod.atributos[0];
        await tx.produto.create({
          data: {
            codigo: prod.codigo,
            versao: prod.versao,
            status: prod.status,
            situacao: prod.situacao,
            ncmCodigo: prod.ncmCodigo,
            modalidade: prod.modalidade,
            denominacao: prod.denominacao,
            descricao: prod.descricao,
            numero: 0,
            catalogoId: novo.id,
            versaoEstruturaAtributos: prod.versaoEstruturaAtributos,
            criadoPor: prod.criadoPor,
            atributos: attr
              ? {
                  create: {
                    valoresJson: attr.valoresJson as Prisma.InputJsonValue,
                    estruturaSnapshotJson: attr.estruturaSnapshotJson as Prisma.InputJsonValue,
                    validadoEm: attr.validadoEm,
                    errosValidacao: attr.errosValidacao as Prisma.InputJsonValue
                  }
                }
              : undefined,
            codigosInternos: prod.codigosInternos.length
              ? {
                  create: prod.codigosInternos.map((ci) => ({ codigo: ci.codigo }))
                }
              : undefined,
            operadoresEstrangeiros: prod.operadoresEstrangeiros.length
              ? {
                  create: prod.operadoresEstrangeiros.map((oe) => ({
                    paisCodigo: oe.paisCodigo,
                    conhecido: oe.conhecido,
                    operadorEstrangeiroId: oe.operadorEstrangeiroId
                      ? opMap.get(oe.operadorEstrangeiroId) || null
                      : null
                  }))
                }
              : undefined
          }
        });
      }

      return novo;
    });
  }

  async vincularCertificado(id: number, certificadoId: number, superUserId: number): Promise<void> {
    await catalogoPrisma.catalogo.updateMany({
      where: { id, superUserId },
      data: { certificadoId }
    });
  }

  async obterCertificadoPath(id: number, superUserId: number): Promise<string | null> {
    const catalogo = await catalogoPrisma.catalogo.findFirst({
      where: { id, superUserId },
      select: { certificado: { select: { pfxPath: true } } }
    });
    return catalogo?.certificado?.pfxPath || null;
  }
}