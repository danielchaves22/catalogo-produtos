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
import { OperadorEstrangeiroProdutoInput, ProdutoService } from './produto.service';
import { ValidationError } from '../types/validation-error';
import {
  enqueueProdutoImportacaoJob,
  ProdutoImportacaoJobData,
  registerProdutoImportacaoProcessor,
} from '../jobs/produto-importacao.job';
import { NcmValoresPadraoService } from './ncm-valores-padrao.service';
import { NcmLegacyService } from './ncm-legacy.service';

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
  private valoresPadraoService = new NcmValoresPadraoService();
  private ncmLegacyService = new NcmLegacyService();

  async importarPlanilhaExcel(
    dados: NovaImportacaoPlanilhaInput,
    superUserId: number,
    usuarioLegacyId?: number
  ) {
    const catalogoExiste = await catalogoPrisma.catalogo.findFirst({
      where: { id: dados.catalogoId, superUserId },
      select: { id: true }
    });

    if (!catalogoExiste) {
      throw new Error('Catálogo não encontrado para o superusuário informado');
    }

    const usuarioCatalogoId = await this.obterUsuarioCatalogoId(superUserId, usuarioLegacyId);

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

    const modalidade = (dados.modalidade || 'IMPORTACAO').toUpperCase();

    const importacao = await catalogoPrisma.importacaoProduto.create({
      data: {
        superUserId,
        usuarioCatalogoId,
        catalogoId: dados.catalogoId,
        modalidade,
        nomeArquivo: dados.arquivo.nome,
        situacao: 'EM_ANDAMENTO',
        resultado: 'PENDENTE'
      }
    });

    try {
      await enqueueProdutoImportacaoJob({
        importacaoId: importacao.id,
        superUserId,
        usuarioCatalogoId,
        catalogoId: dados.catalogoId,
        modalidade,
        arquivo: {
          nome: dados.arquivo.nome,
          conteudoBase64: dados.arquivo.conteudoBase64
        }
      });
    } catch (error) {
      logger.error('Falha ao enfileirar processamento de importação de produtos:', error);

      await catalogoPrisma.importacaoProduto.update({
        where: { id: importacao.id },
        data: {
          situacao: 'CONCLUIDA',
          resultado: 'ATENCAO',
          totalRegistros: 0,
          totalCriados: 0,
          totalComAtencao: 0,
          totalComErro: 0,
          finalizadoEm: new Date()
        }
      });

      throw new Error('Não foi possível iniciar o processamento da planilha.');
    }

    return importacao;
  }

  async processarImportacaoJob(dados: ProdutoImportacaoJobData) {
    const catalogo = await catalogoPrisma.catalogo.findFirst({
      where: { id: dados.catalogoId, superUserId: dados.superUserId },
      select: { id: true, nome: true, numero: true, cpf_cnpj: true }
    });

    const buffer = this.converterBase64(dados.arquivo.conteudoBase64);
    if (!buffer?.length) {
      throw new Error('Conteúdo do arquivo inválido');
    }

    let totalRegistros = 0;
    let totalCriados = 0;
    let totalComAtencao = 0;
    let totalComErro = 0;

    try {
      const linhas = await this.lerPlanilha(buffer);
      if (!linhas || linhas.length <= 1) {
        throw new Error('A planilha não possui dados para importação');
      }

      const cacheValoresPadrao = new Map<string, Prisma.JsonValue | null>();
      const paises = await catalogoPrisma.pais.findMany({ select: { codigo: true } });
      const codigosPaisValidos = new Set(
        paises
          .map(pais => pais.codigo?.trim().toUpperCase())
          .filter((codigo): codigo is string => Boolean(codigo))
      );
      const operadoresPorNumero = new Map<
        number,
        { id: number; numero: number; paisCodigo: string }
      >();

      for (let index = 1; index < linhas.length; index++) {
        const linha = linhas[index];
        const linhaPlanilha = index + 1;
        const celulas = Array.isArray(linha) ? linha : [];
        const codigosBrutos = (celulas[0] ?? '').toString().trim();
        const denominacaoBruta = (celulas[1] ?? '').toString().trim();
        const descricaoLongaBruta = (celulas[2] ?? '').toString().trim();
        const ncmBruta = (celulas[3] ?? '').toString().trim();
        const fabricantesBrutos = (celulas[4] ?? '').toString().trim();
        const operadoresBrutos = (celulas[5] ?? '').toString().trim();

        if (
          !ncmBruta &&
          !denominacaoBruta &&
          !codigosBrutos &&
          !descricaoLongaBruta &&
          !fabricantesBrutos &&
          !operadoresBrutos
        ) {
          continue;
        }

        totalRegistros += 1;

        const mensagens: MensagensItemImportacao = {
          impeditivos: [],
          atencao: []
        };

        const ncmNormalizada = this.normalizarNcm(ncmBruta, mensagens.impeditivos);
        const denominacao = denominacaoBruta;
        const descricaoProduto = descricaoLongaBruta || denominacaoBruta;

        if (!denominacao) {
          mensagens.impeditivos.push('Nome (obrigatório) não informado');
        }

        let codigosInternos: string[] | undefined;
        if (!codigosBrutos) {
          mensagens.atencao.push('Códigos internos não informados');
        } else {
          const partes = codigosBrutos
            .split(',')
            .map(p => p.trim())
            .filter(Boolean);

          const invalidos = partes.filter(p => !/^[0-9A-Za-z]+$/.test(p));
          if (invalidos.length > 0) {
            mensagens.atencao.push('Campo Código interno mal formatado (somente letras e números separados por vírgula)');
          } else if (partes.length > 0) {
            codigosInternos = partes;
          }
        }

        let operadoresEstrangeiros: OperadorEstrangeiroProdutoInput[] | undefined;

        if (fabricantesBrutos) {
          const partesFabricante = fabricantesBrutos
            .split(',')
            .map(valor => valor.trim().toUpperCase())
            .filter(Boolean);

          if (partesFabricante.length > 0) {
            const formatosInvalidos = partesFabricante.filter(valor => !/^[A-Z]{2}$/.test(valor));
            if (formatosInvalidos.length > 0) {
              mensagens.impeditivos.push(
                `Fabricante contém códigos com formato inválido: ${formatosInvalidos.join(', ')}`
              );
            } else {
              const paisesInvalidos = partesFabricante.filter(
                valor => !codigosPaisValidos.has(valor)
              );
              if (paisesInvalidos.length > 0) {
                mensagens.impeditivos.push(
                  `Fabricante contém códigos de país não reconhecidos: ${paisesInvalidos.join(', ')}`
                );
              } else {
                const unicos = Array.from(new Set(partesFabricante));
                operadoresEstrangeiros = unicos.map<OperadorEstrangeiroProdutoInput>(codigo => ({
                  paisCodigo: codigo,
                  conhecido: false
                }));
              }
            }
          }
        }

        if (operadoresBrutos) {
          const partesOperador = operadoresBrutos
            .split(',')
            .map(p => p.trim())
            .filter(Boolean);

          const naoNumericos = partesOperador.filter(parte => !/^\d+$/.test(parte));
          if (naoNumericos.length > 0) {
            mensagens.impeditivos.push(
              `Operador estrangeiro contém valores inválidos: ${naoNumericos.join(', ')}`
            );
          } else if (partesOperador.length > 0) {
            const numeros = Array.from(new Set(partesOperador.map(parte => Number(parte))));
            const naoCarregados = numeros.filter(numero => !operadoresPorNumero.has(numero));

            if (naoCarregados.length > 0) {
              const operadoresEncontrados = await catalogoPrisma.operadorEstrangeiro.findMany({
                where: {
                  catalogoId: dados.catalogoId,
                  numero: { in: naoCarregados }
                },
                select: { id: true, numero: true, paisCodigo: true }
              });

              for (const operador of operadoresEncontrados) {
                operadoresPorNumero.set(operador.numero, {
                  id: operador.id,
                  numero: operador.numero,
                  paisCodigo: operador.paisCodigo.toUpperCase()
                });
              }

              const encontradosSet = new Set(operadoresEncontrados.map(o => o.numero));
              const naoEncontrados = naoCarregados.filter(numero => !encontradosSet.has(numero));
              if (naoEncontrados.length > 0) {
                mensagens.impeditivos.push(
                  `Operadores estrangeiros não encontrados: ${naoEncontrados.join(', ')}`
                );
              }
            }

            if (mensagens.impeditivos.length === 0) {
              const conhecidos = numeros
                .map(numero => operadoresPorNumero.get(numero))
                .filter((operador): operador is { id: number; numero: number; paisCodigo: string } =>
                  Boolean(operador)
                )
                .map<OperadorEstrangeiroProdutoInput>(operador => ({
                  paisCodigo: operador.paisCodigo,
                  conhecido: true,
                  operadorEstrangeiroId: operador.id
                }));

              if (conhecidos.length > 0) {
                const existentes = operadoresEstrangeiros ?? [];
                const combinados: OperadorEstrangeiroProdutoInput[] = [...existentes, ...conhecidos];
                const vistos = new Set<string>();
                operadoresEstrangeiros = combinados.filter(operador => {
                  const chave = `${operador.paisCodigo}|${operador.conhecido ? '1' : '0'}|${
                    operador.operadorEstrangeiroId ?? 'null'
                  }`;
                  if (vistos.has(chave)) {
                    return false;
                  }
                  vistos.add(chave);
                  return true;
                });
              }
            }
          }
        }

        if (ncmNormalizada) {
          const ncmCache = await catalogoPrisma.ncmCache.findUnique({
            where: { codigo: ncmNormalizada }
          });

          if (!ncmCache) {
            const ncmSincronizada = await this.ncmLegacyService.sincronizarNcm(
              ncmNormalizada
            );

            if (!ncmSincronizada) {
              mensagens.impeditivos.push('NCM não encontrada');
            }
          }
        }

        let resultadoItem: ImportacaoProdutoItemResultado = 'ERRO';
        let produtoId: number | null = null;

        if (mensagens.impeditivos.length === 0 && ncmNormalizada && denominacao) {
          const chaveTemplate = `${dados.superUserId}::${ncmNormalizada}::${dados.modalidade}`;
          if (!cacheValoresPadrao.has(chaveTemplate)) {
            const template = await this.valoresPadraoService.buscarPorNcm(
              ncmNormalizada,
              dados.superUserId,
              dados.modalidade
            );
            cacheValoresPadrao.set(chaveTemplate, template?.valoresJson ?? null);
          }

          const valoresPadrao = cacheValoresPadrao.get(chaveTemplate) ?? null;

          try {
            const produto = await this.produtoService.criar(
              {
                ncmCodigo: ncmNormalizada,
                modalidade: dados.modalidade,
                catalogoId: dados.catalogoId,
                denominacao,
                descricao: descricaoProduto || denominacao,
                valoresAtributos: (valoresPadrao ?? undefined) as
                  | Prisma.InputJsonValue
                  | undefined,
                codigosInternos,
                operadoresEstrangeiros: operadoresEstrangeiros?.length
                  ? operadoresEstrangeiros
                  : undefined
              },
              dados.superUserId
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
            importacaoId: dados.importacaoId,
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
        where: { id: dados.importacaoId },
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
        importacaoId: dados.importacaoId,
        superUserId: dados.superUserId,
        catalogo: catalogo ?? null,
        usuarioCatalogoId: dados.usuarioCatalogoId,
        totais: {
          totalRegistros,
          totalCriados,
          totalComAtencao,
          totalComErro,
        },
        resultado: resultadoFinal,
      });
    } catch (error) {
      logger.error('Falha ao processar planilha de importação:', error);

      await catalogoPrisma.importacaoProduto.update({
        where: { id: dados.importacaoId },
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
        importacaoId: dados.importacaoId,
        superUserId: dados.superUserId,
        catalogo: catalogo ?? null,
        usuarioCatalogoId: dados.usuarioCatalogoId,
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

  async reverterImportacao(id: number, superUserId: number) {
    const importacao = await catalogoPrisma.importacaoProduto.findFirst({
      where: { id, superUserId },
      include: {
        itens: {
          select: {
            id: true,
            produtoId: true
          }
        }
      }
    });

    if (!importacao) {
      throw new Error('IMPORTACAO_NAO_ENCONTRADA');
    }

    if (importacao.situacao === 'EM_ANDAMENTO') {
      throw new Error('IMPORTACAO_EM_ANDAMENTO');
    }

    if (importacao.situacao === 'REVERTIDA') {
      throw new Error('IMPORTACAO_JA_REVERTIDA');
    }

    const itensComProduto = importacao.itens.filter(
      item => typeof item.produtoId === 'number'
    );
    const produtoIds = [...new Set(itensComProduto.map(item => item.produtoId!))];

    await catalogoPrisma.$transaction(async tx => {
      if (produtoIds.length > 0) {
        await tx.importacaoProdutoItem.updateMany({
          where: {
            importacaoId: importacao.id,
            produtoId: { in: produtoIds }
          },
          data: { produtoId: null }
        });

        await tx.produtoAtributos.deleteMany({
          where: { produtoId: { in: produtoIds } }
        });

        await tx.produto.deleteMany({
          where: {
            id: { in: produtoIds },
            catalogo: { superUserId }
          }
        });
      }

      await tx.importacaoProduto.update({
        where: { id: importacao.id },
        data: {
          situacao: 'REVERTIDA',
          finalizadoEm: new Date()
        }
      });
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

  private async obterUsuarioCatalogoId(
    superUserId: number,
    usuarioLegacyId?: number
  ): Promise<number | null> {
    if (!usuarioLegacyId) {
      return null;
    }

    const usuarioCatalogo = await catalogoPrisma.usuarioCatalogo.findFirst({
      where: {
        legacyId: usuarioLegacyId,
        superUserId
      },
      select: { id: true }
    });

    return usuarioCatalogo?.id ?? null;
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
    const interpretes = this.obterPossiveisInterpretesPython();
    const errosPorComando: string[] = [];

    for (const interprete of interpretes) {
      try {
        return await execFileAsync(
          interprete.comando,
          [...interprete.argumentosExtras, script, arquivo],
          { maxBuffer: 10 * 1024 * 1024 },
        );
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }

        errosPorComando.push(interprete.comando);
      }
    }

    const comandosTestados = errosPorComando.join(', ') || 'nenhum';
    const dicaConfiguracao = process.env.PYTHON_BIN
      ? ` Valor atual de PYTHON_BIN: "${process.env.PYTHON_BIN}".`
      : '';

    throw new Error(
      `Não foi possível localizar um interpretador Python executável (tentativas: ${comandosTestados}). ` +
        'Instale o Python 3 ou configure a variável de ambiente PYTHON_BIN com o caminho do executável.' +
        dicaConfiguracao,
    );
  }

  private obterPossiveisInterpretesPython(): Array<{ comando: string; argumentosExtras: string[] }> {
    const maximoComandos = new Map<string, { comando: string; argumentosExtras: string[] }>();

    const binConfigurado = process.env.PYTHON_BIN?.trim();
    if (binConfigurado) {
      maximoComandos.set(binConfigurado, { comando: binConfigurado, argumentosExtras: [] });
    }

    for (const comando of ['python3', 'python', 'py']) {
      if (!maximoComandos.has(comando)) {
        maximoComandos.set(comando, { comando, argumentosExtras: [] });
      }
    }

    return Array.from(maximoComandos.values());
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

const produtoImportacaoWorkerService = new ProdutoImportacaoService();

registerProdutoImportacaoProcessor(dados =>
  produtoImportacaoWorkerService.processarImportacaoJob(dados)
);
