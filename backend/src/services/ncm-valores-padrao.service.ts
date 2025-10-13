// backend/src/services/ncm-valores-padrao.service.ts
import { Prisma } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';
import {
  AtributoLegacyService,
  EstruturaComVersao,
  AtributoEstruturaDTO
} from './atributo-legacy.service';

type GrupoComValores = Prisma.NcmAtributoValorGrupoGetPayload<{
  include: {
    valores: {
      include: {
        atributo: { select: { codigo: true; multivalorado: boolean } }
      };
    };
    catalogos?: {
      orderBy?: { catalogo: { nome: 'asc' } };
      include: {
        catalogo: { select: { id: true; nome: true; numero: true; cpf_cnpj: true } };
      };
    };
  };
}>;

export interface NcmValoresPadraoCreateInput {
  ncmCodigo: string;
  modalidade?: string | null;
  valoresAtributos?: Prisma.InputJsonValue;
  estruturaSnapshot?: Prisma.InputJsonValue;
  catalogoIds: number[];
}

export interface NcmValoresPadraoUpdateInput {
  ncmCodigo?: string;
  modalidade?: string | null;
  valoresAtributos?: Prisma.InputJsonValue;
  estruturaSnapshot?: Prisma.InputJsonValue;
  catalogoIds?: number[];
}

export class NcmValoresPadraoService {
  private atributosService = new AtributoLegacyService();

  async listar(superUserId: number) {
    const grupos = await catalogoPrisma.ncmAtributoValorGrupo.findMany({
      where: { superUserId },
      include: {
        valores: {
          orderBy: { ordem: 'asc' },
          include: {
            atributo: { select: { codigo: true, multivalorado: true } }
          }
        },
        catalogos: {
          orderBy: {
            catalogo: {
              nome: 'asc'
            }
          },
          include: {
            catalogo: {
              select: { id: true, nome: true, numero: true, cpf_cnpj: true }
            }
          }
        }
      },
      orderBy: [{ atualizadoEm: 'desc' }, { ncmCodigo: 'asc' }]
    });

    return Promise.all(grupos.map(grupo => this.montarResposta(grupo)));
  }

  async buscarPorId(id: number, superUserId: number) {
    const grupo = await catalogoPrisma.ncmAtributoValorGrupo.findFirst({
      where: { id, superUserId },
      include: {
        valores: {
          orderBy: { ordem: 'asc' },
          include: {
            atributo: { select: { codigo: true, multivalorado: true } }
          }
        },
        catalogos: {
          orderBy: {
            catalogo: {
              nome: 'asc'
            }
          },
          include: {
            catalogo: {
              select: { id: true, nome: true, numero: true, cpf_cnpj: true }
            }
          }
        }
      }
    });

    if (!grupo) return null;

    return this.montarResposta(grupo);
  }

  async buscarPorNcm(
    ncmCodigo: string,
    superUserId: number,
    modalidade?: string | null,
    catalogoId?: number
  ) {
    const modalidadeNormalizada = modalidade?.toUpperCase() ?? null;
    const grupo = await catalogoPrisma.ncmAtributoValorGrupo.findFirst({
      where: {
        ncmCodigo,
        superUserId,
        modalidade: modalidadeNormalizada,
        ...(catalogoId
          ? {
              catalogos: {
                some: {
                  catalogoId
                }
              }
            }
          : {})
      }
    });

    if (!grupo) return null;

    const carregado = await catalogoPrisma.ncmAtributoValorGrupo.findFirst({
      where: { id: grupo.id },
      include: {
        valores: {
          orderBy: { ordem: 'asc' },
          include: {
            atributo: { select: { codigo: true, multivalorado: true } }
          }
        },
        catalogos: {
          orderBy: {
            catalogo: {
              nome: 'asc'
            }
          },
          include: {
            catalogo: {
              select: { id: true, nome: true, numero: true, cpf_cnpj: true }
            }
          }
        }
      }
    });

    if (!carregado) return null;

    return this.montarResposta(carregado);
  }

  async criar(
    dados: NcmValoresPadraoCreateInput,
    superUserId: number,
    usuario?: { nome?: string }
  ) {
    const modalidadeNormalizada = dados.modalidade?.toUpperCase() ?? null;
    if (!dados.catalogoIds?.length) {
      throw new Error('Informe ao menos um catálogo para aplicar os valores padrão.');
    }

    const catalogoIdsUnicos = Array.from(new Set(dados.catalogoIds));
    const catalogosValidos = await catalogoPrisma.catalogo.findMany({
      where: {
        id: { in: catalogoIdsUnicos },
        superUserId
      },
      select: { id: true }
    });

    if (catalogosValidos.length !== catalogoIdsUnicos.length) {
      throw new Error('Catálogo inválido para o superusuário informado.');
    }

    const existente = await catalogoPrisma.ncmAtributoValorGrupo.findFirst({
      where: {
        ncmCodigo: dados.ncmCodigo,
        superUserId,
        modalidade: modalidadeNormalizada
      }
    });
    if (existente) {
      throw new Error('Já existe um valor padrão cadastrado para esta NCM e modalidade');
    }

    const estruturaInfo = await this.obterEstruturaAtributos(
      dados.ncmCodigo,
      modalidadeNormalizada || 'IMPORTACAO'
    );

    const valores = (dados.valoresAtributos ?? {}) as Record<string, any>;

    const grupo = await catalogoPrisma.$transaction(async prisma => {
      const registro = await prisma.ncmAtributoValorGrupo.create({
        data: {
          superUserId,
          ncmCodigo: dados.ncmCodigo,
          modalidade: modalidadeNormalizada,
          atributoVersaoId: estruturaInfo.versaoId,
          criadoPor: usuario?.nome || null,
          atualizadoPor: usuario?.nome || null
        }
      });

      await this.salvarValoresPadrao(prisma, registro.id, estruturaInfo, valores);

      await prisma.ncmAtributoValorCatalogo.createMany({
        data: catalogoIdsUnicos.map(catalogoId => ({
          grupoId: registro.id,
          catalogoId
        }))
      });

      return registro.id;
    });

    return this.buscarPorId(grupo, superUserId);
  }

  async atualizar(
    id: number,
    dados: NcmValoresPadraoUpdateInput,
    superUserId: number,
    usuario?: { nome?: string }
  ) {
    const existente = await catalogoPrisma.ncmAtributoValorGrupo.findFirst({
      where: { id, superUserId }
    });
    if (!existente) {
      throw new Error('Grupo de valores padrão não encontrado');
    }

    if (dados.ncmCodigo && dados.ncmCodigo !== existente.ncmCodigo) {
      throw new Error('Não é permitido alterar a NCM do valor padrão');
    }

    if (dados.modalidade && dados.modalidade.toUpperCase() !== existente.modalidade) {
      throw new Error('Não é permitido alterar a modalidade do valor padrão');
    }

    if (dados.catalogoIds && dados.catalogoIds.length === 0) {
      throw new Error('Informe ao menos um catálogo para aplicar os valores padrão.');
    }

    const catalogoIdsUnicos = dados.catalogoIds
      ? Array.from(new Set(dados.catalogoIds))
      : undefined;

    if (catalogoIdsUnicos) {
      const catalogosValidos = await catalogoPrisma.catalogo.findMany({
        where: {
          id: { in: catalogoIdsUnicos },
          superUserId
        },
        select: { id: true }
      });

      if (catalogosValidos.length !== catalogoIdsUnicos.length) {
        throw new Error('Catálogo inválido para o superusuário informado.');
      }
    }

    const estruturaInfo = await this.obterEstruturaAtributos(
      existente.ncmCodigo,
      existente.modalidade || 'IMPORTACAO'
    );

    const valores = (dados.valoresAtributos ?? {}) as Record<string, any>;

    await catalogoPrisma.$transaction(async prisma => {
      await prisma.ncmAtributoValorGrupo.update({
        where: { id },
        data: {
          atributoVersaoId: estruturaInfo.versaoId,
          atualizadoPor: usuario?.nome || null
        }
      });

      if (catalogoIdsUnicos) {
        await prisma.ncmAtributoValorCatalogo.deleteMany({
          where: {
            grupoId: id,
            catalogoId: { notIn: catalogoIdsUnicos }
          }
        });

        const existentesCatalogos = await prisma.ncmAtributoValorCatalogo.findMany({
          where: { grupoId: id },
          select: { catalogoId: true }
        });
        const existentesSet = new Set(existentesCatalogos.map(item => item.catalogoId));

        const novosCatalogos = catalogoIdsUnicos.filter(catalogoId => !existentesSet.has(catalogoId));
        if (novosCatalogos.length > 0) {
          await prisma.ncmAtributoValorCatalogo.createMany({
            data: novosCatalogos.map(catalogoId => ({ grupoId: id, catalogoId }))
          });
        }
      }

      if (dados.valoresAtributos !== undefined) {
        await prisma.ncmAtributoValor.deleteMany({ where: { grupoId: id } });
        await this.salvarValoresPadrao(prisma, id, estruturaInfo, valores);
      }
    });

    return this.buscarPorId(id, superUserId);
  }

  async remover(id: number, superUserId: number) {
    const existente = await catalogoPrisma.ncmAtributoValorGrupo.findFirst({
      where: { id, superUserId }
    });
    if (!existente) {
      throw new Error('Grupo de valores padrão não encontrado');
    }

    await catalogoPrisma.ncmAtributoValorGrupo.delete({ where: { id } });
  }

  private async montarResposta(grupo: GrupoComValores) {
    const estrutura = await this.atributosService.buscarEstruturaPorVersao(
      grupo.atributoVersaoId
    );
    const valoresJson = this.montarMapaValores(grupo.valores ?? []);
    return {
      id: grupo.id,
      superUserId: grupo.superUserId,
      ncmCodigo: grupo.ncmCodigo,
      modalidade: grupo.modalidade,
      atributoVersaoId: grupo.atributoVersaoId,
      criadoEm: grupo.criadoEm,
      atualizadoEm: grupo.atualizadoEm,
      criadoPor: grupo.criadoPor,
      atualizadoPor: grupo.atualizadoPor,
      valoresJson,
      estruturaSnapshotJson: estrutura?.estrutura ?? [],
      catalogos: grupo.catalogos ?? []
    };
  }

  private async obterEstruturaAtributos(
    ncmCodigo: string,
    modalidade: string
  ): Promise<EstruturaComVersao> {
    return this.atributosService.buscarEstrutura(
      ncmCodigo,
      modalidade || 'IMPORTACAO'
    );
  }

  private mapearEstruturaPorCodigo(
    estrutura: AtributoEstruturaDTO[]
  ): Map<string, AtributoEstruturaDTO> {
    const mapa = new Map<string, AtributoEstruturaDTO>();
    const percorrer = (lista: AtributoEstruturaDTO[]) => {
      for (const item of lista) {
        mapa.set(item.codigo, item);
        if (item.subAtributos) percorrer(item.subAtributos);
      }
    };
    percorrer(estrutura);
    return mapa;
  }

  private montarMapaValores(
    valores: Array<{
      atributo: { codigo: string; multivalorado: boolean } | null;
      valorJson: Prisma.JsonValue;
    }>
  ): Record<string, any> {
    const resultado: Record<string, any> = {};
    for (const registro of valores) {
      if (!registro.atributo) continue;
      const codigo = registro.atributo.codigo;
      if (registro.atributo.multivalorado) {
        if (!resultado[codigo]) resultado[codigo] = [];
        resultado[codigo].push(registro.valorJson as any);
      } else {
        resultado[codigo] = registro.valorJson as any;
      }
    }
    return resultado;
  }

  private normalizarValorEntrada(valor: any): any[] {
    if (Array.isArray(valor)) {
      return valor.flatMap(item => this.normalizarValorEntrada(item));
    }
    if (valor === undefined || valor === null) return [];
    return [valor];
  }

  private async salvarValoresPadrao(
    prisma: Prisma.TransactionClient,
    grupoId: number,
    estruturaInfo: EstruturaComVersao,
    valores: Record<string, any>
  ) {
    const mapa = this.mapearEstruturaPorCodigo(estruturaInfo.estrutura);
    for (const [codigo, valor] of Object.entries(valores)) {
      const atributo = mapa.get(codigo);
      if (!atributo?.id) continue;
      const valoresNormalizados = this.normalizarValorEntrada(valor);
      if (!valoresNormalizados.length) continue;

      await prisma.ncmAtributoValor.createMany({
        data: valoresNormalizados.map((item, ordem) => ({
          grupoId,
          atributoId: atributo.id!,
          valorJson: item as Prisma.InputJsonValue,
          ordem
        }))
      });
    }
  }
}
