import { legacyPrisma } from '../utils/prisma'
import { Prisma } from '@prisma/client'

export interface DominioDTO {
  codigo: string
  descricao: string | null
}

export interface AtributoEstruturaDTO {
  codigo: string
  nome: string
  tipo: string
  obrigatorio: boolean
  multivalorado: boolean
  validacoes: Record<string, any>
  dominio?: DominioDTO[]
  parentCodigo?: string
  subAtributos?: AtributoEstruturaDTO[]
}

export class AtributoLegacyService {
  async buscarEstrutura(ncm: string, modalidade: string = 'IMPORTACAO'): Promise<AtributoEstruturaDTO[]> {
    const rows = await legacyPrisma.$queryRaw<Array<{
      codigo: string
      nome_apresentacao: string
      forma_preenchimento: string
      obrigatorio: number | null
      multivalorado: number | null
      tamanho_maximo: number | null
      casas_decimais: number | null
      mascara: string | null
      parent_codigo: string | null
      dominio_codigo: string | null
      dominio_descricao: string | null
    }>>(Prisma.sql`
      SELECT a.codigo, a.nome_apresentacao, a.forma_preenchimento,
             av.obrigatorio, COALESCE(av.multivalorado, a.multivalorado) AS multivalorado,
             a.tamanho_maximo, a.casas_decimais, a.mascara, a.parent_codigo,
             ad.codigo AS dominio_codigo, ad.descricao AS dominio_descricao
      FROM atributo_vinculo av
        JOIN atributo a ON a.codigo = av.codigo
        LEFT JOIN atributo_dominio ad ON ad.atributo_codigo = a.codigo
      WHERE av.codigo_ncm = ${ncm} AND av.modalidade = ${modalidade}
      ORDER BY a.codigo, ad.id
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

    const roots: AtributoEstruturaDTO[] = []
    for (const attr of map.values()) {
      if (attr.parentCodigo) {
        const parent = map.get(attr.parentCodigo)
        if (parent) {
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
}

