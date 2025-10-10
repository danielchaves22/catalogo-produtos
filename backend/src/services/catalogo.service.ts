// backend/src/services/catalogo.service.ts
import { CatalogoStatus, CatalogoAmbiente, Prisma } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { AuthUser } from '../interfaces/auth-user';

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
  private readonly catalogoSelect = {
    id: true,
    nome: true,
    cpf_cnpj: true,
    ultima_alteracao: true,
    numero: true,
    status: true,
    ambiente: true,
    superUserId: true,
    certificadoId: true
  } as const;

  /**
   * Lista todos os catálogos
   */
  async listarTodos(superUserId: number) {
    try {
      return await catalogoPrisma.catalogo.findMany({
        where: { superUserId },
        orderBy: { ultima_alteracao: 'desc' },
        select: this.catalogoSelect
      });
    } catch (error: unknown) {
      logger.error('Erro ao listar catálogos:', error);
      throw new Error('Falha ao listar catálogos');
    }
  }

  async listarVisiveis(usuario: AuthUser) {
    try {
      if (usuario.role === 'SUPER') {
        return this.listarTodos(usuario.superUserId);
      }

      const registroUsuario = await catalogoPrisma.usuarioCatalogo.findFirst({
        where: {
          legacyId: usuario.id,
          superUserId: usuario.superUserId
        },
        select: {
          permissoes: {
            select: { codigo: true }
          }
        }
      });

      const permissoes = new Set(
        registroUsuario?.permissoes.map(item => item.codigo) ?? []
      );

      const padroesVisualizacao = ['catalogo.visualizar', 'catalogo.listar'];
      const possuiAcessoCompleto = padroesVisualizacao.some(code => permissoes.has(code));

      const idsPorPermissao = Array.from(permissoes)
        .map(codigo => {
          const match = codigo.match(/^catalogo\.\w*(?:[:.#_-])(\d+)$/i) ||
            codigo.match(/^catalogo\.\w*\[(\d+)\]$/i);
          if (!match?.[1]) return null;
          const id = Number(match[1]);
          return Number.isNaN(id) ? null : id;
        })
        .filter((id): id is number => id !== null);

      if (idsPorPermissao.length > 0) {
        return await catalogoPrisma.catalogo.findMany({
          where: {
            superUserId: usuario.superUserId,
            id: { in: Array.from(new Set(idsPorPermissao)) }
          },
          orderBy: { ultima_alteracao: 'desc' },
          select: this.catalogoSelect
        });
      }

      if (possuiAcessoCompleto) {
        return this.listarTodos(usuario.superUserId);
      }

      return [];
    } catch (error: unknown) {
      logger.error('Erro ao listar catálogos visíveis:', error);
      throw new Error('Falha ao listar catálogos visíveis');
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
          ambiente: true,
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
          ambiente: CatalogoAmbiente.HOMOLOGACAO,
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
          ambiente: true,
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
          ambiente: true,
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




  async alterarAmbiente(id: number, ambiente: CatalogoAmbiente, superUserId: number) {
    try {
      const atual = await catalogoPrisma.catalogo.findFirst({
        where: { id, superUserId },
        select: { ambiente: true }
      });

      if (!atual) {
        throw new Error(`Catalogo ID ${id} nao encontrado`);
      }

      if (atual.ambiente === CatalogoAmbiente.PRODUCAO) {
        throw new Error('Catalogo em PRODUCAO nao pode retornar para HOMOLOGACAO');
      }

      if (atual.ambiente === ambiente) {
        return (await this.buscarPorId(id, superUserId))!;
      }

      if (ambiente !== CatalogoAmbiente.PRODUCAO) {
        throw new Error('Somente a promocao para PRODUCAO e permitida');
      }

      const atualizado = await catalogoPrisma.catalogo.updateMany({
        where: { id, superUserId },
        data: {
          ambiente,
          ultima_alteracao: new Date()
        }
      });

      if (atualizado.count === 0) {
        throw new Error(`Catalogo ID ${id} nao encontrado`);
      }

      return (await this.buscarPorId(id, superUserId))!;
    } catch (error: unknown) {
      if (
        error instanceof Error && (
          error.message.includes('nao encontrado') ||
          error.message.includes('nao pode retornar') ||
          error.message.includes('promocao')
        )
      ) {
        throw error;
      }

      logger.error(`Erro ao alterar ambiente do catalogo ID ${id}:`, error);
      throw new Error(`Falha ao alterar ambiente do catalogo ID ${id}`);
    }
  }



async remover(id: number, superUserId: number): Promise<void> {
  try {
    await catalogoPrisma.$transaction(async (tx) => {
      const catalogo = await tx.catalogo.findFirst({
        where: { id, superUserId },
        select: { id: true }
      });

      if (!catalogo) {
        throw new Error(`Catalogo ID ${id} nao encontrado`);
      }

      const produtos = await tx.produto.findMany({
        where: { catalogoId: catalogo.id },
        select: { id: true }
      });
      const produtoIds = produtos.map((produto) => produto.id);

      if (produtoIds.length > 0) {
        await tx.produtoAtributos.deleteMany({ where: { produtoId: { in: produtoIds } } });
        await tx.codigoInternoProduto.deleteMany({ where: { produtoId: { in: produtoIds } } });
        await tx.operadorEstrangeiroProduto.deleteMany({ where: { produtoId: { in: produtoIds } } });
        await tx.produto.deleteMany({ where: { id: { in: produtoIds } } });
      }

      const operadores = await tx.operadorEstrangeiro.findMany({
        where: { catalogoId: catalogo.id },
        select: { id: true }
      });
      const operadorIds = operadores.map((operador) => operador.id);

      if (operadorIds.length > 0) {
        await tx.identificacaoAdicional.deleteMany({ where: { operadorEstrangeiroId: { in: operadorIds } } });
        await tx.operadorEstrangeiroProduto.deleteMany({ where: { operadorEstrangeiroId: { in: operadorIds } } });
        await tx.operadorEstrangeiro.deleteMany({ where: { id: { in: operadorIds } } });
      }

      await tx.catalogo.delete({ where: { id: catalogo.id } });
    });
  } catch (error: unknown) {
    logger.error(`Erro ao remover catalogo ID ${id}:`, error);
    if (error instanceof Error && error.message.includes('nao encontrado')) {
      throw error;
    }
    throw new Error(`Falha ao remover catalogo ID ${id}`);
  }
}

async clonar(id: number, nome: string, cpf_cnpj: string, superUserId: number) {
  const existenteCpf = await catalogoPrisma.catalogo.findFirst({
    where: { cpf_cnpj, superUserId }
  });
  if (existenteCpf) {
    throw new Error('CNPJ ja esta vinculado a um catalogo !!');
  }

  const existenteNome = await catalogoPrisma.catalogo.findFirst({
    where: { nome, superUserId }
  });
  if (existenteNome) {
    throw new Error('Ja existe um catalogo com este nome');
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
    throw new Error(`Catalogo ID ${id} nao encontrado`);
  }

  return await catalogoPrisma.$transaction(async (tx) => {
    const novo = await tx.catalogo.create({
      data: {
        nome,
        cpf_cnpj,
        status: original.status,
        ambiente: CatalogoAmbiente.HOMOLOGACAO,
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
          numero: 0,
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
          codigo: null,
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
