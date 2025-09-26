import { legacyPrisma, catalogoPrisma } from '../utils/prisma'
import { Prisma } from '@prisma/client'

export interface NcmInfo {
  descricao: string | null
  unidadeMedida: string | null
}

export interface NcmSugestao {
  codigo: string
  descricao: string | null
}

export class NcmLegacyService {
  async buscarNcm(codigo: string): Promise<NcmInfo | null> {
    const rows = await legacyPrisma.$queryRaw<Array<{
      descricao: string | null
      unidade_medida: string | null
    }>>(Prisma.sql`
      SELECT t.mercadoria as descricao, u.sigla AS unidade_medida
        FROM tec t
        LEFT JOIN unimed u ON u.codigo = t.unidade
       WHERE t.codigo = ${codigo}
    `)

    if (rows.length === 0) return null
    const row = rows[0]
    return { descricao: row.descricao, unidadeMedida: row.unidade_medida }
  }

  async buscarSugestoes(prefixo: string): Promise<NcmSugestao[]> {
    const likePattern = `${prefixo}%`
    const rows = await legacyPrisma.$queryRaw<Array<{
      codigo: string
      descricao: string | null
    }>>(Prisma.sql`
      SELECT t.codigo, t.mercadoria AS descricao
        FROM tec t
       WHERE CHAR_LENGTH(t.codigo) = 8
         AND t.sequencial = 1
         AND t.codigo LIKE ${likePattern}
       ORDER BY t.codigo ASC
       LIMIT 10
    `)

    return rows.map(row => ({ codigo: row.codigo, descricao: row.descricao }))
  }

  async sincronizarNcm(codigo: string): Promise<NcmInfo | null> {
    const info = await this.buscarNcm(codigo)
    if (!info) return null

    await catalogoPrisma.ncmCache.upsert({
      where: { codigo },
      create: {
        codigo,
        descricao: info.descricao,
        unidadeMedida: info.unidadeMedida,
        dataUltimaSincronizacao: new Date()
      },
      update: {
        descricao: info.descricao,
        unidadeMedida: info.unidadeMedida,
        dataUltimaSincronizacao: new Date()
      }
    })

    return info
  }
}

