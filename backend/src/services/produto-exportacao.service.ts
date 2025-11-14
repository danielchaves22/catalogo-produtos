import { AsyncJobTipo, Prisma } from '@prisma/client';
import { AuthUser } from '../interfaces/auth-user';
import { catalogoPrisma } from '../utils/prisma';
import { ProdutoService, RemoverProdutosEmMassaDTO, ListarProdutosFiltro } from './produto.service';
import { ValidationError } from '../types/validation-error';
import { createAsyncJob } from '../jobs/async-job.repository';
import { logger } from '../utils/logger';

type ProdutoExportacaoDelegate = {
  create: (...args: any[]) => Promise<any>;
  update: (...args: any[]) => Promise<any>;
  findUnique: (...args: any[]) => Promise<any>;
};

const catalogoPrismaExportacao = catalogoPrisma as typeof catalogoPrisma & {
  produtoExportacao: ProdutoExportacaoDelegate;
};

export interface ExportarProdutosDTO extends RemoverProdutosEmMassaDTO {}

export interface ProdutoExportacaoSelecao {
  todosFiltrados: boolean;
  filtros?: ListarProdutosFiltro;
  idsSelecionados?: number[];
  idsDeselecionados?: number[];
  busca?: string;
}

export interface ProdutoExportacaoRegistro {
  id: number;
  superUserId: number;
  usuarioCatalogoId: number | null;
  selecao: ProdutoExportacaoSelecao;
  arquivoNome: string | null;
  arquivoPath: string | null;
  arquivoExpiraEm: Date | null;
  arquivoTamanho: number | null;
  totalItens: number | null;
  asyncJobId: number | null;
}

export interface ProdutoExportacaoProdutoDTO {
  seq: number;
  codigo: string | null;
  descricao: string;
  denominacao: string;
  modalidade: string | null;
  ncm: string;
  cpfCnpjRaiz: string | null;
  situacao: string;
  versao: string;
  atributos: Array<{
    atributo: string;
    valor: unknown;
  }>;
  atributosMultivalorados: Array<{
    atributo: string;
    valores: unknown[];
  }>;
  atributosCompostos: Array<{
    atributo: string;
    valores: Array<{ atributo: string; valor: unknown }>;
  }>;
  atributosCompostosMultivalorados: Array<{
    atributo: string;
    valores: Array<Array<{ atributo: string; valor: unknown }>>;
  }>;
  codigosInternos: string[];
}

interface ProdutoComAtributos {
  id: number;
  codigo: string | null;
  versao: number | null;
  status: string;
  descricao: string;
  denominacao: string;
  modalidade: string | null;
  ncmCodigo: string;
  atributos: Array<{
    atributo: {
      codigo: string;
      multivalorado: boolean;
      parentCodigo: string | null;
      condicionanteCodigo: string | null;
      parent?: {
        codigo: string;
        multivalorado: boolean;
      } | null;
    } | null;
    valores: Array<{ valorJson: Prisma.JsonValue; ordem: number }>;
  }>;
  codigosInternos: Array<{ codigo: string }>;
  catalogo: { cpf_cnpj: string | null } | null;
}

export class ProdutoExportacaoService {
  constructor(private readonly produtoService = new ProdutoService()) {}

  async solicitarExportacao(
    dados: ExportarProdutosDTO,
    superUserId: number,
    usuario: AuthUser
  ) {
    const idsSelecionados = await this.produtoService.resolverSelecaoProdutos(dados, superUserId, {
      mensagemErroVazio: 'Nenhum produto selecionado para exportação',
      mensagemErroConsulta: 'Nenhum produto correspondente encontrado para exportação',
    });

    if (!idsSelecionados.length) {
      throw new ValidationError({ produtos: 'Nenhum produto selecionado para exportação' });
    }

    const arquivoNomeBase = `produtos-siscomex-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

    return catalogoPrismaExportacao.$transaction(async tx => {
      const prismaTx = tx as typeof tx & { produtoExportacao: ProdutoExportacaoDelegate };
      const usuarioCatalogoId = await this.obterUsuarioCatalogoId(superUserId, usuario);

      const exportacao = await prismaTx.produtoExportacao.create({
        data: {
          superUserId,
          usuarioCatalogoId,
          todosFiltrados: dados.todosFiltrados,
          filtrosJson: dados.filtros ? (dados.filtros as Prisma.InputJsonValue) : Prisma.JsonNull,
          idsSelecionadosJson: dados.todosFiltrados ? Prisma.JsonNull : ((dados.idsSelecionados ?? idsSelecionados) as Prisma.InputJsonValue),
          idsDeselecionadosJson: dados.todosFiltrados ? ((dados.idsDeselecionados ?? []) as Prisma.InputJsonValue) : Prisma.JsonNull,
          busca: dados.busca?.trim() || null,
          arquivoNome: arquivoNomeBase,
        },
      });

      const tipoExportacao = 'EXPORTACAO_PRODUTO' as unknown as AsyncJobTipo;

      const job = await createAsyncJob(
        {
          tipo: tipoExportacao,
          payload: {
            exportacaoId: exportacao.id,
            superUserId,
          },
          arquivo: {
            nome: arquivoNomeBase,
          },
        },
        tx
      );

      await prismaTx.produtoExportacao.update({
        where: { id: exportacao.id },
        data: { asyncJobId: job.id },
      });

      return { exportacaoId: exportacao.id, jobId: job.id };
    });
  }

  async obterExportacaoPorId(id: number): Promise<ProdutoExportacaoRegistro | null> {
    const registro = await catalogoPrismaExportacao.produtoExportacao.findUnique({
      where: { id },
      select: {
        id: true,
        superUserId: true,
        usuarioCatalogoId: true,
        todosFiltrados: true,
        filtrosJson: true,
        idsSelecionadosJson: true,
        idsDeselecionadosJson: true,
        busca: true,
        arquivoNome: true,
        arquivoPath: true,
        arquivoExpiraEm: true,
        arquivoTamanho: true,
        totalItens: true,
        asyncJobId: true,
      },
    });

    if (!registro) {
      return null;
    }

    return {
      id: registro.id,
      superUserId: registro.superUserId,
      usuarioCatalogoId: registro.usuarioCatalogoId,
      arquivoNome: registro.arquivoNome,
      arquivoPath: registro.arquivoPath,
      arquivoExpiraEm: registro.arquivoExpiraEm,
      arquivoTamanho: registro.arquivoTamanho,
      totalItens: registro.totalItens,
      asyncJobId: registro.asyncJobId,
      selecao: {
        todosFiltrados: registro.todosFiltrados,
        filtros: (registro.filtrosJson as ListarProdutosFiltro | undefined) ?? undefined,
        idsSelecionados: this.converterJsonParaArray(registro.idsSelecionadosJson),
        idsDeselecionados: this.converterJsonParaArray(registro.idsDeselecionadosJson),
        busca: registro.busca ?? undefined,
      },
    };
  }

  async atualizarMetadadosArquivo(
    exportacaoId: number,
    dados: {
      arquivoPath?: string | null;
      arquivoExpiraEm?: Date | null;
      arquivoTamanho?: number | null;
      totalItens?: number | null;
    }
  ) {
    await catalogoPrismaExportacao.produtoExportacao.update({
      where: { id: exportacaoId },
      data: {
        arquivoPath: dados.arquivoPath ?? null,
        arquivoExpiraEm: dados.arquivoExpiraEm ?? null,
        arquivoTamanho: dados.arquivoTamanho ?? null,
        totalItens: dados.totalItens ?? null,
      },
    });
  }

  montarSelecaoParaProdutoService(registro: ProdutoExportacaoRegistro): RemoverProdutosEmMassaDTO {
    return {
      todosFiltrados: registro.selecao.todosFiltrados,
      filtros: registro.selecao.filtros,
      idsSelecionados: registro.selecao.idsSelecionados,
      idsDeselecionados: registro.selecao.idsDeselecionados,
      busca: registro.selecao.busca,
    };
  }

  async resolverIdsSelecionados(
    registro: ProdutoExportacaoRegistro,
    superUserId: number
  ): Promise<number[]> {
    const selecao = this.montarSelecaoParaProdutoService(registro);
    return this.produtoService.resolverSelecaoProdutos(selecao, superUserId, {
      mensagemErroVazio: 'Nenhum produto selecionado para exportação',
      mensagemErroConsulta: 'Nenhum produto correspondente encontrado para exportação',
    });
  }

  async buscarProdutosComAtributos(ids: number[], superUserId: number): Promise<ProdutoComAtributos[]> {
    if (!ids.length) {
      return [];
    }

    const produtos = await catalogoPrisma.produto.findMany({
      where: {
        id: { in: ids },
        catalogo: { superUserId },
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        codigo: true,
        versao: true,
        status: true,
        descricao: true,
        denominacao: true,
        modalidade: true,
        ncmCodigo: true,
        catalogo: { select: { cpf_cnpj: true } },
        atributos: {
          include: {
            atributo: {
              select: {
                codigo: true,
                multivalorado: true,
                parentCodigo: true,
                condicionanteCodigo: true,
                parent: {
                  select: {
                    codigo: true,
                    multivalorado: true,
                  },
                },
              },
            },
            valores: { orderBy: { ordem: 'asc' } },
          },
        },
        codigosInternos: { select: { codigo: true } },
      },
    });

    return produtos as unknown as ProdutoComAtributos[];
  }

  transformarParaSiscomex(produtos: ProdutoComAtributos[]): ProdutoExportacaoProdutoDTO[] {
    return produtos.map((produto, index) => {
      const simples: ProdutoExportacaoProdutoDTO['atributos'] = [];
      const multivalorados: ProdutoExportacaoProdutoDTO['atributosMultivalorados'] = [];
      const compostos = new Map<string, Array<{ atributo: string; valor: unknown }>>();
      const compostosMultivalorados = new Map<string, Map<number, Array<{ atributo: string; valor: unknown }>>>();

      for (const registro of produto.atributos) {
        if (!registro.atributo) continue;
        const codigo = registro.atributo.codigo;
        const parentCodigo = registro.atributo.parentCodigo;
        const parent = registro.atributo.parent;

        if (!parentCodigo) {
          const valoresSimples = registro.valores.map(item => item.valorJson as unknown);
          if (registro.atributo.multivalorado) {
            multivalorados.push({ atributo: codigo, valores: valoresSimples });
          } else {
            simples.push({ atributo: codigo, valor: valoresSimples.length > 0 ? valoresSimples[0] : null });
          }
          continue;
        }

        if (parent?.multivalorado) {
          const mapaGrupos = compostosMultivalorados.get(parentCodigo) ?? new Map<number, Array<{ atributo: string; valor: unknown }>>();
          for (const valor of registro.valores) {
            const chave = valor.ordem ?? 0;
            const grupo = mapaGrupos.get(chave) ?? [];
            grupo.push({ atributo: codigo, valor: valor.valorJson as unknown });
            mapaGrupos.set(chave, grupo);
          }
          compostosMultivalorados.set(parentCodigo, mapaGrupos);
        } else {
          const listaValores = compostos.get(parentCodigo) ?? [];
          for (const valor of registro.valores) {
            listaValores.push({ atributo: codigo, valor: valor.valorJson as unknown });
          }
          compostos.set(parentCodigo, listaValores);
        }
      }

      const atributosCompostos = Array.from(compostos.entries()).map(([atributo, valores]) => ({
        atributo,
        valores,
      }));

      const atributosCompostosMultivalorados = Array.from(compostosMultivalorados.entries()).map(
        ([atributo, grupos]) => ({
          atributo,
          valores: Array.from(grupos.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, valores]) => valores),
        })
      );

      const cpfCnpjSemMascara = produto.catalogo?.cpf_cnpj
        ? produto.catalogo.cpf_cnpj.replace(/\D/g, '')
        : '';

      let cpfCnpjRaiz: string | null = null;

      if (cpfCnpjSemMascara) {
        if (cpfCnpjSemMascara.length <= 11) {
          cpfCnpjRaiz = cpfCnpjSemMascara;
        } else {
          cpfCnpjRaiz = cpfCnpjSemMascara.slice(0, 8);
        }
      }
      const versao = typeof produto.versao === 'number' && Number.isFinite(produto.versao) ? String(produto.versao) : '';

      return {
        seq: index + 1,
        codigo: produto.codigo ?? null,
        descricao: produto.descricao,
        denominacao: produto.denominacao,
        modalidade: produto.modalidade,
        ncm: produto.ncmCodigo,
        cpfCnpjRaiz,
        situacao: produto.status,
        versao,
        atributos: simples,
        atributosMultivalorados: multivalorados,
        atributosCompostos,
        atributosCompostosMultivalorados,
        codigosInternos: produto.codigosInternos.map(item => item.codigo),
      };
    });
  }

  private async obterUsuarioCatalogoId(superUserId: number, usuario: AuthUser): Promise<number | null> {
    try {
      const usuarioCatalogo = await catalogoPrisma.usuarioCatalogo.findFirst({
        where: {
          superUserId,
          legacyId: usuario.id,
        },
        select: { id: true },
      });

      return usuarioCatalogo?.id ?? null;
    } catch (error) {
      logger.warn('Falha ao localizar usuário de catálogo para exportação', error);
      return null;
    }
  }

  private converterJsonParaArray(valor: Prisma.JsonValue | null): number[] | undefined {
    const isJsonNull = valor === null || (valor as unknown) === (Prisma.JsonNull as unknown);
    if (isJsonNull) {
      return undefined;
    }
    if (Array.isArray(valor)) {
      return valor
        .map(item => (typeof item === 'number' ? item : Number(item)))
        .filter(item => Number.isFinite(item)) as number[];
    }
    return undefined;
  }
}
