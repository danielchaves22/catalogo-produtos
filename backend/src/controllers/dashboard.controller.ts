import { Request, Response } from 'express';
import { catalogoPrisma } from '../utils/prisma';
import { AtributoEstruturaDTO } from '../services/atributo-legacy.service';

const PRODUTO_STATUS = ['PENDENTE', 'APROVADO', 'PROCESSANDO', 'TRANSMITIDO', 'ERRO'] as const;

type ProdutoStatus = (typeof PRODUTO_STATUS)[number];

const CATALOGO_STATUS_PRIORIDADE: ProdutoStatus[] = ['ERRO', 'PENDENTE', 'APROVADO', 'PROCESSANDO', 'TRANSMITIDO'];

function createStatusMap(): Record<ProdutoStatus, number> {
  return PRODUTO_STATUS.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as Record<ProdutoStatus, number>);
}

function isProdutoStatus(value: string): value is ProdutoStatus {
  return PRODUTO_STATUS.includes(value as ProdutoStatus);
}

function determinarStatusCatalogo(statuses: Set<ProdutoStatus>): ProdutoStatus {
  if (!statuses.size) return 'PENDENTE';

  for (const status of CATALOGO_STATUS_PRIORIDADE) {
    if (status === 'TRANSMITIDO') {
      if (statuses.size === 1 && statuses.has('TRANSMITIDO')) {
        return 'TRANSMITIDO';
      }
      continue;
    }
    if (statuses.has(status)) {
      return status;
    }
  }

  return 'PENDENTE';
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

function condicaoAtendida(
  attr: AtributoEstruturaDTO,
  valores: Record<string, any>,
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

function toRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function toEstruturaList(value: unknown): AtributoEstruturaDTO[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as AtributoEstruturaDTO[];
  if (typeof value === 'object') return [value as AtributoEstruturaDTO];
  return [];
}

export async function obterResumoDashboard(req: Request, res: Response) {
  try {
    const superUserId = req.user!.superUserId;
    const headerCatalogId = req.headers['x-catalogo-trabalho'];
    const queryCatalogId = req.query.catalogoId as string | undefined;
    const catalogoId = queryCatalogId
      ? Number(queryCatalogId)
      : (typeof headerCatalogId === 'string' ? Number(headerCatalogId) : undefined);

    const catalogoWhere: any = { superUserId };
    if (catalogoId && !Number.isNaN(catalogoId)) {
      catalogoWhere.id = catalogoId;
    }

    const totalCatalogos = await catalogoPrisma.catalogo.count({ where: catalogoWhere });

    const produtoWhere: any = { catalogo: { superUserId } };
    if (catalogoId && !Number.isNaN(catalogoId)) {
      produtoWhere.catalogoId = catalogoId;
    }

    const totalProdutos = await catalogoPrisma.produto.count({ where: produtoWhere });

    const produtosPorStatusRaw = await catalogoPrisma.produto.groupBy({
      by: ['status'],
      _count: { status: true },
      where: produtoWhere
    });

    const produtosPorStatus = createStatusMap();
    for (const item of produtosPorStatusRaw) {
      if (typeof item.status === 'string' && isProdutoStatus(item.status)) {
        produtosPorStatus[item.status] = item._count.status;
      }
    }

    const catalogosIds = await catalogoPrisma.catalogo.findMany({
      where: catalogoWhere,
      select: { id: true }
    });

    const catalogoStatusSet = new Map<number, Set<ProdutoStatus>>();
    const catalogosPorStatusRaw = await catalogoPrisma.produto.groupBy({
      by: ['catalogoId', 'status'],
      _count: { _all: true },
      where: produtoWhere
    });

    for (const item of catalogosPorStatusRaw) {
      if (!item.status || typeof item.status !== 'string' || !isProdutoStatus(item.status)) continue;
      const atual = catalogoStatusSet.get(item.catalogoId) ?? new Set<ProdutoStatus>();
      atual.add(item.status);
      catalogoStatusSet.set(item.catalogoId, atual);
    }

    const catalogosPorStatus = createStatusMap();
    for (const { id } of catalogosIds) {
      const statusSet = catalogoStatusSet.get(id) ?? new Set<ProdutoStatus>();
      const finalStatus = determinarStatusCatalogo(statusSet);
      catalogosPorStatus[finalStatus] += 1;
    }

    const atributosRegistros = await catalogoPrisma.produtoAtributos.findMany({
      where: { produto: produtoWhere },
      select: {
        valoresJson: true,
        estruturaSnapshotJson: true
      }
    });

    let atributosTotal = 0;
    let obrigatoriosPendentes = 0;

    for (const registro of atributosRegistros) {
      const valores = toRecord(registro.valoresJson);
      const estruturaLista = flattenEstrutura(toEstruturaList(registro.estruturaSnapshotJson));

      if (!estruturaLista.length) {
        atributosTotal += Object.keys(valores).length;
        continue;
      }

      const mapa = new Map<string, AtributoEstruturaDTO>();
      for (const attr of estruturaLista) {
        mapa.set(attr.codigo, attr);
      }

      const visitados = new Set<string>();
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
    }

    const validosTransmissao = Math.max(atributosTotal - obrigatoriosPendentes, 0);

    return res.json({
      catalogos: { total: totalCatalogos, porStatus: catalogosPorStatus },
      produtos: { total: totalProdutos, porStatus: produtosPorStatus },
      atributos: {
        total: atributosTotal,
        obrigatoriosPendentes,
        validosTransmissao
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Erro ao obter resumo do painel'
    });
  }
}
