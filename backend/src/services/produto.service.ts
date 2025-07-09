// backend/src/services/produto.service.ts
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { Prisma } from '@prisma/client';
import { AtributoLegacyService, AtributoEstruturaDTO } from './atributo-legacy.service';
import { ValidationError } from '../types/validation-error';

export interface CreateProdutoDTO {
  codigo: string;
  ncmCodigo: string;
  modalidade: string;
  valoresAtributos?: Prisma.InputJsonValue;
  criadoPor?: string;
}

export interface UpdateProdutoDTO {
  ncmCodigo?: string;
  modalidade?: string;
  status?: 'RASCUNHO' | 'ATIVO' | 'INATIVO';
  valoresAtributos?: Prisma.InputJsonValue;
  atualizadoPor?: string;
}

export class ProdutoService {
  private atributosService = new AtributoLegacyService();
  async listarTodos() {
    return catalogoPrisma.produto.findMany({ include: { atributos: true } });
  }

  async buscarPorId(id: number) {
    return catalogoPrisma.produto.findUnique({ where: { id }, include: { atributos: true } });
  }

  async criar(data: CreateProdutoDTO) {
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

    return catalogoPrisma.$transaction(async (tx) => {
      const produto = await tx.produto.create({
        data: {
          codigo: data.codigo,
          versao: 1,
          status: 'RASCUNHO',
          ncmCodigo: data.ncmCodigo,
          modalidade: data.modalidade,
          versaoEstruturaAtributos: 1,
          criadoPor: data.criadoPor || null
        }
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

  async atualizar(id: number, data: UpdateProdutoDTO) {
    const atual = await catalogoPrisma.produto.findUnique({
      where: { id },
      include: { atributos: true }
    });
    if (!atual) {
      throw new Error(`Produto ID ${id} não encontrado`);
    }

    const ncm = data.ncmCodigo || atual.ncmCodigo;
    const modalidade = data.modalidade || atual.modalidade || '';
    const estrutura = await this.obterEstruturaAtributos(ncm, modalidade);
    const valores = (data.valoresAtributos ?? atual.atributos[0]?.valoresJson ?? {}) as Record<string, any>;

    const erros = this.validarValores(valores, estrutura);
    if (Object.keys(erros).length > 0) {
      throw new ValidationError(erros);
    }

    return catalogoPrisma.$transaction(async tx => {
      const produto = await tx.produto.update({
        where: { id },
        data: {
          ncmCodigo: data.ncmCodigo,
          modalidade: data.modalidade,
          status: data.status,
          versaoEstruturaAtributos: atual.versaoEstruturaAtributos
        }
      });

      if (data.valoresAtributos !== undefined) {
        await tx.produtoAtributos.updateMany({
          where: { produtoId: id },
          data: {
            valoresJson: data.valoresAtributos,
            estruturaSnapshotJson: estrutura as unknown as Prisma.InputJsonValue
          }
        });
      }

      return produto;
    });
  }

  async remover(id: number) {
    try {
      await catalogoPrisma.$transaction(async tx => {
        await tx.produtoAtributos.deleteMany({ where: { produtoId: id } });
        await tx.produto.delete({ where: { id } });
      });
    } catch (error: any) {
      const prismaErr = error as Prisma.PrismaClientKnownRequestError;
      if (prismaErr.code === 'P2025') {
        throw new Error(`Produto ID ${id} não encontrado`);
      }
      throw error;
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
      if (attr.obrigatorio && (v === undefined || v === '')) {
        erros[attr.codigo] = 'Obrigatório';
        continue;
      }
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
