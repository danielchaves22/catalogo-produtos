import {
  ImportacaoProdutoItemResultado,
  ImportacaoResultado,
  MensagemCategoria,
  Prisma,
} from '@prisma/client';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { ProdutoService } from './produto.service';
import { ValidationError } from '../types/validation-error';

const execFileAsync = promisify(execFile);

export interface ArquivoImportacao {
  nome: string;
  conteudoBase64: string;
}

export interface NovaImportacaoPlanilhaInput {
  catalogoId: number;
  modalidade?: string;
  arquivo: ArquivoImportacao;
}

interface MensagensItemImportacao {
  impeditivos: string[];
  atencao: string[];
}

export class ProdutoImportacaoService {
  private produtoService = new ProdutoService();

  async importarPlanilhaExcel(
    dados: NovaImportacaoPlanilhaInput,
    superUserId: number,
    usuarioLegacyId?: number
  ) {
    const catalogo = await catalogoPrisma.catalogo.findFirst({
      where: { id: dados.catalogoId, superUserId }
    });

    if (!catalogo) {
      throw new Error('Catálogo não encontrado para o superusuário informado');
    }

    let usuarioCatalogoId: number | null = null;
    if (usuarioLegacyId) {
      const usuarioCatalogo = await catalogoPrisma.usuarioCatalogo.findFirst({
        where: {
          legacyId: usuarioLegacyId,
          superUserId
        }
      });

      usuarioCatalogoId = usuarioCatalogo?.id ?? null;
    }

    if (!dados.arquivo?.conteudoBase64 || !dados.arquivo?.nome) {
      throw new Error('Arquivo Excel não foi enviado');
    }

    if (!dados.arquivo.nome.toLowerCase().endsWith('.xlsx')) {
      throw new Error('Formato inválido: envie um arquivo .xlsx');
    }

    const buffer = this.converterBase64(dados.arquivo.conteudoBase64);
    if (!buffer?.length) {
      throw new Error('Conteúdo do arquivo inválido');
    }

    const importacao = await catalogoPrisma.importacaoProduto.create({
      data: {
        superUserId,
        usuarioCatalogoId,
        catalogoId: dados.catalogoId,
        modalidade: (dados.modalidade || 'IMPORTACAO').toUpperCase(),
        nomeArquivo: dados.arquivo.nome,
        situacao: 'EM_ANDAMENTO',
        resultado: 'PENDENTE'
      }
    });

    let totalRegistros = 0;
    let totalCriados = 0;
    let totalComAtencao = 0;
    let totalComErro = 0;

    try {
      const linhas = await this.lerPlanilha(buffer);
      if (!linhas || linhas.length <= 1) {
        throw new Error('A planilha não possui dados para importação');
      }

      const modalidade = (dados.modalidade || 'IMPORTACAO').toUpperCase();

      for (let index = 1; index < linhas.length; index++) {
        const linha = linhas[index];
        const linhaPlanilha = index + 1;
        const celulas = Array.isArray(linha) ? linha : [];
        const ncmBruta = (celulas[0] ?? '').toString().trim();
        const denominacaoBruta = (celulas[1] ?? '').toString().trim();
        const codigosBrutos = (celulas[2] ?? '').toString().trim();

        if (!ncmBruta && !denominacaoBruta && !codigosBrutos) {
          continue;
        }

        totalRegistros += 1;

        const mensagens: MensagensItemImportacao = {
          impeditivos: [],
          atencao: []
        };

        const ncmNormalizada = this.normalizarNcm(ncmBruta, mensagens.impeditivos);
        const denominacao = denominacaoBruta;

        if (!denominacao) {
          mensagens.impeditivos.push('Nome (obrigatório) não informado');
        }

        let codigosInternos: string[] | undefined;
        if (!codigosBrutos) {
          mensagens.atencao.push('Códigos internos / SKU não informados');
        } else {
          const partes = codigosBrutos
            .split(',')
            .map(p => p.trim())
            .filter(Boolean);

          const invalidos = partes.filter(p => !/^\d+$/.test(p));
          if (invalidos.length > 0) {
            mensagens.atencao.push('Campo Códigos internos / SKU mal formatado');
          } else if (partes.length > 0) {
            codigosInternos = partes;
          }
        }

        if (ncmNormalizada) {
          const ncmCache = await catalogoPrisma.ncmCache.findUnique({
            where: { codigo: ncmNormalizada }
          });
          if (!ncmCache) {
            mensagens.impeditivos.push('NCM não encontrada');
          }
        }

        let resultadoItem: ImportacaoProdutoItemResultado = 'ERRO';
        let produtoId: number | null = null;

        if (mensagens.impeditivos.length === 0 && ncmNormalizada && denominacao) {
          try {
            const produto = await this.produtoService.criar(
              {
                ncmCodigo: ncmNormalizada,
                modalidade,
                catalogoId: dados.catalogoId,
                denominacao,
                descricao: denominacao,
                codigosInternos
              },
              superUserId
            );

            produtoId = produto.id;
            totalCriados += 1;
            if (mensagens.atencao.length > 0) {
              resultadoItem = 'ATENCAO';
              totalComAtencao += 1;
            } else {
              resultadoItem = 'SUCESSO';
            }
          } catch (error) {
            if (error instanceof ValidationError) {
              mensagens.impeditivos.push(
                error.details.map(d => `${d.field}: ${d.message}`).join('; ')
              );
            } else {
              const mensagemErro =
                error instanceof Error ? error.message : 'Erro desconhecido na criação do produto';
              mensagens.impeditivos.push(`Erro ao criar produto: ${mensagemErro}`);
            }
            resultadoItem = 'ERRO';
            totalComErro += 1;
          }
        } else {
          totalComErro += 1;
        }

        await catalogoPrisma.importacaoProdutoItem.create({
          data: {
            importacaoId: importacao.id,
            linhaPlanilha,
            ncm: ncmNormalizada ?? null,
            denominacao: denominacao || null,
            codigosInternos: codigosBrutos || null,
            resultado: resultadoItem,
            mensagens: mensagens as unknown as Prisma.InputJsonValue,
            possuiErroImpeditivo: mensagens.impeditivos.length > 0,
            possuiAlerta: mensagens.atencao.length > 0,
            produtoId
          }
        });
      }

      const resultadoFinal: ImportacaoResultado =
        totalComErro > 0 || totalComAtencao > 0 ? 'ATENCAO' : 'SUCESSO';

      await catalogoPrisma.importacaoProduto.update({
        where: { id: importacao.id },
        data: {
          situacao: 'CONCLUIDA',
          resultado: resultadoFinal,
          totalRegistros,
          totalCriados,
          totalComAtencao,
          totalComErro,
          finalizadoEm: new Date()
        }
      });

      await this.registrarConclusaoImportacao({
        importacaoId: importacao.id,
        superUserId,
        catalogo,
        usuarioCatalogoId,
        totais: {
          totalRegistros,
          totalCriados,
          totalComAtencao,
          totalComErro,
        },
        resultado: resultadoFinal,
      });

      return this.obterImportacao(importacao.id, superUserId);
    } catch (error) {
      logger.error('Falha ao processar planilha de importação:', error);

      await catalogoPrisma.importacaoProduto.update({
        where: { id: importacao.id },
        data: {
          situacao: 'CONCLUIDA',
          resultado: 'ATENCAO',
          totalRegistros,
          totalCriados,
          totalComAtencao,
          totalComErro: totalComErro || (totalRegistros - totalCriados),
          finalizadoEm: new Date()
        }
      });

      await this.registrarConclusaoImportacao({
        importacaoId: importacao.id,
        superUserId,
        catalogo,
        usuarioCatalogoId,
        totais: {
          totalRegistros,
          totalCriados,
          totalComAtencao,
          totalComErro: totalComErro || (totalRegistros - totalCriados),
        },
        resultado: 'ATENCAO',
      });

      throw error;
    }
  }

  async listarImportacoes(superUserId: number) {
    return catalogoPrisma.importacaoProduto.findMany({
      where: { superUserId },
      orderBy: { iniciadoEm: 'desc' },
      include: {
        catalogo: {
          select: {
            id: true,
            nome: true,
            numero: true,
            cpf_cnpj: true
          }
        }
      }
    });
  }

  async obterImportacao(id: number, superUserId: number) {
    return catalogoPrisma.importacaoProduto.findFirst({
      where: { id, superUserId },
      include: {
        catalogo: {
          select: {
            id: true,
            nome: true,
            numero: true,
            cpf_cnpj: true
          }
        },
        itens: {
          orderBy: { linhaPlanilha: 'asc' }
        }
      }
    });
  }

  async removerImportacao(id: number, superUserId: number) {
    const existente = await catalogoPrisma.importacaoProduto.findFirst({
      where: { id, superUserId },
      select: { id: true }
    });

    if (!existente) {
      return false;
    }

    await catalogoPrisma.importacaoProduto.delete({ where: { id: existente.id } });
    return true;
  }

  async limparHistorico(superUserId: number) {
    await catalogoPrisma.importacaoProduto.deleteMany({
      where: { superUserId }
    });
  }

  private converterBase64(base64: string): Buffer {
    const limpo = base64.replace(/^data:[^;]+;base64,/, '').trim();
    return Buffer.from(limpo, 'base64');
  }

  private normalizarNcm(ncm: string, erros: string[]): string | null {
    if (!ncm) {
      erros.push('NCM (obrigatório) não informada');
      return null;
    }

    const semEspacos = ncm.replace(/\s+/g, '');
    const apenasDigitos = semEspacos.replace(/\D/g, '');

    if (apenasDigitos.length !== 8) {
      erros.push('NCM não formatada corretamente');
      return null;
    }

    if (apenasDigitos !== semEspacos) {
      erros.push('NCM não formatada corretamente');
      return null;
    }

    return apenasDigitos;
  }

  private async lerPlanilha(buffer: Buffer): Promise<string[][]> {
    const dirTemporario = await fs.mkdtemp(join(tmpdir(), 'import-produto-'));
    const arquivoTemporario = join(dirTemporario, `${randomUUID()}.xlsx`);
    const caminhoScript = resolve(process.cwd(), 'scripts/parse_excel.py');

    try {
      await fs.writeFile(arquivoTemporario, buffer);
      const { stdout } = await this.executarPython(caminhoScript, arquivoTemporario);
      const conteudo = stdout.trim();
      if (!conteudo) {
        throw new Error('Falha ao interpretar o conteúdo da planilha');
      }
      return JSON.parse(conteudo);
    } finally {
      await fs.rm(dirTemporario, { recursive: true, force: true });
    }
  }

  private async executarPython(script: string, arquivo: string) {
    try {
      return await execFileAsync('python3', [script, arquivo], { maxBuffer: 10 * 1024 * 1024 });
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return execFileAsync('python', [script, arquivo], { maxBuffer: 10 * 1024 * 1024 });
      }
      throw error;
    }
  }

  private async registrarConclusaoImportacao(params: {
    importacaoId: number;
    superUserId: number;
    catalogo: { id: number; nome: string; numero: number; cpf_cnpj: string | null } | null;
    usuarioCatalogoId: number | null;
    totais: {
      totalRegistros: number;
      totalCriados: number;
      totalComAtencao: number;
      totalComErro: number;
    };
    resultado: ImportacaoResultado;
  }) {
    const {
      importacaoId,
      superUserId,
      catalogo,
      usuarioCatalogoId,
      totais: { totalRegistros, totalCriados, totalComAtencao, totalComErro },
      resultado,
    } = params;

    const tituloBase = catalogo?.nome ? `Importação do catálogo ${catalogo.nome} concluída` : 'Importação de produtos concluída';
    const descricaoResultado = resultado === 'SUCESSO' ? 'Sucesso' : resultado === 'ATENCAO' ? 'Atenção' : resultado;

    const conteudoResumo = [
      `Resultado: ${descricaoResultado}`,
      `Total de registros: ${totalRegistros}`,
      `Produtos criados: ${totalCriados}`,
      `Com atenção: ${totalComAtencao}`,
      `Com erro: ${totalComErro}`,
    ].join('\n');

    const metadados: Prisma.InputJsonValue = {
      tipo: MensagemCategoria.IMPORTACAO_CONCLUIDA,
      importacaoId,
      catalogoId: catalogo?.id ?? null,
      usuarioCatalogoId,
      resultado,
      totais: {
        totalRegistros,
        totalCriados,
        totalComAtencao,
        totalComErro,
      },
    };

    await catalogoPrisma.mensagem.create({
      data: {
        superUserId,
        titulo: tituloBase,
        conteudo: conteudoResumo,
        categoria: MensagemCategoria.IMPORTACAO_CONCLUIDA,
        metadados,
      },
    });
  }
}
