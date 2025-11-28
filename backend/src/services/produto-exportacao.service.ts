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

export interface FabricanteExportacaoDTO {
  seq: number;
  codigoPais: string;
  cpfCnpjRaiz: string | null;
  codigoOperadorEstrangeiro: string | null;
  conhecido: boolean;
  codigoProduto: string | null;
  vincular: true;
}

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
  codigosInterno: string[];
}

interface ProdutoComAtributos {
  id: number;
  codigo: string | null;
  versao: number | null;
  status: string;
  situacao: string;
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
    usuario: AuthUser,
    opcoes?: { tipo?: AsyncJobTipo; arquivoNomePrefixo?: string }
  ) {
    const idsSelecionados = await this.produtoService.resolverSelecaoProdutos(dados, superUserId, {
      mensagemErroVazio: 'Nenhum produto selecionado para exportação',
      mensagemErroConsulta: 'Nenhum produto correspondente encontrado para exportação',
    });

    if (!idsSelecionados.length) {
      throw new ValidationError({ produtos: 'Nenhum produto selecionado para exportação' });
    }

    const arquivoNomeBasePrefixo = opcoes?.arquivoNomePrefixo ?? 'produtos-siscomex';
    const arquivoNomeBase = `${arquivoNomeBasePrefixo}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

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

      const tipoExportacao = opcoes?.tipo ?? AsyncJobTipo.EXPORTACAO_PRODUTO;

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
        situacao: true,
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

  async buscarFabricantesVinculados(ids: number[], superUserId: number) {
    if (!ids.length) {
      return [];
    }

    return catalogoPrisma.operadorEstrangeiroProduto.findMany({
      where: {
        produtoId: { in: ids },
        produto: { catalogo: { superUserId } },
      },
      include: {
        operadorEstrangeiro: { select: { codigo: true } },
        produto: {
          select: {
            codigo: true,
            catalogo: { select: { cpf_cnpj: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  transformarParaSiscomex(produtos: ProdutoComAtributos[]): ProdutoExportacaoProdutoDTO[] {
    return produtos.map(produto => {
      const simples: ProdutoExportacaoProdutoDTO['atributos'] = [];
      const multivalorados: ProdutoExportacaoProdutoDTO['atributosMultivalorados'] = [];
      const compostos = new Map<string, Array<{ atributo: string; valor: unknown }>>();
      const compostosMultivalorados = new Map<string, Map<number, Array<{ atributo: string; valor: unknown }>>>();

      const valoresPorCodigo = new Map<string, unknown[]>();

      for (const registro of produto.atributos) {
        if (!registro.atributo?.codigo) continue;
        valoresPorCodigo.set(registro.atributo.codigo, this.normalizarValores(registro.valores));
      }

      for (const registro of produto.atributos) {
        if (!registro.atributo) continue;
        const codigo = registro.atributo.codigo;
        const parentCodigo = registro.atributo.parentCodigo;
        const parent = registro.atributo.parent;

        const valoresNormalizados = this.normalizarValores(registro.valores);
        const valoresOriginais = registro.valores.map(item => item.valorJson as unknown);
        const codigoCondicionante = registro.atributo.condicionanteCodigo ?? (!parent ? parentCodigo : null);
        const isCondicional = !!codigoCondicionante && !parent;
        const isComposto = !!parentCodigo && !!parent;

        if (!parentCodigo || isCondicional) {
          if (isCondicional) {
            const condicaoAtendida = this.condicaoCondicionalAtendida(codigoCondicionante, valoresPorCodigo);
            if (!condicaoAtendida || valoresNormalizados.length === 0) {
              continue;
            }
          }

          if (registro.atributo.multivalorado) {
            multivalorados.push({ atributo: codigo, valores: isCondicional ? valoresNormalizados : valoresOriginais });
          } else {
            const valoresParaExportar = isCondicional ? valoresNormalizados : valoresOriginais;
            simples.push({
              atributo: codigo,
              valor: valoresParaExportar.length > 0 ? valoresParaExportar[0] : null,
            });
          }
          continue;
        }

        if (isComposto && parent?.multivalorado) {
          const mapaGrupos = compostosMultivalorados.get(parentCodigo) ?? new Map<number, Array<{ atributo: string; valor: unknown }>>();
          for (const valor of registro.valores) {
            const chave = valor.ordem ?? 0;
            const grupo = mapaGrupos.get(chave) ?? [];
            grupo.push({ atributo: codigo, valor: valor.valorJson as unknown });
            mapaGrupos.set(chave, grupo);
          }
          compostosMultivalorados.set(parentCodigo, mapaGrupos);
        } else if (isComposto) {
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

      const cpfCnpjRaiz = this.obterCpfCnpjRaiz(cpfCnpjSemMascara);
      const versao = typeof produto.versao === 'number' && Number.isFinite(produto.versao) ? String(produto.versao) : '';

      return {
        seq: produto.id,
        codigo: null, // produto.codigo ?? null,
        descricao: produto.descricao,
        denominacao: produto.denominacao,
        modalidade: produto.modalidade,
        ncm: produto.ncmCodigo,
        cpfCnpjRaiz,
        situacao: "Ativado", // produto.situacao,
        versao,
        atributos: simples,
        atributosMultivalorados: multivalorados,
        atributosCompostos,
        atributosCompostosMultivalorados,
        codigosInterno: produto.codigosInternos.map(item => item.codigo),
      };
    });
  }

  transformarFabricantesParaSiscomex(
    vinculos: Array<{
      id: number;
      paisCodigo: string;
      conhecido: boolean;
      operadorEstrangeiro: { codigo: string | null } | null;
      produto: { codigo: string | null; catalogo: { cpf_cnpj: string | null } | null };
    }>
  ): FabricanteExportacaoDTO[] {
    return vinculos.map(vinculo => {
      const cpfCnpjLimpo = vinculo.produto.catalogo?.cpf_cnpj?.replace(/\D/g, '') ?? '';
      const cpfCnpjRaiz = this.obterCpfCnpjRaiz(cpfCnpjLimpo);

      return {
        seq: vinculo.id,
        codigoPais: vinculo.paisCodigo,
        cpfCnpjRaiz,
        codigoOperadorEstrangeiro: vinculo.operadorEstrangeiro?.codigo ?? null,
        conhecido: vinculo.conhecido,
        codigoProduto: vinculo.produto.codigo ?? null,
        vincular: true as const,
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

  private valorPreenchido(valor: unknown): boolean {
    if (valor === null || valor === undefined) return false;
    if (typeof valor === 'string') return valor.trim() !== '';
    return true;
  }

  private normalizarValores(valores: Array<{ valorJson: Prisma.JsonValue }>): unknown[] {
    return valores
      .map(item => item.valorJson as unknown)
      .filter(valor => this.valorPreenchido(valor));
  }

  private condicaoCondicionalAtendida(
    codigoCondicionante: string | null,
    valoresPorCodigo: Map<string, unknown[]>
  ): boolean {
    if (!codigoCondicionante) return true;

    const valores = valoresPorCodigo.get(codigoCondicionante) ?? [];
    return valores.some(valor => this.valorPreenchido(valor));
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

  private obterCpfCnpjRaiz(cpfCnpjSemMascara: string | null | undefined) {
    if (!cpfCnpjSemMascara) {
      return null;
    }

    if (cpfCnpjSemMascara.length <= 11) {
      return cpfCnpjSemMascara;
    }

    return cpfCnpjSemMascara.slice(0, 8);
  }
}
