// backend/src/services/produto.service.ts
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { Prisma } from '@prisma/client';
import {
  AtributoLegacyService,
  AtributoEstruturaDTO,
  EstruturaComVersao
} from './atributo-legacy.service';
import { ValidationError } from '../types/validation-error';

export interface CreateProdutoDTO {
  codigo?: string;
  ncmCodigo: string;
  modalidade: string;
  catalogoId: number;
  denominacao: string;
  descricao: string;
  valoresAtributos?: Prisma.InputJsonValue;
  codigosInternos?: string[];
  operadoresEstrangeiros?: OperadorEstrangeiroProdutoInput[];
  criadoPor?: string;
  situacao?: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';
}

export interface UpdateProdutoDTO {
  modalidade?: string;
  status?: 'PENDENTE' | 'APROVADO' | 'PROCESSANDO' | 'TRANSMITIDO' | 'ERRO';
  situacao?: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';
  denominacao?: string;
  descricao?: string;
  valoresAtributos?: Prisma.InputJsonValue;
  codigosInternos?: string[];
  operadoresEstrangeiros?: OperadorEstrangeiroProdutoInput[];
  atualizadoPor?: string;
}

export interface OperadorEstrangeiroProdutoInput {
  paisCodigo: string;
  conhecido: boolean;
  operadorEstrangeiroId?: number;
}

export interface CloneProdutoDTO {
  catalogoId: number;
  denominacao: string;
  codigosInternos?: string[];
}

export interface ListarProdutosFiltro {
  status?: Array<'PENDENTE' | 'APROVADO' | 'PROCESSANDO' | 'TRANSMITIDO' | 'ERRO'>;
  situacoes?: Array<'RASCUNHO' | 'ATIVADO' | 'DESATIVADO'>;
  ncm?: string;
  catalogoId?: number;
  busca?: string;
}

export interface ProdutoListItemDTO {
  id: number;
  codigo: string | null;
  ncmCodigo: string;
  status: 'PENDENTE' | 'APROVADO' | 'PROCESSANDO' | 'TRANSMITIDO' | 'ERRO';
  situacao: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';
  modalidade: string | null;
  denominacao: string;
  descricao: string;
  atualizadoEm: Date;
  catalogoId: number;
  catalogoNumero?: number | null;
  catalogoNome?: string | null;
  catalogoCpfCnpj?: string | null;
  catalogoAmbiente?: 'HOMOLOGACAO' | 'PRODUCAO' | null;
  codigosInternos: string[];
}

export interface ListarProdutosPaginacao {
  page?: number;
  pageSize?: number;
}

export interface ListarProdutosResponse {
  items: ProdutoListItemDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export class ProdutoService {
  private atributosService = new AtributoLegacyService();
  async listarTodos(
    filtros: ListarProdutosFiltro = {},
    superUserId: number,
    paginacao: ListarProdutosPaginacao = {}
  ): Promise<ListarProdutosResponse> {
    const where: Prisma.ProdutoWhereInput = {
      catalogo: { superUserId }
    };
    if (filtros.status?.length) {
      where.status = { in: filtros.status };
    }
    if (filtros.ncm) where.ncmCodigo = filtros.ncm;
    if (filtros.situacoes?.length) {
      where.situacao = { in: filtros.situacoes };
    }
    if (filtros.catalogoId) where.catalogoId = filtros.catalogoId;

    if (filtros.busca?.trim()) {
      const termo = filtros.busca.trim();
      const like = {
        contains: termo,
        mode: 'insensitive' as const
      };

      where.OR = [
        { denominacao: like },
        { descricao: like },
        { codigo: like },
        {
          codigosInternos: {
            some: {
              codigo: like
            }
          }
        }
      ];
    }

    const page = Math.max(1, paginacao.page ?? 1);
    const size = Math.max(1, Math.min(paginacao.pageSize ?? 20, 100));

    const total = await catalogoPrisma.produto.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / size));
    const paginaAjustada = Math.min(page, totalPages);
    const skip = (paginaAjustada - 1) * size;

    const produtos = await catalogoPrisma.produto.findMany({
      where,
      orderBy: { atualizadoEm: 'desc' },
      skip,
      take: size,
      select: {
        id: true,
        codigo: true,
        ncmCodigo: true,
        status: true,
        situacao: true,
        modalidade: true,
        denominacao: true,
        descricao: true,
        atualizadoEm: true,
        catalogoId: true,
        catalogo: {
          select: {
            numero: true,
            nome: true,
            cpf_cnpj: true,
            ambiente: true
          }
        },
        codigosInternos: {
          select: {
            codigo: true
          }
        }
      }
    });

    const items: ProdutoListItemDTO[] = produtos.map(p => ({
      id: p.id,
      codigo: p.codigo ?? null,
      ncmCodigo: p.ncmCodigo,
      status: p.status,
      situacao: p.situacao,
      modalidade: p.modalidade ?? null,
      denominacao: p.denominacao,
      descricao: p.descricao,
      atualizadoEm: p.atualizadoEm,
      catalogoId: p.catalogoId,
      catalogoNumero: p.catalogo?.numero,
      catalogoNome: p.catalogo?.nome,
      catalogoCpfCnpj: p.catalogo?.cpf_cnpj,
      catalogoAmbiente: p.catalogo?.ambiente,
      codigosInternos: p.codigosInternos.map(ci => ci.codigo)
    }));

    return {
      items,
      total,
      page: paginaAjustada,
      pageSize: size
    };
  }

  async buscarPorId(id: number, superUserId: number) {
    const p = await catalogoPrisma.produto.findFirst({
      where: { id, catalogo: { superUserId } },
      include: {
        atributos: {
          include: {
            atributo: { select: { codigo: true, multivalorado: true } },
            valores: { orderBy: { ordem: 'asc' } }
          }
        },
        estruturaVersao: true,
        catalogo: true,
        codigosInternos: true,
        operadoresEstrangeiros: { include: { pais: true, operadorEstrangeiro: true } }
      }
    });
    if (!p) return null;

    const estrutura = p.versaoAtributoId
      ? await this.atributosService.buscarEstruturaPorVersao(p.versaoAtributoId)
      : null;

    const valoresMap = this.montarValoresDosAtributos(p.atributos);

    return {
      ...p,
      numero: p.numero,
      atributos: [
        {
          valoresJson: valoresMap,
          estruturaSnapshotJson: estrutura?.estrutura ?? []
        }
      ],
      versaoEstruturaAtributos: estrutura?.versaoNumero ?? p.versaoEstruturaAtributos,
      codigosInternos: p.codigosInternos.map(ci => ci.codigo),
      operadoresEstrangeiros: p.operadoresEstrangeiros.map(o => ({
        id: o.id,
        paisCodigo: o.paisCodigo,
        paisNome: o.pais.nome,
        conhecido: o.conhecido,
        operadorEstrangeiroId: o.operadorEstrangeiroId,
        operadorEstrangeiro: o.operadorEstrangeiro
      })),
      catalogoNumero: p.catalogo?.numero,
      catalogoNome: p.catalogo?.nome,
      catalogoCpfCnpj: p.catalogo?.cpf_cnpj,
      catalogoAmbiente: p.catalogo?.ambiente
    };
  }

  async criar(data: CreateProdutoDTO, superUserId: number) {
    const estruturaInfo = await this.obterEstruturaAtributos(
      data.ncmCodigo,
      data.modalidade
    );

    const estrutura = estruturaInfo.estrutura;

    const erros = this.validarValores(
      (data.valoresAtributos ?? {}) as Record<string, any>,
      estrutura
    );
    if (Object.keys(erros).length > 0) {
      throw new ValidationError(erros);
    }

    const preencheuObrigatorios = this.todosObrigatoriosPreenchidos(
      (data.valoresAtributos ?? {}) as Record<string, any>,
      estrutura
    );

    const catalogo = await catalogoPrisma.catalogo.findFirst({
      where: { id: data.catalogoId, superUserId }
    });
    if (!catalogo) {
      throw new Error('Catálogo não encontrado para o superusuário');
    }

    const produto = await catalogoPrisma.$transaction(async (tx) => {
      const novoProduto = await tx.produto.create({
        data: {
          codigo: data.codigo ?? null,
          versao: 1,
          status: preencheuObrigatorios ? 'APROVADO' : 'PENDENTE',
          situacao: data.situacao ?? undefined,
          ncmCodigo: data.ncmCodigo,
          modalidade: data.modalidade,
          denominacao: data.denominacao,
          descricao: data.descricao,
          numero: 0,
          catalogoId: data.catalogoId,
          versaoEstruturaAtributos: estruturaInfo.versaoNumero,
          versaoAtributoId: estruturaInfo.versaoId,
          criadoPor: data.criadoPor || null,
          codigosInternos: data.codigosInternos
            ? { create: data.codigosInternos.map(c => ({ codigo: c })) }
            : undefined
          ,
          operadoresEstrangeiros: data.operadoresEstrangeiros
            ? {
                create: data.operadoresEstrangeiros.map(o => ({
                  paisCodigo: o.paisCodigo,
                  conhecido: o.conhecido,
                  operadorEstrangeiroId: o.operadorEstrangeiroId ?? null
                }))
            }
          : undefined
        },
        include: { codigosInternos: true, operadoresEstrangeiros: true }
      });

      await this.salvarValoresProduto(
        tx,
        novoProduto.id,
        estruturaInfo,
        (data.valoresAtributos ?? {}) as Record<string, any>
      );

      return novoProduto;
    });

    return this.buscarPorId(produto.id, superUserId);
  }

  async atualizar(id: number, data: UpdateProdutoDTO, superUserId: number) {
    const atual = await catalogoPrisma.produto.findFirst({
      where: { id, catalogo: { superUserId } },
      include: {
        atributos: {
          include: {
            atributo: { select: { codigo: true, multivalorado: true } },
            valores: { orderBy: { ordem: 'asc' } }
          }
        }
      }
    });
    if (!atual) {
      throw new Error(`Produto ID ${id} não encontrado`);
    }

    const incoming: any = data as any;
    if (incoming.ncmCodigo && incoming.ncmCodigo !== atual.ncmCodigo) {
      throw new Error('NCM não pode ser alterado');
    }
    if (incoming.catalogoId && incoming.catalogoId !== atual.catalogoId) {
      throw new Error('Catálogo não pode ser alterado');
    }

    const ncm = atual.ncmCodigo;
    const modalidade = data.modalidade || atual.modalidade || '';

    let estruturaInfo: EstruturaComVersao | null = null;
    if (data.valoresAtributos === undefined && atual.versaoAtributoId) {
      estruturaInfo = await this.atributosService.buscarEstruturaPorVersao(
        atual.versaoAtributoId
      );
    }
    if (!estruturaInfo) {
      estruturaInfo = await this.obterEstruturaAtributos(ncm, modalidade);
    }

    const valoresExistentes = this.montarValoresDosAtributos(atual.atributos);
    const valores = (data.valoresAtributos ?? valoresExistentes) as Record<string, any>;

    const erros = this.validarValores(valores, estruturaInfo.estrutura);
    if (Object.keys(erros).length > 0) {
      throw new ValidationError(erros);
    }

    const preencheuObrigatorios = this.todosObrigatoriosPreenchidos(valores, estruturaInfo.estrutura);

    const versaoAtualizadaId =
      data.valoresAtributos !== undefined
        ? estruturaInfo.versaoId
        : atual.versaoAtributoId ?? estruturaInfo.versaoId;

    const versaoAtualizadaNumero =
      data.valoresAtributos !== undefined
        ? estruturaInfo.versaoNumero
        : atual.versaoEstruturaAtributos ?? estruturaInfo.versaoNumero;

    await catalogoPrisma.$transaction(async tx => {
      let status = data.status ?? atual.status;
      if (!preencheuObrigatorios) {
        status = 'PENDENTE';
      } else if (atual.status === 'PENDENTE') {
        status = 'APROVADO';
      }
      const updated = await tx.produto.updateMany({
        where: { id, catalogo: { superUserId } },
        data: {
          modalidade: data.modalidade,
          status,
          situacao: data.situacao,
          denominacao: data.denominacao,
          descricao: data.descricao,
          versaoEstruturaAtributos: versaoAtualizadaNumero,
          versaoAtributoId: versaoAtualizadaId
        }
      });
      if (updated.count === 0) {
        throw new Error(`Produto ID ${id} não encontrado`);
      }

      if (data.valoresAtributos !== undefined) {
        await tx.produtoAtributo.deleteMany({
          where: { produtoId: id, produto: { catalogo: { superUserId } } }
        });
        await this.salvarValoresProduto(tx, id, estruturaInfo!, valores);
      }

      if (data.codigosInternos) {
        await tx.codigoInternoProduto.deleteMany({ where: { produtoId: id, produto: { catalogo: { superUserId } } } });
        await tx.codigoInternoProduto.createMany({
          data: data.codigosInternos.map(c => ({ codigo: c, produtoId: id }))
        });
      }

      if (data.operadoresEstrangeiros) {
        await tx.operadorEstrangeiroProduto.deleteMany({ where: { produtoId: id, produto: { catalogo: { superUserId } } } });
        await tx.operadorEstrangeiroProduto.createMany({
          data: data.operadoresEstrangeiros.map(o => ({
            paisCodigo: o.paisCodigo,
            conhecido: o.conhecido,
            operadorEstrangeiroId: o.operadorEstrangeiroId ?? null,
            produtoId: id
          }))
        });
      }
    });

    return this.buscarPorId(id, superUserId);
  }

  async remover(id: number, superUserId: number) {
    const deleted = await catalogoPrisma.$transaction(async tx => {
      await tx.produtoAtributo.deleteMany({ where: { produtoId: id, produto: { catalogo: { superUserId } } } });
      const res = await tx.produto.deleteMany({ where: { id, catalogo: { superUserId } } });
      return res.count;
    });
    if (deleted === 0) {
      throw new Error(`Produto ID ${id} não encontrado`);
    }
  }

  async clonar(id: number, data: CloneProdutoDTO, superUserId: number) {
    const original = await catalogoPrisma.produto.findFirst({
      where: { id, catalogo: { superUserId } },
      include: {
        atributos: {
          include: {
            atributo: { select: { codigo: true, multivalorado: true } },
            valores: { orderBy: { ordem: 'asc' } }
          }
        },
        codigosInternos: true,
        operadoresEstrangeiros: true
      }
    });

    if (!original) {
      throw new Error(`Produto ID ${id} não encontrado`);
    }

    const catalogoDestino = await catalogoPrisma.catalogo.findFirst({
      where: { id: data.catalogoId, superUserId }
    });

    if (!catalogoDestino) {
      throw new Error('Catálogo de destino não encontrado para o superusuário');
    }

    const skus = (data.codigosInternos ?? [])
      .map(codigo => codigo.trim())
      .filter(codigo => codigo.length > 0);

    if (new Set(skus).size !== skus.length) {
      throw new ValidationError({
        codigosInternos: 'Códigos internos duplicados não são permitidos'
      });
    }

    let estruturaInfo = original.versaoAtributoId
      ? await this.atributosService.buscarEstruturaPorVersao(original.versaoAtributoId)
      : null;

    if (!estruturaInfo) {
      estruturaInfo = await this.obterEstruturaAtributos(original.ncmCodigo, original.modalidade || '');
    }

    const valoresOriginais = this.montarValoresDosAtributos(original.atributos);

    const novoId = await catalogoPrisma.$transaction(async (tx) => {
      const novo = await tx.produto.create({
        data: {
          codigo: null,
          versao: original.versao,
          status: original.status,
          situacao: original.situacao,
          ncmCodigo: original.ncmCodigo,
          modalidade: original.modalidade,
          denominacao: data.denominacao.trim(),
          descricao: original.descricao,
          numero: 0,
          catalogoId: data.catalogoId,
          versaoEstruturaAtributos: estruturaInfo?.versaoNumero ?? original.versaoEstruturaAtributos,
          versaoAtributoId: estruturaInfo?.versaoId ?? original.versaoAtributoId,
          criadoPor: original.criadoPor,
          codigosInternos: skus.length
            ? {
                create: skus.map(codigo => ({ codigo }))
              }
            : undefined,
          operadoresEstrangeiros: original.operadoresEstrangeiros.length
            ? {
                create: original.operadoresEstrangeiros.map((oe) => ({
                  paisCodigo: oe.paisCodigo,
                  conhecido: oe.conhecido,
                  operadorEstrangeiroId:
                    data.catalogoId === original.catalogoId
                      ? oe.operadorEstrangeiroId ?? null
                      : null
                }))
              }
            : undefined
        }
      });

      await this.salvarValoresProduto(tx, novo.id, estruturaInfo!, valoresOriginais);

      return novo.id;
    });

    const produto = await this.buscarPorId(novoId, superUserId);
    if (!produto) {
      throw new Error('Falha ao carregar produto clonado');
    }

    return produto;
  }

  private async obterEstruturaAtributos(
    ncm: string,
    modalidade: string
  ): Promise<EstruturaComVersao> {
    try {
      return await this.atributosService.buscarEstrutura(
        ncm,
        modalidade || 'IMPORTACAO'
      );
    } catch (error) {
      logger.error('Erro ao obter atributos do legacy:', error);
      return {
        versaoId: 0,
        versaoNumero: 0,
        estrutura: []
      };
    }
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

  private montarValoresDosAtributos(
    registros: Array<{
      atributo: { codigo: string; multivalorado: boolean } | null;
      valores: Array<{ valorJson: Prisma.JsonValue; ordem: number }>;
    }>
  ): Record<string, any> {
    const resultado: Record<string, any> = {};
    for (const registro of registros) {
      if (!registro.atributo) continue;
      const codigo = registro.atributo.codigo;
      const valores = registro.valores.map(v => v.valorJson as any);
      if (registro.atributo.multivalorado) {
        resultado[codigo] = valores;
      } else {
        resultado[codigo] = valores.length > 0 ? valores[0] : null;
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

  private async salvarValoresProduto(
    tx: Prisma.TransactionClient,
    produtoId: number,
    estruturaInfo: EstruturaComVersao,
    valores: Record<string, any>
  ) {
    const mapa = this.mapearEstruturaPorCodigo(estruturaInfo.estrutura);
    for (const [codigo, valor] of Object.entries(valores)) {
      const atributo = mapa.get(codigo);
      if (!atributo?.id) continue;
      const valoresNormalizados = this.normalizarValorEntrada(valor);
      if (!valoresNormalizados.length) continue;

      await tx.produtoAtributo.create({
        data: {
          produtoId,
          atributoId: atributo.id,
          atributoVersaoId: estruturaInfo.versaoId,
          valores: {
            create: valoresNormalizados.map((item, ordem) => ({
              valorJson: item as Prisma.InputJsonValue,
              ordem
            }))
          }
        }
      });
    }
  }

  private avaliarExpressao(cond: any, valor: string): boolean {
    if (!cond) return true;
    const esperado = cond.valor;
    let ok = true;
    switch (cond.operador) {
      case '==':
        ok = valor === esperado;
        break;
      case '!=':
        ok = valor !== esperado;
        break;
      case '>':
        ok = Number(valor) > Number(esperado);
        break;
      case '>=':
        ok = Number(valor) >= Number(esperado);
        break;
      case '<':
        ok = Number(valor) < Number(esperado);
        break;
      case '<=':
        ok = Number(valor) <= Number(esperado);
        break;
    }
    if (cond.condicao) {
      const next = this.avaliarExpressao(cond.condicao, valor);
      return cond.composicao === '||' ? ok || next : ok && next;
    }
    return ok;
  }

  private valoresComoArray(valor: any): string[] {
    if (Array.isArray(valor)) {
      return valor.reduce<string[]>(
        (acc, item) => acc.concat(this.valoresComoArray(item)),
        []
      );
    }
    if (valor === undefined || valor === null) return [];
    const texto = String(valor);
    return texto.trim() === '' ? [] : [texto];
  }

  private condicaoAtendida(
    attr: AtributoEstruturaDTO,
    valores: Record<string, any>,
    mapa: Map<string, AtributoEstruturaDTO>
  ): boolean {
    const codigoCondicionante = attr.condicionanteCodigo || attr.parentCodigo;
    if (!codigoCondicionante) return true;

    const pai = mapa.get(codigoCondicionante);
    if (pai && !this.condicaoAtendida(pai, valores, mapa)) return false;

    const valoresCondicionante = this.valoresComoArray(valores[codigoCondicionante]);
    if (valoresCondicionante.length === 0) return false;

    if (attr.condicao) {
      return valoresCondicionante.some(v => this.avaliarExpressao(attr.condicao, v));
    }

    if (!attr.descricaoCondicao) return true;
    const match = attr.descricaoCondicao.match(/valor\s*=\s*'?"?(\w+)"?'?/i);
    if (!match) return true;
    const esperado = match[1];
    return valoresCondicionante.some(v => v === esperado);
  }

  private todosObrigatoriosPreenchidos(
    valores: Record<string, any>,
    estrutura: AtributoEstruturaDTO[]
  ): boolean {
    const todos: AtributoEstruturaDTO[] = [];
    function coletar(attrs: AtributoEstruturaDTO[]) {
      for (const a of attrs) {
        todos.push(a);
        if (a.subAtributos) coletar(a.subAtributos);
      }
    }
    coletar(estrutura);

    const mapa = new Map<string, AtributoEstruturaDTO>();
    for (const a of todos) mapa.set(a.codigo, a);

    for (const attr of todos) {
      if (!attr.obrigatorio) continue;
      if (!this.condicaoAtendida(attr, valores, mapa)) continue;
      const v = valores[attr.codigo];
      if (this.valoresComoArray(v).length === 0) return false;
    }
    return true;
  }

  private validarValores(valores: Record<string, any>, estrutura: AtributoEstruturaDTO[]): Record<string, string> {
    const erros: Record<string, string> = {};

    const todos: AtributoEstruturaDTO[] = [];
    function coletar(attrs: AtributoEstruturaDTO[]) {
      for (const a of attrs) {
        todos.push(a);
        if (a.subAtributos) coletar(a.subAtributos);
      }
    }
    coletar(estrutura);

    const mapa = new Map<string, AtributoEstruturaDTO>();
    for (const a of todos) mapa.set(a.codigo, a);

    for (const attr of todos) {
      if (!this.condicaoAtendida(attr, valores, mapa)) continue;
      const v = valores[attr.codigo];
      const valoresAttr = this.valoresComoArray(v);
      if (valoresAttr.length === 0) continue;

      if (attr.validacoes?.tamanho_maximo && valoresAttr.some(item => item.length > attr.validacoes.tamanho_maximo)) {
        erros[attr.codigo] = 'Tamanho máximo excedido';
        continue;
      }
      switch (attr.tipo) {
        case 'NUMERO_INTEIRO':
          if (valoresAttr.some(item => !/^[-]?\d+$/.test(item))) {
            erros[attr.codigo] = 'Número inteiro inválido';
          }
          break;
        case 'NUMERO_REAL':
          if (valoresAttr.some(item => isNaN(Number(item)))) {
            erros[attr.codigo] = 'Número real inválido';
          }
          break;
        case 'LISTA_ESTATICA':
          if (
            attr.dominio &&
            !valoresAttr.every(item => attr.dominio!.some(d => String(d.codigo) === item))
          ) {
            erros[attr.codigo] = 'Valor fora do domínio';
          }
          break;
        case 'BOOLEANO':
          if (valoresAttr.some(item => item !== 'true' && item !== 'false')) {
            erros[attr.codigo] = 'Valor booleano inválido';
          }
          break;
      }
    }
    return erros;
  }
}
