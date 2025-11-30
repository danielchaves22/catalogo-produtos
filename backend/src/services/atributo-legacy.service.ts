import { catalogoPrisma, legacyPrisma } from '../utils/prisma'
import { Prisma } from '@prisma/client'
import { parseJsonSafe } from '../utils/parse-json'
import { logger } from '../utils/logger'

export interface DominioDTO {
  codigo: string
  descricao: string | null
}

export interface AtributoEstruturaDTO {
  id?: number
  codigo: string
  nome: string
  tipo: string
  obrigatorio: boolean
  multivalorado: boolean
  validacoes: Record<string, any>
  orientacaoPreenchimento?: string
  dominio?: DominioDTO[]
  descricaoCondicao?: string
  condicao?: any
  parentCodigo?: string
  condicionanteCodigo?: string
  subAtributos?: AtributoEstruturaDTO[]
}

export interface EstruturaComVersao {
  versaoId: number
  versaoNumero: number
  estrutura: AtributoEstruturaDTO[]
}

export class AtributoLegacyService {
  private static invalidadores = new Set<(ncm: string, modalidade: string) => void>()

  static registrarInvalidacao(
    callback: (ncm: string, modalidade: string) => void
  ): () => void {
    this.invalidadores.add(callback)
    return () => {
      this.invalidadores.delete(callback)
    }
  }

  private static notificarInvalidacao(ncm: string, modalidade: string) {
    for (const callback of this.invalidadores) {
      try {
        callback(ncm, modalidade)
      } catch (error) {
        logger.error('Falha ao notificar invalidação de estrutura de atributos', error)
      }
    }
  }

  async buscarEstrutura(ncm: string, modalidade: string = 'IMPORTACAO'): Promise<EstruturaComVersao> {
    const versaoExistente = await catalogoPrisma.atributoVersao.findFirst({
      where: { ncmCodigo: ncm, modalidade },
      orderBy: { versao: 'desc' }
    })

    if (versaoExistente) {
      return this.montarEstrutura(versaoExistente.id, versaoExistente.versao)
    }

    return this.sincronizarEstrutura(ncm, modalidade)
  }

  async buscarEstruturaPorVersao(versaoId: number): Promise<EstruturaComVersao | null> {
    const versao = await catalogoPrisma.atributoVersao.findFirst({
      where: { id: versaoId }
    })

    if (!versao) return null

    return this.montarEstrutura(versao.id, versao.versao)
  }

  private async carregarEstruturaLegacy(
    ncm: string,
    modalidade: string
  ): Promise<AtributoEstruturaDTO[]> {
    const rows = await legacyPrisma.$queryRaw<Array<{
      codigo: string
      nome_apresentacao: string
      forma_preenchimento: string
      obrigatorio: number | null
      multivalorado: number | null
      tamanho_maximo: number | null
      casas_decimais: number | null
      mascara: string | null
      orientacao_preenchimento: string | null
      parent_codigo: string | null
      dominio_codigo: string | null
      dominio_descricao: string | null
    }>>(Prisma.sql`
      SELECT a.codigo, a.nome_apresentacao, a.forma_preenchimento,
             av.obrigatorio, COALESCE(av.multivalorado, a.multivalorado) AS multivalorado,
             a.tamanho_maximo, a.casas_decimais, a.mascara, a.orientacao_preenchimento, a.parent_codigo,
             ad.codigo AS dominio_codigo, ad.descricao AS dominio_descricao
      FROM atributo_vinculo av
        JOIN atributo a ON a.codigo = av.codigo
        LEFT JOIN atributo_dominio ad ON ad.atributo_codigo = a.codigo
      WHERE av.codigo_ncm = ${ncm} AND av.modalidade = ${modalidade} AND a.objetivos like ("%Produto%")
      ORDER BY a.codigo, ad.id
    `)

    const condRows = await legacyPrisma.$queryRaw<Array<{
      condicionante_codigo: string
      codigo: string
      nome_apresentacao: string
      forma_preenchimento: string
      obrigatorio: number | null
      multivalorado: number | null
      tamanho_maximo: number | null
      casas_decimais: number | null
      mascara: string | null
      orientacao_preenchimento: string | null
      descricao_condicao: string | null
      condicao: string | null
      dominio_codigo: string | null
      dominio_descricao: string | null
    }>>(Prisma.sql`
      SELECT ac.atributo_codigo AS condicionante_codigo,
             ac.codigo, ac.nome_apresentacao, ac.forma_preenchimento,
             ac.obrigatorio, ac.multivalorado, ac.tamanho_maximo,
             ac.casas_decimais, ac.mascara, ac.orientacao_preenchimento,
             ac.descricao_condicao, ac.condicao, ad.codigo AS dominio_codigo,
             ad.descricao AS dominio_descricao
      FROM atributo_condicionado ac
        LEFT JOIN atributo_dominio ad ON ad.atributo_codigo = ac.codigo
      WHERE ac.objetivos like ("%Produto%") AND ac.atributo_codigo IN (
        SELECT codigo FROM atributo_vinculo
        WHERE codigo_ncm = ${ncm} AND modalidade = ${modalidade}
      )
      ORDER BY ac.codigo, ad.id
    `)

    const map = new Map<string, AtributoEstruturaDTO>()

    for (const row of rows) {
      let attr = map.get(row.codigo)
      if (!attr) {
        attr = {
          codigo: row.codigo,
          nome: row.nome_apresentacao,
          tipo: row.forma_preenchimento,
          obrigatorio: Boolean(row.obrigatorio),
          multivalorado: Boolean(row.multivalorado),
          validacoes: {},
          parentCodigo: row.parent_codigo || undefined,
          orientacaoPreenchimento: row.orientacao_preenchimento || undefined,
          dominio: []
        }
        if (row.tamanho_maximo !== null) attr.validacoes.tamanho_maximo = row.tamanho_maximo
        if (row.casas_decimais !== null) attr.validacoes.casas_decimais = row.casas_decimais
        if (row.mascara !== null) attr.validacoes.mascara = row.mascara
        map.set(row.codigo, attr)
      }
      if (row.dominio_codigo) {
        attr.dominio!.push({ codigo: row.dominio_codigo, descricao: row.dominio_descricao })
      }
    }

    for (const row of condRows) {
      let attr = map.get(row.codigo)
      if (!attr) {
        attr = {
          codigo: row.codigo,
          nome: row.nome_apresentacao,
          tipo: row.forma_preenchimento,
          obrigatorio: Boolean(row.obrigatorio),
          multivalorado: Boolean(row.multivalorado),
          validacoes: {},
          parentCodigo: row.condicionante_codigo,
          condicionanteCodigo: row.condicionante_codigo,
          descricaoCondicao: row.descricao_condicao || undefined,
          condicao: row.condicao ? parseJsonSafe(row.condicao) : undefined,
          orientacaoPreenchimento: row.orientacao_preenchimento || undefined,
          dominio: []
        }
        if (row.tamanho_maximo !== null) attr.validacoes.tamanho_maximo = row.tamanho_maximo
        if (row.casas_decimais !== null) attr.validacoes.casas_decimais = row.casas_decimais
        if (row.mascara !== null) attr.validacoes.mascara = row.mascara
        map.set(row.codigo, attr)
      } else {
        attr.parentCodigo = row.condicionante_codigo
        attr.descricaoCondicao = row.descricao_condicao || attr.descricaoCondicao
        if (row.condicao) attr.condicao = parseJsonSafe(row.condicao)
        if (row.orientacao_preenchimento)
          attr.orientacaoPreenchimento = row.orientacao_preenchimento
      }
      if (row.dominio_codigo) {
        if (!attr.dominio) attr.dominio = []
        attr.dominio.push({ codigo: row.dominio_codigo, descricao: row.dominio_descricao })
      }
    }

    const roots: AtributoEstruturaDTO[] = []
    for (const attr of map.values()) {
      if (attr.parentCodigo) {
        const parent = map.get(attr.parentCodigo)
        if (parent && parent.tipo === 'COMPOSTO') {
          if (!parent.subAtributos) parent.subAtributos = []
          parent.subAtributos.push(attr)
        } else {
          roots.push(attr)
        }
      } else {
        roots.push(attr)
      }
    }

    return roots
  }

  private async montarEstrutura(
    versaoId: number,
    versaoNumero: number
  ): Promise<EstruturaComVersao> {
    const atributos = await catalogoPrisma.atributo.findMany({
      where: { versaoId },
      orderBy: { ordem: 'asc' },
      include: {
        dominio: {
          orderBy: { ordem: 'asc' }
        }
      }
    })

    const mapa = new Map<number, AtributoEstruturaDTO>()
    const raizes: AtributoEstruturaDTO[] = []

    for (const attr of atributos) {
      const validacoes =
        attr.validacoesJson &&
        typeof attr.validacoesJson === 'object' &&
        attr.validacoesJson !== null &&
        !Array.isArray(attr.validacoesJson)
          ? (attr.validacoesJson as Record<string, any>)
          : {}

      const condicao =
        attr.condicaoJson &&
        typeof attr.condicaoJson === 'object' &&
        attr.condicaoJson !== null &&
        !Array.isArray(attr.condicaoJson)
          ? (attr.condicaoJson as Record<string, any>)
          : undefined

      const dto: AtributoEstruturaDTO = {
        id: attr.id,
        codigo: attr.codigo,
        nome: attr.nome,
        tipo: attr.tipo,
        obrigatorio: attr.obrigatorio,
        multivalorado: attr.multivalorado,
        validacoes,
        orientacaoPreenchimento: attr.orientacaoPreenchimento || undefined,
        dominio: attr.dominio.map(d => ({ codigo: d.codigo, descricao: d.descricao })),
        descricaoCondicao: attr.descricaoCondicao || undefined,
        condicao,
        parentCodigo: attr.parentCodigo || undefined,
        condicionanteCodigo: attr.condicionanteCodigo || undefined
      }

      mapa.set(attr.id, dto)
    }

    for (const attr of atributos) {
      const dto = mapa.get(attr.id)!
      if (attr.parentId) {
        const parent = mapa.get(attr.parentId)
        if (parent) {
          if (!parent.subAtributos) parent.subAtributos = []
          parent.subAtributos.push(dto)
        } else {
          raizes.push(dto)
        }
      } else {
        raizes.push(dto)
      }
    }

    return {
      versaoId,
      versaoNumero,
      estrutura: raizes
    }
  }

  private async sincronizarEstrutura(
    ncm: string,
    modalidade: string
  ): Promise<EstruturaComVersao> {
    const estruturaLegacy = await this.carregarEstruturaLegacy(ncm, modalidade)

    const versaoCriada = await catalogoPrisma.$transaction(async tx => {
      const ultimaVersao = await tx.atributoVersao.findFirst({
        where: { ncmCodigo: ncm, modalidade },
        orderBy: { versao: 'desc' }
      })

      const versaoNumero = (ultimaVersao?.versao ?? 0) + 1
      const versao = await tx.atributoVersao.create({
        data: {
          ncmCodigo: ncm,
          modalidade,
          versao: versaoNumero
        }
      })

      const ordem = { valor: 0 }

      const criarRecursivo = async (
        attrs: AtributoEstruturaDTO[],
        parentId?: number
      ) => {
        for (const attr of attrs) {
          const registro = await tx.atributo.create({
            data: {
              versaoId: versao.id,
              codigo: attr.codigo,
              nome: attr.nome,
              tipo: attr.tipo,
              obrigatorio: attr.obrigatorio,
              multivalorado: attr.multivalorado,
              orientacaoPreenchimento: attr.orientacaoPreenchimento ?? null,
              validacoesJson: attr.validacoes as Prisma.InputJsonValue,
              descricaoCondicao: attr.descricaoCondicao ?? null,
              condicaoJson: attr.condicao
                ? (attr.condicao as Prisma.InputJsonValue)
                : Prisma.JsonNull,
              parentCodigo: attr.parentCodigo ?? null,
              condicionanteCodigo: attr.condicionanteCodigo ?? null,
              ordem: ordem.valor++,
              parentId: parentId ?? null
            }
          })

          if (attr.dominio?.length) {
            await tx.atributoDominio.createMany({
              data: attr.dominio.map((dominio, index) => ({
                atributoId: registro.id,
                codigo: dominio.codigo,
                descricao: dominio.descricao,
                ordem: index
              }))
            })
          }

          if (attr.subAtributos?.length) {
            await criarRecursivo(attr.subAtributos, registro.id)
          }
        }
      }

      await criarRecursivo(estruturaLegacy)

      return { id: versao.id, versao: versaoNumero }
    })

    AtributoLegacyService.notificarInvalidacao(ncm, modalidade)

    return this.montarEstrutura(versaoCriada.id, versaoCriada.versao)
  }
}

