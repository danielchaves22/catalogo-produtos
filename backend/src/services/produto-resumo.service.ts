import { Prisma } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';
import { AtributoEstruturaDTO, AtributoLegacyService } from './atributo-legacy.service';

export interface ProdutoResumoValores {
  atributosTotal: number;
  obrigatoriosPendentes: number;
  validosTransmissao: number;
}

type ProdutoAtributoComValores = {
  atributo: { codigo: string; multivalorado: boolean } | null;
  valores: Array<{ valorJson: Prisma.JsonValue }>;
};

export class ProdutoResumoService {
  constructor(private readonly atributoService = new AtributoLegacyService()) {}

  async recalcularResumoProduto(
    produtoId: number,
    prisma: Prisma.TransactionClient | typeof catalogoPrisma = catalogoPrisma
  ): Promise<ProdutoResumoValores | null> {
    const produto = await prisma.produto.findUnique({
      where: { id: produtoId },
      select: {
        id: true,
        catalogoId: true,
        versaoAtributoId: true,
        atributos: {
          include: {
            atributo: { select: { codigo: true, multivalorado: true } },
            valores: { orderBy: { ordem: 'asc' } }
          }
        }
      }
    });

    if (!produto) {
      return null;
    }

    let estruturaLista: AtributoEstruturaDTO[] = [];
    if (produto.versaoAtributoId) {
      const estruturaInfo = await this.atributoService.buscarEstruturaPorVersao(
        produto.versaoAtributoId
      );
      if (estruturaInfo?.estrutura) {
        estruturaLista = flattenEstrutura(estruturaInfo.estrutura);
      }
    }

    const valores = montarMapaValoresProduto(produto.atributos);
    const resumo = calcularResumoProduto(valores, estruturaLista);

    await prisma.produtoResumoDashboard.upsert({
      where: { produtoId: produto.id },
      update: {
        catalogoId: produto.catalogoId,
        atributosTotal: resumo.atributosTotal,
        obrigatoriosPendentes: resumo.obrigatoriosPendentes,
        validosTransmissao: resumo.validosTransmissao
      },
      create: {
        produtoId: produto.id,
        catalogoId: produto.catalogoId,
        atributosTotal: resumo.atributosTotal,
        obrigatoriosPendentes: resumo.obrigatoriosPendentes,
        validosTransmissao: resumo.validosTransmissao
      }
    });

    return resumo;
  }

  async removerResumoProduto(
    produtoId: number,
    prisma: Prisma.TransactionClient | typeof catalogoPrisma = catalogoPrisma
  ): Promise<void> {
    await prisma.produtoResumoDashboard.deleteMany({ where: { produtoId } });
  }

  async garantirResumos(
    superUserId: number,
    catalogoId?: number,
    prisma: Prisma.TransactionClient | typeof catalogoPrisma = catalogoPrisma
  ): Promise<void> {
    const produtosSemResumo = await prisma.produto.findMany({
      where: {
        catalogo: { superUserId },
        ...(catalogoId ? { catalogoId } : {}),
        resumoDashboard: null
      },
      select: { id: true }
    });

    if (!produtosSemResumo.length) {
      return;
    }

    for (const item of produtosSemResumo) {
      await this.recalcularResumoProduto(item.id, prisma);
    }
  }
}

export function calcularResumoProduto(
  valores: Record<string, unknown>,
  estruturaLista: AtributoEstruturaDTO[]
): ProdutoResumoValores {
  if (estruturaLista.length === 0) {
    const atributosTotal = Object.keys(valores).length;
    return {
      atributosTotal,
      obrigatoriosPendentes: 0,
      validosTransmissao: atributosTotal
    };
  }

  const mapa = new Map<string, AtributoEstruturaDTO>();
  for (const attr of estruturaLista) {
    mapa.set(attr.codigo, attr);
  }

  const visitados = new Set<string>();
  let atributosTotal = 0;
  let obrigatoriosPendentes = 0;

  for (const attr of estruturaLista) {
    if (visitados.has(attr.codigo)) continue;
    visitados.add(attr.codigo);
    if (attr.tipo === 'COMPOSTO') continue;
    if (!condicaoAtendida(attr, valores, mapa)) continue;
    atributosTotal += 1;
    if (attr.obrigatorio && !valorPreenchido(valores[attr.codigo])) {
      obrigatoriosPendentes += 1;
    }
  }

  const validosTransmissao = Math.max(atributosTotal - obrigatoriosPendentes, 0);

  return { atributosTotal, obrigatoriosPendentes, validosTransmissao };
}

function flattenEstrutura(estrutura: AtributoEstruturaDTO[] | undefined): AtributoEstruturaDTO[] {
  if (!estrutura) return [];
  const resultado: AtributoEstruturaDTO[] = [];
  const stack = [...estrutura];
  while (stack.length) {
    const atual = stack.shift();
    if (!atual) continue;
    resultado.push(atual);
    if (atual.subAtributos && atual.subAtributos.length) {
      stack.unshift(...atual.subAtributos);
    }
  }
  return resultado;
}

function condicaoAtendida(
  attr: AtributoEstruturaDTO,
  valores: Record<string, unknown>,
  mapa: Map<string, AtributoEstruturaDTO>
): boolean {
  const codigoCondicionante = attr.condicionanteCodigo || attr.parentCodigo;
  if (!codigoCondicionante) return true;

  const pai = mapa.get(codigoCondicionante);
  if (pai && !condicaoAtendida(pai, valores, mapa)) return false;

  const atual = valores[codigoCondicionante];
  if (atual === undefined || atual === null || atual === '') return false;
  const atualStr = String(atual);
  if (attr.condicao) return avaliarExpressao(attr.condicao, atualStr);
  if (!attr.descricaoCondicao) return true;
  const match = attr.descricaoCondicao.match(/valor\s*=\s*'?"?(\w+)"?'?/i);
  if (!match) return true;
  return atualStr === match[1];
}

function avaliarExpressao(cond: any, valor: string): boolean {
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
    const next = avaliarExpressao(cond.condicao, valor);
    return cond.composicao === '||' ? ok || next : ok && next;
  }
  return ok;
}

function valorPreenchido(valor: unknown): boolean {
  if (valor === undefined || valor === null) return false;
  if (Array.isArray(valor)) {
    return valor.some(item => valorPreenchido(item));
  }
  if (typeof valor === 'string') {
    return valor.trim().length > 0;
  }
  return true;
}

function montarMapaValoresProduto(
  atributos: ProdutoAtributoComValores[]
): Record<string, unknown> {
  const resultado: Record<string, unknown> = {};
  for (const item of atributos) {
    if (!item.atributo) continue;
    const codigo = item.atributo.codigo;
    const valores = item.valores.map(v => v.valorJson as unknown);
    if (item.atributo.multivalorado) {
      resultado[codigo] = valores;
    } else {
      resultado[codigo] = valores.length > 0 ? valores[0] : null;
    }
  }
  return resultado;
}
