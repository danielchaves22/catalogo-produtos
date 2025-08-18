// backend/src/services/produto.service.ts
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { Prisma } from '@prisma/client';
import { AtributoLegacyService, AtributoEstruturaDTO } from './atributo-legacy.service';
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

export interface ListarProdutosFiltro {
  status?: 'PENDENTE' | 'APROVADO' | 'PROCESSANDO' | 'TRANSMITIDO' | 'ERRO';
  situacao?: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';
  ncm?: string;
  catalogoId?: number;
}

export class ProdutoService {
  private atributosService = new AtributoLegacyService();
  async listarTodos(filtros: ListarProdutosFiltro = {}, superUserId: number) {
    const where: Prisma.ProdutoWhereInput = {
      catalogo: { superUserId }
    };
    if (filtros.status) where.status = filtros.status;
    if (filtros.ncm) where.ncmCodigo = filtros.ncm;
    if (filtros.situacao) where.situacao = filtros.situacao;
    if (filtros.catalogoId) where.catalogoId = filtros.catalogoId;

    const produtos = await catalogoPrisma.produto.findMany({
      where,
      include: {
        atributos: true,
        catalogo: true,
        codigosInternos: true,
        operadoresEstrangeiros: { include: { pais: true, operadorEstrangeiro: true } }
      }
    });

    return produtos.map(p => ({
      ...p,
      codigosInternos: p.codigosInternos.map(ci => ci.codigo),
      operadoresEstrangeiros: p.operadoresEstrangeiros.map(o => ({
        id: o.id,
        paisCodigo: o.paisCodigo,
        paisNome: o.pais.nome,
        conhecido: o.conhecido,
        operadorEstrangeiroId: o.operadorEstrangeiroId
      })),
      catalogoNumero: p.catalogo?.numero,
      catalogoNome: p.catalogo?.nome,
      catalogoCpfCnpj: p.catalogo?.cpf_cnpj
    }));
  }

  async buscarPorId(id: number, superUserId: number) {
    const p = await catalogoPrisma.produto.findFirst({
      where: { id, catalogo: { superUserId } },
      include: {
        atributos: true,
        catalogo: true,
        codigosInternos: true,
        operadoresEstrangeiros: { include: { pais: true, operadorEstrangeiro: true } }
      }
    });
    if (!p) return null;
    return {
      ...p,
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
      catalogoCpfCnpj: p.catalogo?.cpf_cnpj
    };
  }

  async criar(data: CreateProdutoDTO, superUserId: number) {
    const estrutura = await this.obterEstruturaAtributos(
      data.ncmCodigo,
      data.modalidade
    );

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

    return catalogoPrisma.$transaction(async (tx) => {
      const produto = await tx.produto.create({
        data: {
          codigo: data.codigo ?? null,
          versao: 1,
          status: preencheuObrigatorios ? 'APROVADO' : 'PENDENTE',
          situacao: data.situacao ?? undefined,
          ncmCodigo: data.ncmCodigo,
          modalidade: data.modalidade,
          denominacao: data.denominacao,
          descricao: data.descricao,
          catalogoId: data.catalogoId,
          versaoEstruturaAtributos: 1,
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

      await tx.produtoAtributos.create({
        data: {
          produtoId: produto.id,
          valoresJson: (data.valoresAtributos ?? {}) as Prisma.InputJsonValue,
          estruturaSnapshotJson: estrutura as unknown as Prisma.InputJsonValue
        }
      });

      return produto;
    });
  }

  async atualizar(id: number, data: UpdateProdutoDTO, superUserId: number) {
    const atual = await catalogoPrisma.produto.findFirst({
      where: { id, catalogo: { superUserId } },
      include: { atributos: true }
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
    const estrutura = await this.obterEstruturaAtributos(ncm, modalidade);
    const valores = (data.valoresAtributos ?? atual.atributos[0]?.valoresJson ?? {}) as Record<string, any>;

    const erros = this.validarValores(valores, estrutura);
    if (Object.keys(erros).length > 0) {
      throw new ValidationError(erros);
    }

    const preencheuObrigatorios = this.todosObrigatoriosPreenchidos(valores, estrutura);

    return catalogoPrisma.$transaction(async tx => {
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
          versaoEstruturaAtributos: atual.versaoEstruturaAtributos
        }
      });
      if (updated.count === 0) {
        throw new Error(`Produto ID ${id} não encontrado`);
      }
      const produto = await tx.produto.findFirst({
        where: { id, catalogo: { superUserId } },
        include: { codigosInternos: true, operadoresEstrangeiros: true }
      });

      if (data.valoresAtributos !== undefined) {
        await tx.produtoAtributos.updateMany({
          where: { produtoId: id, produto: { catalogo: { superUserId } } },
          data: {
            valoresJson: data.valoresAtributos,
            estruturaSnapshotJson: estrutura as unknown as Prisma.InputJsonValue
          }
        });
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

      return produto;
    });
  }

  async remover(id: number, superUserId: number) {
    const deleted = await catalogoPrisma.$transaction(async tx => {
      await tx.produtoAtributos.deleteMany({ where: { produtoId: id, produto: { catalogo: { superUserId } } } });
      const res = await tx.produto.deleteMany({ where: { id, catalogo: { superUserId } } });
      return res.count;
    });
    if (deleted === 0) {
      throw new Error(`Produto ID ${id} não encontrado`);
    }
  }

  private async obterEstruturaAtributos(
    ncm: string,
    modalidade: string
  ): Promise<AtributoEstruturaDTO[]> {
    const cache = await catalogoPrisma.atributosCache.findFirst({
      where: { ncmCodigo: ncm, modalidade },
      orderBy: { versao: 'desc' }
    });
    if (cache) {
      return cache.estruturaJson as unknown as AtributoEstruturaDTO[];
    }

    try {
      const estrutura = await this.atributosService.buscarEstrutura(ncm, modalidade);
      const estruturaJson = estrutura as unknown as Prisma.InputJsonValue;

      await catalogoPrisma.atributosCache.create({
        data: {
          ncmCodigo: ncm,
          modalidade,
          estruturaJson: estruturaJson,
          versao: 1
        }
      });
      return estrutura;
    } catch (error) {
      logger.error('Erro ao obter atributos do legacy:', error);
      return [];
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

  private condicaoAtendida(
    attr: AtributoEstruturaDTO,
    valores: Record<string, any>,
    mapa: Map<string, AtributoEstruturaDTO>
  ): boolean {
    const codigoCondicionante = attr.condicionanteCodigo || attr.parentCodigo;
    if (!codigoCondicionante) return true;

    const pai = mapa.get(codigoCondicionante);
    if (pai && !this.condicaoAtendida(pai, valores, mapa)) return false;

    const atual = valores[codigoCondicionante];
    if (atual === undefined || atual === '') return false;
    const atualStr = String(atual);
    if (attr.condicao) return this.avaliarExpressao(attr.condicao, atualStr);
    if (!attr.descricaoCondicao) return true;
    const match = attr.descricaoCondicao.match(/valor\s*=\s*'?"?(\w+)"?'?/i);
    if (!match) return true;
    return atual === match[1];
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
      if (v === undefined || v === '') return false;
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
      if (v === undefined || v === '') continue;

      if (attr.validacoes?.tamanho_maximo && String(v).length > attr.validacoes.tamanho_maximo) {
        erros[attr.codigo] = 'Tamanho máximo excedido';
        continue;
      }
      switch (attr.tipo) {
        case 'NUMERO_INTEIRO':
          if (!/^[-]?\d+$/.test(String(v))) erros[attr.codigo] = 'Número inteiro inválido';
          break;
        case 'NUMERO_REAL':
          if (isNaN(Number(v))) erros[attr.codigo] = 'Número real inválido';
          break;
        case 'LISTA_ESTATICA':
          if (attr.dominio && !attr.dominio.some(d => d.codigo == v)) {
            erros[attr.codigo] = 'Valor fora do domínio';
          }
          break;
        case 'BOOLEANO':
          if (v !== 'true' && v !== 'false') erros[attr.codigo] = 'Valor booleano inválido';
          break;
      }
    }
    return erros;
  }
}
