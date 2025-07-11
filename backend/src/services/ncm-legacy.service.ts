import { legacyPrisma, catalogoPrisma } from '../utils/prisma'
import { Prisma } from '@prisma/client'

export interface NcmInfo {
  descricao: string | null
  unidadeMedida: string | null
}

export class NcmLegacyService {
  async buscarNcm(codigo: string): Promise<NcmInfo | null> {
    const rows = await legacyPrisma.$queryRaw<Array<{
      descricao: string | null
      unidade_medida: string | null
    }>>(Prisma.sql`
      SELECT t.descricao, u.sigla AS unidade_medida
        FROM TEC t
        LEFT JOIN UNIMED u ON u.codigo = t.unidade_medida
       WHERE t.codigo = ${codigo}
    `)

    if (rows.length === 0) return null
    const row = rows[0]
    return { descricao: row.descricao, unidadeMedida: row.unidade_medida }
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

