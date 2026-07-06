import {
  AsyncJobTipo,
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
import { createAsyncJob } from '../jobs/async-job.repository';
import { NcmValoresPadraoService } from './ncm-valores-padrao.service';
import { NcmLegacyService } from './ncm-legacy.service';
import { storageFactory } from './storage.factory';
import {
  ProdutoImportacaoSiscomexArquivoService,
  ProdutoSiscomexArquivoBundle,
  SiscomexArquivoImportacaoArtefatos,
  criarBundleSiscomexArquivo,
  atualizarBundleSiscomexArquivo,
  desserializarBundleSiscomexArquivo,
  serializarBundleSiscomexArquivo,
} from './produto-importacao-siscomex-arquivo.service';

const execFileAsync = promisify(execFile);

export interface ArquivoImportacao {
  nome: string;
  conteudoBase64: string;
}

export type OrigemImportacaoProduto = 'PLANILHA' | 'SISCOMEX_ARQUIVO';

export interface ProdutoImportacaoJobData {
  importacaoId: number;
  superUserId: number;
  usuarioCatalogoId: number | null;
  catalogoId: number;
  modalidade: string;
  origem?: OrigemImportacaoProduto;
  arquivo: ArquivoImportacao;
}

export interface NovaImportacaoPlanilhaInput {
  catalogoId: number;
  modalidade?: string;
  arquivo: ArquivoImportacao;
}

export interface NovaImportacaoSiscomexArquivoInput {
  catalogoId: number;
  arquivos: {
    produtos: ArquivoImportacao;
    operadores?: ArquivoImportacao | null;
    fabricantes?: ArquivoImportacao | null;
  };
}

interface MensagensItemImportacao {
  impeditivos: string[];
  atencao: string[];
}

export class ProdutoImportacaoService {
  private produtoService = new ProdutoService();
  private valoresPadraoService = new NcmValoresPadraoService();
  private ncmLegacyService = new NcmLegacyService();
  private siscomexArquivoService = new ProdutoImportacaoSiscomexArquivoService();

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
      await catalogoPrisma.$transaction(async tx => {
        const job = await createAsyncJob(
          {
            tipo: AsyncJobTipo.IMPORTACAO_PRODUTO,
            payload: {
              importacaoId: importacao.id,
              superUserId,
              usuarioCatalogoId,
              catalogoId: dados.catalogoId,
              modalidade,
              origem: 'PLANILHA',
            },
            arquivo: {
              nome: dados.arquivo.nome,
              conteudoBase64: dados.arquivo.conteudoBase64,
            },
          },
          tx
        );

        await tx.importacaoProduto.update({
          where: { id: importacao.id },
          data: {
            asyncJobId: job.id,
          },
        });
      });
    } catch (error) {
      logger.error('Falha ao registrar job de importação de produtos:', error);

      await catalogoPrisma.importacaoProduto.update({
        where: { id: importacao.id },
        data: {
          situacao: 'CONCLUIDA_INCOMPLETA',
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

  async importarArquivoSiscomex(
    dados: NovaImportacaoSiscomexArquivoInput,
    superUserId: number,
    usuarioLegacyId?: number
  ) {
    const catalogoExiste = await catalogoPrisma.catalogo.findFirst({
      where: { id: dados.catalogoId, superUserId },
      select: { id: true }
    });

    if (!catalogoExiste) {
      throw new Error('Catalogo nao encontrado para o superusuario informado');
    }

    const usuarioCatalogoId = await this.obterUsuarioCatalogoId(superUserId, usuarioLegacyId);

    this.validarArquivoJson(dados.arquivos?.produtos, 'Arquivo JSON de produtos');
    if (dados.arquivos?.operadores) {
      this.validarArquivoJson(
        dados.arquivos.operadores,
        'Arquivo JSON de operadores estrangeiros'
      );
    }
    if (dados.arquivos?.fabricantes) {
      this.validarArquivoJson(
        dados.arquivos.fabricantes,
        'Arquivo JSON de vinculos de fabricante/produtor'
      );
    }

    const bundle = criarBundleSiscomexArquivo({
      produtos: dados.arquivos.produtos,
      operadores: dados.arquivos.operadores ?? null,
      fabricantes: dados.arquivos.fabricantes ?? null,
    });

    const importacao = await catalogoPrisma.importacaoProduto.create({
      data: {
        superUserId,
        usuarioCatalogoId,
        catalogoId: dados.catalogoId,
        modalidade: 'IMPORTACAO',
        nomeArquivo: dados.arquivos.produtos.nome,
        situacao: 'EM_ANDAMENTO',
        resultado: 'PENDENTE'
      }
    });

    try {
      await catalogoPrisma.$transaction(async tx => {
        const job = await createAsyncJob(
          {
            tipo: AsyncJobTipo.IMPORTACAO_PRODUTO,
            payload: {
              importacaoId: importacao.id,
              superUserId,
              usuarioCatalogoId,
              catalogoId: dados.catalogoId,
              modalidade: 'IMPORTACAO',
              origem: 'SISCOMEX_ARQUIVO',
            },
            maxTentativas: 1,
            arquivo: {
              nome: 'siscomex-importacao-arquivo.json',
              conteudoBase64: serializarBundleSiscomexArquivo(bundle),
            },
          },
          tx
        );

        await tx.importacaoProduto.update({
          where: { id: importacao.id },
          data: {
            asyncJobId: job.id,
          },
        });
      });
    } catch (error) {
      logger.error('Falha ao registrar job de importacao SISCOMEX por arquivo:', error);

      await catalogoPrisma.importacaoProduto.update({
        where: { id: importacao.id },
        data: {
          situacao: 'CONCLUIDA_INCOMPLETA',
          resultado: 'ATENCAO',
          totalRegistros: 0,
          totalCriados: 0,
          totalComAtencao: 0,
          totalComErro: 0,
          finalizadoEm: new Date()
        }
      });

      throw new Error('Nao foi possivel iniciar o processamento do arquivo JSON do SISCOMEX.');
    }

    return importacao;
  }

  async processarImportacaoJob(
    dados: ProdutoImportacaoJobData,
    onHeartbeat?: () => Promise<void>
  ) {
    const catalogo = await catalogoPrisma.catalogo.findFirst({
      where: { id: dados.catalogoId, superUserId: dados.superUserId },
      select: { id: true, nome: true, numero: true, cpf_cnpj: true }
    });

    const buffer = this.converterBase64(dados.arquivo.conteudoBase64);
    if (!buffer?.length) {
      throw new Error('Conteúdo do arquivo inválido');
    }

    const emitirHeartbeat = async () => {
      if (!onHeartbeat) {
        return;
      }
      try {
        await onHeartbeat();
      } catch (error) {
        logger.warn('Falha ao enviar heartbeat durante processamento da importação', error);
      }
    };

    await emitirHeartbeat();

    if ((dados.origem ?? 'PLANILHA') === 'SISCOMEX_ARQUIVO') {
      return this.processarImportacaoSiscomexJob(
        dados,
        catalogo ?? null,
        buffer,
        emitirHeartbeat
      );
    }

    let totalRegistros = 0;
    let totalCriados = 0;
    let totalComAtencao = 0;
    let totalComErro = 0;
    const ncmValidacoesCache = new Map<string, boolean>();

    try {
      const linhas = await this.lerPlanilha(buffer);
      if (!linhas || linhas.length <= 1) {
        throw new Error('A planilha não possui dados para importação');
      }

      await emitirHeartbeat();

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

      let iteracoesDesdeHeartbeat = 0;

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

        iteracoesDesdeHeartbeat += 1;
        if (iteracoesDesdeHeartbeat >= 20) {
          await emitirHeartbeat();
          iteracoesDesdeHeartbeat = 0;
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
          const resultadoCache = ncmValidacoesCache.get(ncmNormalizada);
          if (resultadoCache === undefined) {
            const ncmCache = await catalogoPrisma.ncmCache.findUnique({
              where: { codigo: ncmNormalizada }
            });

            if (!ncmCache) {
              const ncmSincronizada = await this.ncmLegacyService.sincronizarNcm(
                ncmNormalizada
              );

              if (!ncmSincronizada) {
                mensagens.impeditivos.push('NCM não encontrada');
                ncmValidacoesCache.set(ncmNormalizada, false);
              } else {
                ncmValidacoesCache.set(ncmNormalizada, true);
              }
            } else {
              ncmValidacoesCache.set(ncmNormalizada, true);
            }
          } else if (!resultadoCache) {
            mensagens.impeditivos.push('NCM não encontrada');
          }
        }

        let resultadoItem: ImportacaoProdutoItemResultado = 'ERRO';
        let produtoId: number | null = null;
        let itemPersistido = false;
        let erroContabilizado = false;

        const registrarItem = async () => {
          await catalogoPrisma.$transaction(async tx => {
            await tx.importacaoProdutoItem.create({
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
          });
          itemPersistido = true;
          await emitirHeartbeat();
        };

        const podeCriarProduto =
          mensagens.impeditivos.length === 0 && Boolean(ncmNormalizada) && Boolean(denominacao);

        if (podeCriarProduto) {
          const chaveTemplate = `${dados.superUserId}::${ncmNormalizada}::${dados.modalidade}::${dados.catalogoId}`;
          if (!cacheValoresPadrao.has(chaveTemplate)) {
            const template = await this.valoresPadraoService.buscarPorNcm(
              ncmNormalizada!,
              dados.superUserId,
              dados.modalidade,
              dados.catalogoId
            );
            cacheValoresPadrao.set(chaveTemplate, template?.valoresJson ?? null);
          }

          const valoresPadrao = cacheValoresPadrao.get(chaveTemplate) ?? null;

          try {
            await catalogoPrisma.$transaction(async tx => {
              const produto = await this.produtoService.criar(
                {
                  ncmCodigo: ncmNormalizada!,
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
                dados.superUserId,
                tx
              );

              if (!produto) {
                throw new Error('FALHA_CRIACAO_PRODUTO');
              }

              produtoId = produto.id;
              resultadoItem = mensagens.atencao.length > 0 ? 'ATENCAO' : 'SUCESSO';

              await tx.importacaoProdutoItem.create({
                data: {
                  importacaoId: dados.importacaoId,
                  linhaPlanilha,
                  ncm: ncmNormalizada ?? null,
                  denominacao: denominacao || null,
                  codigosInternos: codigosBrutos || null,
                  resultado: resultadoItem,
                  mensagens: mensagens as unknown as Prisma.InputJsonValue,
                  possuiErroImpeditivo: false,
                  possuiAlerta: mensagens.atencao.length > 0,
                  produtoId
                }
              });
            });

            itemPersistido = true;
            totalCriados += 1;
            if (mensagens.atencao.length > 0) {
              totalComAtencao += 1;
            }

            await emitirHeartbeat();
          } catch (error) {
            if (error instanceof ValidationError) {
              mensagens.impeditivos.push(
                error.details.map(d => `${d.field}: ${d.message}`).join('; ')
              );
            } else {
              const mensagemErro =
                error instanceof Error
                  ? error.message
                  : 'Erro desconhecido na criação do produto';
              mensagens.impeditivos.push(`Erro ao criar produto: ${mensagemErro}`);
            }

            resultadoItem = 'ERRO';
            erroContabilizado = true;
            totalComErro += 1;
          }
        } else {
          erroContabilizado = true;
          totalComErro += 1;
        }

        if (!itemPersistido) {
          resultadoItem = 'ERRO';
          if (!erroContabilizado) {
            totalComErro += 1;
            erroContabilizado = true;
          }

          await registrarItem();
        }
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

      await emitirHeartbeat();

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

      await emitirHeartbeat();

      await catalogoPrisma.importacaoProduto.update({
        where: { id: dados.importacaoId },
        data: {
          situacao: 'CONCLUIDA_INCOMPLETA',
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

  private async processarImportacaoSiscomexJob(
    dados: ProdutoImportacaoJobData,
    catalogo: {
      id: number;
      nome: string;
      numero: number;
      cpf_cnpj: string | null;
    } | null,
    buffer: Buffer,
    emitirHeartbeat: () => Promise<void>
  ) {
    if (!catalogo) {
      throw new Error('Catalogo nao encontrado para o superusuario informado');
    }

    const bundle = this.lerBundleSiscomex(buffer);

    try {
      const processamento = await this.siscomexArquivoService.processar({
        importacaoId: dados.importacaoId,
        superUserId: dados.superUserId,
        catalogo,
        bundle,
        onHeartbeat: emitirHeartbeat,
      });

      const bundleAtualizado = atualizarBundleSiscomexArquivo(bundle, {
        resumo: processamento.resumo,
        artefatosReversao: processamento.artefatosReversao,
        modalidadeDetectada: processamento.modalidadeDetectada,
      });

      await this.atualizarBundleSiscomexImportacao(
        dados.importacaoId,
        bundleAtualizado
      );

      await catalogoPrisma.importacaoProduto.update({
        where: { id: dados.importacaoId },
        data: {
          modalidade: processamento.modalidadeDetectada === 'MISTA'
            ? 'MISTA'
            : processamento.modalidadeDetectada,
          situacao: 'CONCLUIDA',
          resultado: processamento.resultadoFinal,
          totalRegistros: processamento.totalRegistros,
          totalCriados: processamento.totalCriados,
          totalComAtencao: processamento.totalComAtencao,
          totalComErro: processamento.totalComErro,
          finalizadoEm: new Date()
        }
      });

      await emitirHeartbeat();

      await this.registrarConclusaoImportacao({
        importacaoId: dados.importacaoId,
        superUserId: dados.superUserId,
        catalogo,
        usuarioCatalogoId: dados.usuarioCatalogoId,
        totais: {
          totalRegistros: processamento.totalRegistros,
          totalCriados: processamento.totalCriados,
          totalComAtencao: processamento.totalComAtencao,
          totalComErro: processamento.totalComErro,
        },
        resultado: processamento.resultadoFinal,
        linhasExtras: [
          'Origem: SISCOMEX por arquivo',
          `Operadores criados: ${processamento.resumo.operadores.criados}`,
          `Vinculos criados: ${processamento.resumo.vinculos.criados}`,
          `Vinculos com erro: ${processamento.resumo.vinculos.comErro}`,
        ],
      });
    } catch (error) {
      logger.error('Falha ao processar importacao SISCOMEX por arquivo:', error);

      await emitirHeartbeat();

      const totaisParciais = await this.calcularTotaisPersistidosImportacao(
        dados.importacaoId
      );

      await catalogoPrisma.importacaoProduto.update({
        where: { id: dados.importacaoId },
        data: {
          situacao: 'CONCLUIDA_INCOMPLETA',
          resultado: 'ATENCAO',
          totalRegistros: totaisParciais.totalRegistros,
          totalCriados: totaisParciais.totalCriados,
          totalComAtencao: totaisParciais.totalComAtencao,
          totalComErro: totaisParciais.totalComErro,
          finalizadoEm: new Date()
        }
      });

      await this.registrarConclusaoImportacao({
        importacaoId: dados.importacaoId,
        superUserId: dados.superUserId,
        catalogo,
        usuarioCatalogoId: dados.usuarioCatalogoId,
        totais: {
          totalRegistros: totaisParciais.totalRegistros,
          totalCriados: totaisParciais.totalCriados,
          totalComAtencao: totaisParciais.totalComAtencao,
          totalComErro: totaisParciais.totalComErro,
        },
        resultado: 'ATENCAO',
        linhasExtras: ['Origem: SISCOMEX por arquivo', 'Resultado: processamento interrompido.'],
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
    const importacao = await catalogoPrisma.importacaoProduto.findFirst({
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
        },
        asyncJob: {
          select: {
            payload: true,
            arquivo: {
              select: {
                conteudoBase64: true
              }
            }
          }
        }
      }
    });

    if (!importacao) {
      return null;
    }

    const origemImportacao = this.obterOrigemImportacao(importacao.asyncJob?.payload);
    const resumoSiscomex =
      origemImportacao === 'SISCOMEX_ARQUIVO'
        ? this.extrairResumoSiscomexImportacao(importacao.asyncJob?.arquivo?.conteudoBase64)
        : null;

    const { asyncJob, ...dadosImportacao } = importacao;
    return {
      ...dadosImportacao,
      origemImportacao,
      resumoSiscomex,
    };
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
        },
        asyncJob: {
          select: {
            payload: true,
            arquivo: {
              select: {
                conteudoBase64: true
              }
            }
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
    const origemImportacao = this.obterOrigemImportacao(importacao.asyncJob?.payload);
    const artefatosSiscomex =
      origemImportacao === 'SISCOMEX_ARQUIVO'
        ? this.extrairArtefatosSiscomexImportacao(importacao.asyncJob?.arquivo?.conteudoBase64)
        : null;
    const vinculoIds = artefatosSiscomex?.vinculoIdsCriados ?? [];
    const operadorIds = artefatosSiscomex?.operadorIdsCriados ?? [];

    await catalogoPrisma.$transaction(async tx => {
      if (vinculoIds.length > 0) {
        await tx.operadorEstrangeiroProduto.deleteMany({
          where: { id: { in: vinculoIds } }
        });
      }

      if (produtoIds.length > 0) {
        await tx.importacaoProdutoItem.updateMany({
          where: {
            importacaoId: importacao.id,
            produtoId: { in: produtoIds }
          },
          data: { produtoId: null }
        });

        await tx.produtoAtributo.deleteMany({
          where: { produtoId: { in: produtoIds } }
        });

        await tx.produto.deleteMany({
          where: {
            id: { in: produtoIds },
            catalogo: { superUserId }
          }
        });
      }

      if (operadorIds.length > 0) {
        await tx.operadorEstrangeiro.deleteMany({
          where: {
            id: { in: operadorIds },
            catalogo: { superUserId },
            operadorEstrangeiroProdutos: {
              none: {}
            }
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
      select: {
        id: true,
        situacao: true,
        asyncJobId: true,
        asyncJob: {
          select: {
            arquivo: {
              select: {
                storagePath: true,
              },
            },
          },
        },
      },
    });

    if (!existente) {
      return false;
    }

    this.validarSituacaoExclusaoImportacao(existente.situacao);
    await this.excluirImportacaoPersistida(existente, superUserId);
    return true;
  }

  async limparHistorico(superUserId: number) {
    const importacoesElegiveis = await catalogoPrisma.importacaoProduto.findMany({
      where: {
        superUserId,
        situacao: {
          in: ['CONCLUIDA', 'REVERTIDA'],
        },
      },
      select: {
        id: true,
        situacao: true,
        asyncJobId: true,
        asyncJob: {
          select: {
            arquivo: {
              select: {
                storagePath: true,
              },
            },
          },
        },
      },
    });

    for (const importacao of importacoesElegiveis) {
      await this.excluirImportacaoPersistida(importacao, superUserId);
    }
  }

  private validarArquivoJson(arquivo?: ArquivoImportacao | null, descricao = 'Arquivo JSON') {
    if (!arquivo?.conteudoBase64 || !arquivo?.nome) {
      throw new Error(`${descricao} nao foi enviado`);
    }

    if (!arquivo.nome.toLowerCase().endsWith('.json')) {
      throw new Error(`Formato invalido para ${descricao.toLowerCase()}: envie um arquivo .json`);
    }

    const buffer = this.converterBase64(arquivo.conteudoBase64);
    if (!buffer?.length) {
      throw new Error(`Conteudo invalido para ${descricao.toLowerCase()}`);
    }
  }

  private lerBundleSiscomex(buffer: Buffer): ProdutoSiscomexArquivoBundle {
    return desserializarBundleSiscomexArquivo(buffer.toString('base64'));
  }

  private async atualizarBundleSiscomexImportacao(
    importacaoId: number,
    bundle: ProdutoSiscomexArquivoBundle
  ) {
    const importacao = await catalogoPrisma.importacaoProduto.findUnique({
      where: { id: importacaoId },
      select: { asyncJobId: true }
    });

    if (!importacao?.asyncJobId) {
      return;
    }

    await catalogoPrisma.asyncJobFile.update({
      where: { jobId: importacao.asyncJobId },
      data: {
        conteudoBase64: serializarBundleSiscomexArquivo(bundle)
      }
    });
  }

  private validarSituacaoExclusaoImportacao(situacao: string) {
    if (situacao === 'EM_ANDAMENTO') {
      throw new Error('IMPORTACAO_EXCLUSAO_EM_ANDAMENTO');
    }

    if (situacao === 'CONCLUIDA_INCOMPLETA') {
      throw new Error('IMPORTACAO_EXCLUSAO_REQUER_REVERSAO');
    }

    if (situacao !== 'CONCLUIDA' && situacao !== 'REVERTIDA') {
      throw new Error('IMPORTACAO_EXCLUSAO_NAO_PERMITIDA');
    }
  }

  private async excluirImportacaoPersistida(
    importacao: {
      id: number;
      situacao: string;
      asyncJobId: number | null;
      asyncJob?: {
        arquivo?: {
          storagePath?: string | null;
        } | null;
      } | null;
    },
    superUserId: number
  ) {
    const storagePath = importacao.asyncJob?.arquivo?.storagePath ?? null;

    await catalogoPrisma.$transaction(async tx => {
      await tx.mensagem.deleteMany({
        where: {
          superUserId,
          categoria: MensagemCategoria.IMPORTACAO_CONCLUIDA,
          metadados: {
            path: '$.importacaoId',
            equals: importacao.id,
          },
        },
      });

      await tx.importacaoProduto.delete({
        where: { id: importacao.id },
      });

      if (importacao.asyncJobId) {
        await tx.asyncJob.deleteMany({
          where: { id: importacao.asyncJobId },
        });
      }
    });

    if (!storagePath) {
      return;
    }

    try {
      await storageFactory().delete(storagePath);
    } catch (error) {
      logger.warn(`Nao foi possivel remover o artefato de storage da importacao ${importacao.id}.`, error);
    }
  }

  private async calcularTotaisPersistidosImportacao(importacaoId: number) {
    const itens = await catalogoPrisma.importacaoProdutoItem.findMany({
      where: { importacaoId },
      select: {
        resultado: true,
        produtoId: true,
      },
    });

    return itens.reduce(
      (acumulado, item) => {
        acumulado.totalRegistros += 1;

        if (item.produtoId !== null) {
          acumulado.totalCriados += 1;
        }

        if (item.resultado === 'ATENCAO') {
          acumulado.totalComAtencao += 1;
        }

        if (item.resultado === 'ERRO') {
          acumulado.totalComErro += 1;
        }

        return acumulado;
      },
      {
        totalRegistros: 0,
        totalCriados: 0,
        totalComAtencao: 0,
        totalComErro: 0,
      }
    );
  }

  private obterOrigemImportacao(
    payload: Prisma.JsonValue | null | undefined
  ): OrigemImportacaoProduto {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const origem = (payload as Record<string, unknown>).origem;
      if (origem === 'SISCOMEX_ARQUIVO') {
        return 'SISCOMEX_ARQUIVO';
      }
    }

    return 'PLANILHA';
  }

  private extrairResumoSiscomexImportacao(conteudoBase64?: string | null) {
    try {
      return conteudoBase64
        ? desserializarBundleSiscomexArquivo(conteudoBase64).resumo ?? null
        : null;
    } catch (error) {
      logger.warn('Nao foi possivel interpretar o resumo da importacao SISCOMEX.', error);
      return null;
    }
  }

  private extrairArtefatosSiscomexImportacao(
    conteudoBase64?: string | null
  ): SiscomexArquivoImportacaoArtefatos | null {
    try {
      return conteudoBase64
        ? desserializarBundleSiscomexArquivo(conteudoBase64).artefatosReversao ?? null
        : null;
    } catch (error) {
      logger.warn('Nao foi possivel interpretar os artefatos da importacao SISCOMEX.', error);
      return null;
    }
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
    linhasExtras?: string[];
  }) {
    const {
      importacaoId,
      superUserId,
      catalogo,
      usuarioCatalogoId,
      totais: { totalRegistros, totalCriados, totalComAtencao, totalComErro },
      resultado,
      linhasExtras = [],
    } = params;

    const tituloBase = catalogo?.nome ? `Importação do catálogo ${catalogo.nome} concluída` : 'Importação de produtos concluída';
    const descricaoResultado = resultado === 'SUCESSO' ? 'Sucesso' : resultado === 'ATENCAO' ? 'Atenção' : resultado;

    const conteudoResumo = [
      `Resultado: ${descricaoResultado}`,
      `Total de registros: ${totalRegistros}`,
      `Produtos criados: ${totalCriados}`,
      `Com atenção: ${totalComAtencao}`,
      `Com erro: ${totalComErro}`,
      ...linhasExtras,
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
