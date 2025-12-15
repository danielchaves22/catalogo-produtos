// backend/src/services/ajuste-estrutura.service.ts
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { AtributoEstruturaDTO, AtributoLegacyService } from './atributo-legacy.service';

export interface DiferencaAtributo {
  codigo: string;
  tipo: 'ADICIONADO' | 'REMOVIDO' | 'MODIFICADO';
  campo?: string;
  valorAntigo?: any;
  valorNovo?: any;
}

export interface AjusteEstruturaResultado {
  produtoId: number;
  produtoCodigo: string;
  ncmCodigo: string;
  statusAnterior: string;
  statusNovo: string;
  valoresLimpos: number;
  valoresPreservados: number;
}

export interface AjusteLoteResultado {
  totalAjustados: number;
  totalPendentes: number;
  totalAprovados: number;
  valoresLimpos: number;
  detalhes: AjusteEstruturaResultado[];
}

export class AjusteEstruturaService {
  private atributoLegacyService: AtributoLegacyService;

  constructor() {
    this.atributoLegacyService = new AtributoLegacyService();
  }

  /**
   * Marca produtos de uma NCM/modalidade como necessitando ajuste de estrutura
   */
  async marcarProdutosParaAjuste(
    ncmCodigo: string,
    modalidade: string
  ): Promise<number> {
    const result = await catalogoPrisma.produto.updateMany({
      where: {
        ncmCodigo,
        modalidade,
      },
      data: {
        status: 'AJUSTAR_ESTRUTURA',
      },
    });

    logger.info(`Marcados ${result.count} produtos da NCM ${ncmCodigo} (${modalidade}) para ajuste de estrutura`);
    return result.count;
  }

  /**
   * Ajusta a estrutura de um único produto
   */
  async ajustarEstruturaProduto(
    produtoId: number,
    superUserId: number
  ): Promise<AjusteEstruturaResultado> {
    const produto = await catalogoPrisma.produto.findFirst({
      where: {
        id: produtoId,
        catalogo: { superUserId },
      },
      include: {
        atributos: {
          include: {
            valores: true,
            atributo: {
              include: {
                dominio: true,
              },
            },
          },
        },
      },
    });

    if (!produto) {
      throw new Error('Produto não encontrado');
    }

    if (produto.status !== 'AJUSTAR_ESTRUTURA') {
      throw new Error('Produto não necessita ajuste de estrutura');
    }

    // Buscar nova estrutura do SISCOMEX
    const novaEstrutura = await this.atributoLegacyService.getAtributos(
      produto.ncmCodigo,
      produto.modalidade || 'IMPORTACAO'
    );

    // Migrar valores
    const { valoresLimpos, valoresPreservados } = await this.migrarValores(
      produto,
      novaEstrutura.estrutura
    );

    // Recalcular status baseado em atributos obrigatórios
    const novoStatus = await this.calcularNovoStatus(
      produto.id,
      novaEstrutura.estrutura
    );

    // Atualizar produto
    await catalogoPrisma.produto.update({
      where: { id: produtoId },
      data: {
        status: novoStatus,
        versaoAtributoId: novaEstrutura.versaoId,
      },
    });

    logger.info(
      `Ajustada estrutura do produto ${produto.codigo} (${produto.id}): ${produto.status} → ${novoStatus}`
    );

    return {
      produtoId: produto.id,
      produtoCodigo: produto.codigo || '',
      ncmCodigo: produto.ncmCodigo,
      statusAnterior: produto.status,
      statusNovo: novoStatus,
      valoresLimpos,
      valoresPreservados,
    };
  }

  /**
   * Ajusta estrutura de múltiplos produtos em lote
   */
  async ajustarEstruturaLote(
    produtoIds: number[],
    superUserId: number
  ): Promise<AjusteLoteResultado> {
    const detalhes: AjusteEstruturaResultado[] = [];
    let totalPendentes = 0;
    let totalAprovados = 0;
    let totalValoresLimpos = 0;

    for (const produtoId of produtoIds) {
      try {
        const resultado = await this.ajustarEstruturaProduto(produtoId, superUserId);
        detalhes.push(resultado);

        if (resultado.statusNovo === 'PENDENTE') {
          totalPendentes++;
        } else if (resultado.statusNovo === 'APROVADO') {
          totalAprovados++;
        }

        totalValoresLimpos += resultado.valoresLimpos;
      } catch (error) {
        logger.error(`Erro ao ajustar produto ${produtoId}:`, error);
      }
    }

    return {
      totalAjustados: detalhes.length,
      totalPendentes,
      totalAprovados,
      valoresLimpos: totalValoresLimpos,
      detalhes,
    };
  }

  /**
   * Lista NCMs divergentes dos produtos do usuário
   */
  async listarNcmsDivergentes(superUserId: number): Promise<any[]> {
    const produtosComAjuste = await catalogoPrisma.produto.findMany({
      where: {
        status: 'AJUSTAR_ESTRUTURA',
        catalogo: { superUserId },
      },
      select: {
        ncmCodigo: true,
        modalidade: true,
        catalogoId: true,
        catalogo: {
          select: {
            id: true,
            nome: true,
            numero: true,
          },
        },
      },
    });

    // Agrupar por NCM/modalidade
    const grupos = new Map<string, any>();

    for (const produto of produtosComAjuste) {
      const chave = `${produto.ncmCodigo}-${produto.modalidade}`;

      if (!grupos.has(chave)) {
        grupos.set(chave, {
          ncmCodigo: produto.ncmCodigo,
          modalidade: produto.modalidade,
          totalProdutos: 0,
          catalogos: new Map<number, any>(),
        });
      }

      const grupo = grupos.get(chave)!;
      grupo.totalProdutos++;

      if (!grupo.catalogos.has(produto.catalogoId)) {
        grupo.catalogos.set(produto.catalogoId, {
          catalogoId: produto.catalogo.id,
          catalogoNome: produto.catalogo.nome,
          catalogoNumero: produto.catalogo.numero,
          produtos: [],
        });
      }
    }

    // Buscar produtos completos para cada grupo
    for (const [chave, grupo] of grupos.entries()) {
      const produtosDetalhados = await catalogoPrisma.produto.findMany({
        where: {
          ncmCodigo: grupo.ncmCodigo,
          modalidade: grupo.modalidade,
          status: 'AJUSTAR_ESTRUTURA',
          catalogo: { superUserId },
        },
        select: {
          id: true,
          codigo: true,
          denominacao: true,
          catalogoId: true,
        },
      });

      // Distribuir produtos por catálogo
      for (const prod of produtosDetalhados) {
        const catalogo = grupo.catalogos.get(prod.catalogoId);
        if (catalogo) {
          catalogo.produtos.push({
            id: prod.id,
            codigo: prod.codigo,
            denominacao: prod.denominacao,
          });
        }
      }

      grupo.produtosPorCatalogo = Array.from(grupo.catalogos.values());
      delete grupo.catalogos;
    }

    return Array.from(grupos.values());
  }

  /**
   * Conta produtos que necessitam ajuste de estrutura
   */
  async contarProdutosComAjuste(superUserId: number): Promise<number> {
    return await catalogoPrisma.produto.count({
      where: {
        status: 'AJUSTAR_ESTRUTURA',
        catalogo: { superUserId },
      },
    });
  }

  /**
   * Migra valores de atributos do produto para nova estrutura
   */
  private async migrarValores(
    produto: any,
    novaEstrutura: AtributoEstruturaDTO[]
  ): Promise<{ valoresLimpos: number; valoresPreservados: number }> {
    let valoresLimpos = 0;
    let valoresPreservados = 0;

    // Mapear atributos atuais por código
    const atributosAtuais = new Map(
      produto.atributos.map((pa: any) => [pa.atributo.codigo, pa])
    );

    // Mapear nova estrutura por código
    const novaEstruturaMap = new Map(
      novaEstrutura.map((attr) => [attr.codigo, attr])
    );

    // Processar atributos atuais
    for (const [codigo, produtoAtributo] of atributosAtuais.entries()) {
      const atributoNovo = novaEstruturaMap.get(codigo);

      if (!atributoNovo) {
        // Atributo foi removido - limpar valores
        await catalogoPrisma.produtoAtributo.delete({
          where: { id: produtoAtributo.id },
        });
        valoresLimpos++;
        logger.debug(`Removido atributo ${codigo} do produto ${produto.id}`);
        continue;
      }

      // Verificar se tipo/estrutura mudou
      const atributoAtual = produtoAtributo.atributo;
      const deveLimpar = this.deveLimparValor(atributoAtual, atributoNovo);

      if (deveLimpar) {
        // Limpar valores incompatíveis
        await catalogoPrisma.produtoAtributoValor.deleteMany({
          where: { produtoAtributoId: produtoAtributo.id },
        });
        valoresLimpos++;
        logger.debug(`Limpos valores do atributo ${codigo} do produto ${produto.id}`);
      } else {
        valoresPreservados++;
      }
    }

    return { valoresLimpos, valoresPreservados };
  }

  /**
   * Determina se um valor deve ser limpo devido a incompatibilidade
   */
  private deveLimparValor(
    atributoAntigo: any,
    atributoNovo: AtributoEstruturaDTO
  ): boolean {
    // Tipo mudou
    if (atributoAntigo.tipo !== atributoNovo.tipo) {
      return true;
    }

    // Multivaloração mudou
    if (atributoAntigo.multivalorado !== atributoNovo.multivalorado) {
      return true;
    }

    // Se tinha domínio e agora tem domínio diferente
    if (atributoAntigo.dominio && atributoAntigo.dominio.length > 0) {
      if (!atributoNovo.dominio || atributoNovo.dominio.length === 0) {
        // Domínio removido - limpar
        return true;
      }

      // Verificar se códigos de domínio mudaram
      const codigosAntigos = new Set(
        atributoAntigo.dominio.map((d: any) => d.codigo)
      );
      const codigosNovos = new Set(
        atributoNovo.dominio.map((d: any) => d.codigo)
      );

      // Se domínios são completamente diferentes, limpar
      const todosRemovidos = Array.from(codigosAntigos).every(
        (c) => !codigosNovos.has(c)
      );
      if (todosRemovidos) {
        return true;
      }
    }

    // Não mudou de forma significativa - preservar
    return false;
  }

  /**
   * Calcula novo status baseado em atributos obrigatórios
   */
  private async calcularNovoStatus(
    produtoId: number,
    estrutura: AtributoEstruturaDTO[]
  ): Promise<'PENDENTE' | 'APROVADO'> {
    const produto = await catalogoPrisma.produto.findUnique({
      where: { id: produtoId },
      include: {
        atributos: {
          include: {
            valores: true,
            atributo: true,
          },
        },
      },
    });

    if (!produto) {
      return 'PENDENTE';
    }

    // Verificar atributos obrigatórios
    // Considerar apenas atributos que têm valores preenchidos
    const atributosPreenchidos = new Set(
      produto.atributos
        .filter((pa) => pa.valores && pa.valores.length > 0)
        .map((pa) => pa.atributo.codigo)
    );

    const obrigatoriosNaoPreenchidos = this.encontrarObrigatoriosNaoPreenchidos(
      estrutura,
      atributosPreenchidos
    );

    return obrigatoriosNaoPreenchidos.length > 0 ? 'PENDENTE' : 'APROVADO';
  }

  /**
   * Encontra atributos obrigatórios não preenchidos
   */
  private encontrarObrigatoriosNaoPreenchidos(
    estrutura: AtributoEstruturaDTO[],
    preenchidos: Set<string>
  ): string[] {
    const naoPreenchidos: string[] = [];

    for (const atributo of estrutura) {
      // Pular atributos condicionais (por simplicidade, assumimos que não são obrigatórios se condicionais)
      if (atributo.condicoes && atributo.condicoes.length > 0) {
        continue;
      }

      if (atributo.obrigatorio && !preenchidos.has(atributo.codigo)) {
        naoPreenchidos.push(atributo.codigo);
      }

      // Recursivamente verificar subatributos
      if (atributo.subAtributos && atributo.subAtributos.length > 0) {
        const subNaoPreenchidos = this.encontrarObrigatoriosNaoPreenchidos(
          atributo.subAtributos,
          preenchidos
        );
        naoPreenchidos.push(...subNaoPreenchidos);
      }
    }

    return naoPreenchidos;
  }
}
