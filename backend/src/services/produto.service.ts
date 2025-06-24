import { catalogoPrisma, legacyPrisma } from '../utils/prisma';

export interface CreateProdutoDTO {
  nome: string;
  ncmCodigo: string;
  valores?: Record<string, any>;
}

export class ProdutoService {
  async obterEstruturaAtributos(ncmCodigo: string): Promise<any> {
    const existente = await catalogoPrisma.ncm.findUnique({ where: { codigo: ncmCodigo } });
    if (existente) {
      return existente.estrutura as any;
    }

    // Busca na base legacy (simulação)
    const resultado: any[] = await legacyPrisma.$queryRawUnsafe(
      `SELECT estrutura_json FROM atributos_ncm WHERE codigo_ncm = '${ncmCodigo}' LIMIT 1`
    );
    const estrutura = resultado[0]?.estrutura_json || [];

    await catalogoPrisma.ncm.create({ data: { codigo: ncmCodigo, estrutura } });

    return estrutura;
  }

  async criar(data: CreateProdutoDTO) {
    const estrutura = await this.obterEstruturaAtributos(data.ncmCodigo);
    return catalogoPrisma.produto.create({
      data: {
        nome: data.nome,
        ncmCodigo: data.ncmCodigo,
        estruturaAtributos: estrutura,
        valoresAtributos: data.valores || {},
      },
    });
  }

  async listar() {
    return catalogoPrisma.produto.findMany({ orderBy: { id: 'desc' } });
  }
}
