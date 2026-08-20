import {
  ImportacaoProdutoItemResultado,
  ImportacaoResultado,
  OperadorEstrangeiroStatus,
  Prisma,
  ProdutoSituacao,
  ProdutoStatus,
} from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { normalizarVersaoSiscomex } from '../utils/versao-siscomex';
import { ProdutoService } from './produto.service';
import { NcmLegacyService } from './ncm-legacy.service';

export interface ArquivoImportacaoSiscomex {
  nome: string;
  conteudoBase64: string;
}

export interface ProdutoSiscomexArquivoBundle {
  origem: 'SISCOMEX_ARQUIVO';
  arquivos: {
    produtos: ArquivoImportacaoSiscomex;
    operadores?: ArquivoImportacaoSiscomex | null;
    fabricantes?: ArquivoImportacaoSiscomex | null;
  };
  resumo?: SiscomexArquivoImportacaoResumo;
  artefatosReversao?: SiscomexArquivoImportacaoArtefatos;
  modalidadeDetectada?: string | null;
}

export interface SiscomexResumoPendencia {
  referencia: string;
  motivo: string;
}

export interface SiscomexArquivoImportacaoResumo {
  origem: 'SISCOMEX_ARQUIVO';
  arquivos: {
    produtos: string;
    operadores: string | null;
    fabricantes: string | null;
  };
  modalidadeDetectada: string;
  produtos: {
    totalArquivo: number;
    criados: number;
    criadosAprovados: number;
    criadosPendentes: number;
    existentesTransmitidos: number;
    existentesNaoTransmitidos: number;
    ambiguos: number;
    divergenciaNcm: number;
    comErro: number;
  };
  operadores: {
    informado: boolean;
    totalArquivo: number;
    criados: number;
    existentesTransmitidos: number;
    existentesNaoTransmitidos: number;
    ambiguos: number;
    conflitos: number;
    comErro: number;
    pendencias: SiscomexResumoPendencia[];
  };
  vinculos: {
    informado: boolean;
    totalArquivo: number;
    criados: number;
    existentes: number;
    criadosComOperador: number;
    criadosSomentePais: number;
    semProduto: number;
    semOperador: number;
    comErro: number;
    pendencias: SiscomexResumoPendencia[];
  };
}

export interface SiscomexArquivoImportacaoArtefatos {
  operadorIdsCriados: number[];
  vinculoIdsCriados: number[];
}

export interface ProcessamentoSiscomexArquivoResultado {
  modalidadeDetectada: string;
  totalRegistros: number;
  totalCriados: number;
  totalComAtencao: number;
  totalComErro: number;
  resultadoFinal: ImportacaoResultado;
  resumo: SiscomexArquivoImportacaoResumo;
  artefatosReversao: SiscomexArquivoImportacaoArtefatos;
}

interface CatalogoResumoImportacaoSiscomex {
  id: number;
  nome: string;
  numero: number;
  cpf_cnpj: string | null;
}

interface ProdutoSiscomexRegistro {
  seq?: number | string | null;
  codigo?: number | string | null;
  descricao?: string | null;
  denominacao?: string | null;
  cpfCnpjRaiz?: string | null;
  situacao?: string | null;
  modalidade?: string | null;
  ncm?: string | null;
  versao?: string | number | null;
  atributos?: Array<{ atributo?: string | null; valor?: unknown }>;
  atributosMultivalorados?: Array<{ atributo?: string | null; valores?: unknown[] | null }>;
  atributosCompostos?: Array<{
    atributo?: string | null;
    valores?: Array<{ atributo?: string | null; valor?: unknown }> | null;
  }>;
  atributosCompostosMultivalorados?: Array<{
    atributo?: string | null;
    valores?: Array<Array<{ atributo?: string | null; valor?: unknown }>> | null;
  }>;
  codigosInterno?: unknown;
}

interface OperadorSiscomexRegistro {
  seq?: number | string | null;
  cpfCnpjRaiz?: string | null;
  codigo?: string | null;
  versao?: string | number | null;
  nome?: string | null;
  situacao?: string | null;
  logradouro?: string | null;
  nomeCidade?: string | null;
  codigoPais?: string | null;
  codigoInterno?: string | null;
  cep?: string | null;
  codigoSubdivisaoPais?: string | null;
  email?: string | null;
  identificacoesAdicionais?: Array<{
    numero?: string | null;
    agenciaEmissoraCodigo?: string | null;
  }> | null;
}

interface VinculoSiscomexRegistro {
  seq?: number | string | null;
  codigoPais?: string | null;
  cpfCnpjRaiz?: string | null;
  codigoOperadorEstrangeiro?: string | null;
  conhecido?: boolean | null;
  codigoProduto?: number | string | null;
  vincular?: boolean | null;
}

interface MensagensItemImportacao {
  impeditivos: string[];
  atencao: string[];
}

interface ProdutoLocalResumo {
  id: number;
  codigo: string | null;
  ncmCodigo: string;
  modalidade: string | null;
  denominacao: string;
  situacao: ProdutoSituacao;
  status: ProdutoStatus;
  codigosInternos: string[];
}

interface OperadorLocalResumo {
  id: number;
  codigo: string | null;
  codigoInterno: string | null;
  paisCodigo: string;
  nome: string;
  situacao: OperadorEstrangeiroStatus;
}

interface VinculoLocalResumo {
  id: number;
  produtoId: number;
  paisCodigo: string;
  conhecido: boolean;
  operadorEstrangeiroId: number | null;
}

interface ProdutoNormalizado {
  referencia: number;
  seqChave: string;
  codigoSiscomex: string | null;
  versao: string | null;
  denominacao: string;
  descricao: string;
  modalidade: string;
  ncm: string | null;
  situacao: ProdutoSituacao;
  codigosInternos: string[];
}

type ProdutoMatchResultado =
  | { tipo: 'SEM_MATCH' }
  | { tipo: 'EXISTENTE'; produto: ProdutoLocalResumo; origem: 'CODIGO' | 'CODIGO_INTERNO' }
  | { tipo: 'DIVERGENCIA_NCM'; candidatos: ProdutoLocalResumo[] }
  | { tipo: 'AMBIGUO'; candidatos: ProdutoLocalResumo[]; motivo: string };

interface OperadorMatchResultado {
  tipo: 'SEM_MATCH' | 'EXISTENTE' | 'AMBIGUO' | 'CONFLITO';
  operador?: OperadorLocalResumo;
  candidatos?: OperadorLocalResumo[];
  motivo?: string;
}

interface EstadoProdutoResolvido {
  produtoId: number;
  origem: 'CRIADO' | 'EXISTENTE';
}

const LIMITE_PENDENCIAS_RESUMO = 100;

export function criarBundleSiscomexArquivo(
  arquivos: ProdutoSiscomexArquivoBundle['arquivos']
): ProdutoSiscomexArquivoBundle {
  return {
    origem: 'SISCOMEX_ARQUIVO',
    arquivos,
  };
}

export function serializarBundleSiscomexArquivo(bundle: ProdutoSiscomexArquivoBundle): string {
  return Buffer.from(JSON.stringify(bundle), 'utf8').toString('base64');
}

export function desserializarBundleSiscomexArquivo(
  conteudoBase64: string
): ProdutoSiscomexArquivoBundle {
  const texto = Buffer.from(conteudoBase64, 'base64').toString('utf8');
  const bundle = JSON.parse(texto) as ProdutoSiscomexArquivoBundle;

  if (!bundle || bundle.origem !== 'SISCOMEX_ARQUIVO' || !bundle.arquivos?.produtos) {
    throw new Error('Bundle de importacao do SISCOMEX invalido.');
  }

  return bundle;
}

export function atualizarBundleSiscomexArquivo(
  bundle: ProdutoSiscomexArquivoBundle,
  dados: {
    resumo: SiscomexArquivoImportacaoResumo;
    artefatosReversao: SiscomexArquivoImportacaoArtefatos;
    modalidadeDetectada: string;
  }
): ProdutoSiscomexArquivoBundle {
  return {
    ...bundle,
    resumo: dados.resumo,
    artefatosReversao: dados.artefatosReversao,
    modalidadeDetectada: dados.modalidadeDetectada,
  };
}

export class ProdutoImportacaoSiscomexArquivoService {
  constructor(
    private readonly produtoService = new ProdutoService(),
    private readonly ncmLegacyService = new NcmLegacyService()
  ) {}

  async processar(params: {
    importacaoId: number;
    superUserId: number;
    catalogo: CatalogoResumoImportacaoSiscomex;
    bundle: ProdutoSiscomexArquivoBundle;
    onHeartbeat?: () => Promise<void>;
  }): Promise<ProcessamentoSiscomexArquivoResultado> {
    const { importacaoId, superUserId, catalogo, bundle, onHeartbeat } = params;

    const emitirHeartbeat = async () => {
      if (!onHeartbeat) return;
      try {
        await onHeartbeat();
      } catch (error) {
        logger.warn('Falha ao enviar heartbeat durante a importacao SISCOMEX.', error);
      }
    };

    await emitirHeartbeat();

    const produtosArquivo = this.lerJson<ProdutoSiscomexRegistro>(
      bundle.arquivos.produtos,
      'produtos'
    );
    const operadoresArquivo = bundle.arquivos.operadores
      ? this.lerJson<OperadorSiscomexRegistro>(bundle.arquivos.operadores, 'operadores estrangeiros')
      : [];
    const vinculosArquivo = bundle.arquivos.fabricantes
      ? this.lerJson<VinculoSiscomexRegistro>(bundle.arquivos.fabricantes, 'vinculos de fabricante/produtor')
      : [];

    if (!produtosArquivo.length) {
      throw new Error('O arquivo JSON de produtos nao possui registros para importacao.');
    }

    const raizCatalogo = this.obterCpfCnpjRaiz(catalogo.cpf_cnpj);
    this.validarRaizArquivo(produtosArquivo, 'cpfCnpjRaiz', raizCatalogo, 'produtos');
    if (operadoresArquivo.length) {
      this.validarRaizArquivo(
        operadoresArquivo,
        'cpfCnpjRaiz',
        raizCatalogo,
        'operadores estrangeiros'
      );
    }
    if (vinculosArquivo.length) {
      this.validarRaizArquivo(
        vinculosArquivo,
        'cpfCnpjRaiz',
        raizCatalogo,
        'vinculos de fabricante/produtor'
      );
    }

    const modalidadesArquivo = Array.from(
      new Set(
        produtosArquivo
          .map(produto => this.normalizarModalidade(produto.modalidade))
          .filter((modalidade): modalidade is string => Boolean(modalidade))
      )
    );
    const modalidadeDetectada =
      modalidadesArquivo.length === 1 ? modalidadesArquivo[0] : 'MISTA';

    const [paises, subdivisoes, produtosLocais, operadoresLocais] = await Promise.all([
      catalogoPrisma.pais.findMany({ select: { codigo: true } }),
      catalogoPrisma.subdivisao.findMany({ select: { codigo: true } }),
      catalogoPrisma.produto.findMany({
        where: { catalogoId: catalogo.id },
        select: {
          id: true,
          codigo: true,
          ncmCodigo: true,
          modalidade: true,
          denominacao: true,
          situacao: true,
          status: true,
          codigosInternos: { select: { codigo: true } },
        },
      }),
      catalogoPrisma.operadorEstrangeiro.findMany({
        where: { catalogoId: catalogo.id },
        select: {
          id: true,
          codigo: true,
          codigoInterno: true,
          paisCodigo: true,
          nome: true,
          situacao: true,
        },
      }),
    ]);

    const codigosPaisValidos = new Set(
      paises
        .map(pais => this.normalizarCodigoNormalizado(pais.codigo))
        .filter((codigo): codigo is string => Boolean(codigo))
    );
    const codigosSubdivisaoValidos = new Set(
      subdivisoes
        .map(subdivisao => this.normalizarCodigoNormalizado(subdivisao.codigo))
        .filter((codigo): codigo is string => Boolean(codigo))
    );

    const produtosNormalizadosLocais = produtosLocais.map(produto => ({
      id: produto.id,
      codigo: this.normalizarCodigo(produto.codigo),
      ncmCodigo: produto.ncmCodigo,
      modalidade: this.normalizarModalidade(produto.modalidade),
      denominacao: produto.denominacao,
      situacao: produto.situacao,
      status: produto.status,
      codigosInternos: produto.codigosInternos
        .map(item => this.normalizarCodigo(item.codigo))
        .filter((codigo): codigo is string => Boolean(codigo)),
    }));
    const operadoresNormalizadosLocais = operadoresLocais.map(operador => ({
      id: operador.id,
      codigo: this.normalizarCodigo(operador.codigo),
      codigoInterno: this.normalizarCodigo(operador.codigoInterno),
      paisCodigo: this.normalizarCodigoNormalizado(operador.paisCodigo) ?? '',
      nome: operador.nome,
      situacao: operador.situacao,
    }));

    const indiceProdutos = this.criarIndiceProdutos(produtosNormalizadosLocais);
    const indiceOperadores = this.criarIndiceOperadores(operadoresNormalizadosLocais);

    const resumo: SiscomexArquivoImportacaoResumo = {
      origem: 'SISCOMEX_ARQUIVO',
      arquivos: {
        produtos: bundle.arquivos.produtos.nome,
        operadores: bundle.arquivos.operadores?.nome ?? null,
        fabricantes: bundle.arquivos.fabricantes?.nome ?? null,
      },
      modalidadeDetectada,
      produtos: {
        totalArquivo: produtosArquivo.length,
        criados: 0,
        criadosAprovados: 0,
        criadosPendentes: 0,
        existentesTransmitidos: 0,
        existentesNaoTransmitidos: 0,
        ambiguos: 0,
        divergenciaNcm: 0,
        comErro: 0,
      },
      operadores: {
        informado: Boolean(bundle.arquivos.operadores),
        totalArquivo: operadoresArquivo.length,
        criados: 0,
        existentesTransmitidos: 0,
        existentesNaoTransmitidos: 0,
        ambiguos: 0,
        conflitos: 0,
        comErro: 0,
        pendencias: [],
      },
      vinculos: {
        informado: Boolean(bundle.arquivos.fabricantes),
        totalArquivo: vinculosArquivo.length,
        criados: 0,
        existentes: 0,
        criadosComOperador: 0,
        criadosSomentePais: 0,
        semProduto: 0,
        semOperador: 0,
        comErro: 0,
        pendencias: [],
      },
    };

    const artefatosReversao: SiscomexArquivoImportacaoArtefatos = {
      operadorIdsCriados: [],
      vinculoIdsCriados: [],
    };

    const produtosDoArquivoPorSeq = new Map<string, ProdutoNormalizado>();
    const produtosDoArquivoPorCodigoOuSeq = new Map<string, ProdutoNormalizado>();
    const produtosResolvidosPorSeq = new Map<string, EstadoProdutoResolvido>();

    let totalCriados = 0;
    let totalComAtencao = 0;
    let totalComErro = 0;

    let iteracoesDesdeHeartbeat = 0;

    for (let indice = 0; indice < produtosArquivo.length; indice += 1) {
      const registro = produtosArquivo[indice];
      const referencia = this.normalizarReferencia(registro.seq, indice + 1);
      const seqChave = String(referencia);
      const mensagens: MensagensItemImportacao = { impeditivos: [], atencao: [] };
      const produto = this.normalizarProduto(registro, referencia, mensagens);

      produtosDoArquivoPorSeq.set(seqChave, produto);
      produtosDoArquivoPorCodigoOuSeq.set(seqChave, produto);
      if (produto.codigoSiscomex) {
        produtosDoArquivoPorCodigoOuSeq.set(produto.codigoSiscomex, produto);
      }

      iteracoesDesdeHeartbeat += 1;
      if (iteracoesDesdeHeartbeat >= 20) {
        await emitirHeartbeat();
        iteracoesDesdeHeartbeat = 0;
      }

      if (!produto.ncm) {
        mensagens.impeditivos.push('NCM nao informada ou invalida no arquivo.');
      } else {
        const ncmCache = await catalogoPrisma.ncmCache.findUnique({
          where: { codigo: produto.ncm },
        });

        if (!ncmCache) {
          const sincronizada = await this.ncmLegacyService.sincronizarNcm(produto.ncm);
          if (!sincronizada) {
            mensagens.impeditivos.push('NCM nao encontrada.');
          }
        }
      }

      if (mensagens.impeditivos.length > 0) {
        await this.registrarItemProduto({
          importacaoId,
          referencia,
          produto,
          resultado: 'ERRO',
          mensagens,
          produtoId: null,
        });
        totalComErro += 1;
        resumo.produtos.comErro += 1;
        continue;
      }

      const match = this.resolverProdutoExistente(produto, indiceProdutos);

      if (match.tipo === 'EXISTENTE') {
        const jaTransmitido = this.registroJaTransmitido(match.produto);
        mensagens.atencao.push(
          jaTransmitido
            ? `Produto ja existente no catalogo (ID ${match.produto.id}) e ja transmitido ao SISCOMEX.`
            : `Produto ja existente no catalogo (ID ${match.produto.id}), mas ainda nao transmitido ao SISCOMEX.`
        );

        produtosResolvidosPorSeq.set(seqChave, {
          produtoId: match.produto.id,
          origem: 'EXISTENTE',
        });

        await this.registrarItemProduto({
          importacaoId,
          referencia,
          produto,
          resultado: 'ATENCAO',
          mensagens,
          produtoId: null,
        });

        totalComAtencao += 1;
        if (jaTransmitido) {
          resumo.produtos.existentesTransmitidos += 1;
        } else {
          resumo.produtos.existentesNaoTransmitidos += 1;
        }
        continue;
      }

      if (match.tipo === 'DIVERGENCIA_NCM') {
        const exemplo = match.candidatos[0];
        mensagens.impeditivos.push(
          `Codigo interno ja existente em produto local com NCM/modalidade divergentes (produto ${exemplo.id}, NCM ${exemplo.ncmCodigo}, modalidade ${exemplo.modalidade ?? 'IMPORTACAO'}).`
        );

        await this.registrarItemProduto({
          importacaoId,
          referencia,
          produto,
          resultado: 'ERRO',
          mensagens,
          produtoId: null,
        });

        totalComErro += 1;
        resumo.produtos.divergenciaNcm += 1;
        resumo.produtos.comErro += 1;
        continue;
      }

      if (match.tipo === 'AMBIGUO') {
        const candidatos = match.candidatos.map(item => item.id).slice(0, 5).join(', ');
        mensagens.impeditivos.push(
          `Nao foi possivel determinar um produto local unico (${match.motivo}). Produtos candidatos: ${candidatos}.`
        );

        await this.registrarItemProduto({
          importacaoId,
          referencia,
          produto,
          resultado: 'ERRO',
          mensagens,
          produtoId: null,
        });

        totalComErro += 1;
        resumo.produtos.ambiguos += 1;
        resumo.produtos.comErro += 1;
        continue;
      }

      try {
        const valoresAtributos = this.montarValoresAtributos(registro);
        const criado = await catalogoPrisma.$transaction(async tx => {
          const produtoCriado = await this.produtoService.criar(
            {
              codigo: produto.codigoSiscomex ?? undefined,
              versao: produto.versao,
              ncmCodigo: produto.ncm!,
              modalidade: produto.modalidade,
              catalogoId: catalogo.id,
              denominacao: produto.denominacao,
              descricao: produto.descricao,
              valoresAtributos: valoresAtributos as Prisma.InputJsonValue,
              codigosInternos: produto.codigosInternos.length
                ? produto.codigosInternos
                : undefined,
              status: 'TRANSMITIDO',
              situacao: produto.situacao,
            },
            superUserId,
            tx
          );

          if (!produtoCriado) {
            throw new Error('Produto criado nao encontrado para consolidacao da importacao.');
          }

          const mensagensPersistencia: MensagensItemImportacao = {
            impeditivos: [],
            atencao: [...mensagens.atencao],
          };

          if (produtoCriado.status === 'PENDENTE') {
            mensagensPersistencia.atencao.push(
              'Produto criado com pendencias de atributos obrigatorios.'
            );
          }

          const resultadoItem: ImportacaoProdutoItemResultado =
            mensagensPersistencia.atencao.length > 0 ? 'ATENCAO' : 'SUCESSO';

          await tx.importacaoProdutoItem.create({
            data: {
              importacaoId,
              linhaPlanilha: referencia,
              ncm: produto.ncm,
              denominacao: produto.denominacao,
              codigosInternos: produto.codigosInternos.join(', ') || null,
              resultado: resultadoItem,
              mensagens: mensagensPersistencia as unknown as Prisma.InputJsonValue,
              possuiErroImpeditivo: false,
              possuiAlerta: mensagensPersistencia.atencao.length > 0,
              produtoId: produtoCriado.id,
            },
          });

          return {
            id: produtoCriado.id,
            codigo: this.normalizarCodigo(produtoCriado.codigo),
            ncmCodigo: produtoCriado.ncmCodigo,
            modalidade: this.normalizarModalidade(produtoCriado.modalidade),
            denominacao: produtoCriado.denominacao,
            situacao: produtoCriado.situacao,
            status: produtoCriado.status,
            resultadoItem,
          };
        });

        totalCriados += 1;
        resumo.produtos.criados += 1;
        if (criado.status === 'PENDENTE') {
          resumo.produtos.criadosPendentes += 1;
        } else {
          resumo.produtos.criadosAprovados += 1;
        }

        produtosResolvidosPorSeq.set(seqChave, {
          produtoId: criado.id,
          origem: 'CRIADO',
        });

        this.adicionarProdutoAoIndice(indiceProdutos, {
          id: criado.id,
          codigo: criado.codigo,
          ncmCodigo: criado.ncmCodigo,
          modalidade: criado.modalidade,
          denominacao: criado.denominacao,
          situacao: criado.situacao,
          status: criado.status,
          codigosInternos: produto.codigosInternos,
        });

        if (criado.resultadoItem === 'ATENCAO') {
          totalComAtencao += 1;
        }
      } catch (error) {
        const mensagemErro =
          error instanceof Error ? error.message : 'Falha desconhecida ao criar produto.';
        mensagens.impeditivos.push(`Erro ao criar produto: ${mensagemErro}`);

        await this.registrarItemProduto({
          importacaoId,
          referencia,
          produto,
          resultado: 'ERRO',
          mensagens,
          produtoId: null,
        });

        totalComErro += 1;
        resumo.produtos.comErro += 1;
      }
    }

    await emitirHeartbeat();

    const operadoresResolvidosPorCodigo = new Map<string, OperadorLocalResumo>();

    for (const [codigo, candidatos] of indiceOperadores.porCodigoSiscomex.entries()) {
      if (candidatos.length === 1) {
        operadoresResolvidosPorCodigo.set(codigo, candidatos[0]);
      }
    }

    for (let indice = 0; indice < operadoresArquivo.length; indice += 1) {
      const registro = operadoresArquivo[indice];
      const referencia = `OE-${this.normalizarReferencia(registro.seq, indice + 1)}`;
      const mensagens: string[] = [];
      const paisCodigo = this.normalizarCodigoNormalizado(registro.codigoPais);
      const codigo = this.normalizarCodigo(registro.codigo);
      const codigoInterno = this.normalizarCodigo(registro.codigoInterno);
      const nome = this.normalizarTextoLivre(registro.nome);
      const subdivisaoCodigo = this.normalizarCodigoNormalizado(registro.codigoSubdivisaoPais);

      if (!paisCodigo) {
        mensagens.push('Codigo do pais nao informado.');
      } else if (!codigosPaisValidos.has(paisCodigo)) {
        mensagens.push(`Codigo do pais nao reconhecido localmente: ${paisCodigo}.`);
      }

      if (!nome) {
        mensagens.push('Nome do operador estrangeiro nao informado.');
      }

      if (subdivisaoCodigo && !codigosSubdivisaoValidos.has(subdivisaoCodigo)) {
        mensagens.push(`Subdivisao nao reconhecida localmente: ${subdivisaoCodigo}.`);
      }

      if (mensagens.length > 0) {
        resumo.operadores.comErro += 1;
        this.adicionarPendencia(
          resumo.operadores.pendencias,
          referencia,
          mensagens.join(' ')
        );
        continue;
      }

      const match = this.resolverOperadorExistente(
        {
          codigo,
          codigoInterno,
          paisCodigo: paisCodigo!,
          nome: nome!,
        },
        indiceOperadores
      );

      if (match.tipo === 'EXISTENTE' && match.operador) {
        if (codigo) {
          operadoresResolvidosPorCodigo.set(codigo, match.operador);
        } else if (match.operador.codigo) {
          operadoresResolvidosPorCodigo.set(match.operador.codigo, match.operador);
        }
        if (this.registroJaTransmitido(match.operador)) {
          resumo.operadores.existentesTransmitidos += 1;
        } else {
          resumo.operadores.existentesNaoTransmitidos += 1;
        }
        continue;
      }

      if (match.tipo === 'AMBIGUO') {
        resumo.operadores.ambiguos += 1;
        resumo.operadores.comErro += 1;
        this.adicionarPendencia(
          resumo.operadores.pendencias,
          referencia,
          match.motivo ?? 'Ha mais de um operador local candidato para o mesmo registro.'
        );
        continue;
      }

      if (match.tipo === 'CONFLITO') {
        resumo.operadores.conflitos += 1;
        resumo.operadores.comErro += 1;
        this.adicionarPendencia(
          resumo.operadores.pendencias,
          referencia,
          match.motivo ?? 'O operador local encontrado possui dados conflitantes.'
        );
        continue;
      }

      try {
        const identificacoesAdicionais = Array.isArray(registro.identificacoesAdicionais)
          ? registro.identificacoesAdicionais
              .map(identificacao => {
                const numero = this.normalizarTextoLivre(identificacao.numero);
                const agenciaEmissoraCodigo = this.normalizarCodigoNormalizado(
                  identificacao.agenciaEmissoraCodigo
                );
                if (!numero || !agenciaEmissoraCodigo) {
                  return null;
                }

                return {
                  numero,
                  agenciaEmissoraCodigo,
                };
              })
              .filter(
                (
                  item
                ): item is { numero: string; agenciaEmissoraCodigo: string } =>
                  Boolean(item)
              )
          : [];

        const criado = await catalogoPrisma.operadorEstrangeiro.create({
          data: {
            catalogoId: catalogo.id,
            paisCodigo: paisCodigo!,
            nome: nome!,
            email: this.normalizarTextoLivre(registro.email),
            codigoInterno,
            codigoPostal: this.normalizarTextoLivre(registro.cep),
            logradouro: this.normalizarTextoLivre(registro.logradouro),
            cidade: this.normalizarTextoLivre(registro.nomeCidade),
            subdivisaoCodigo,
            codigo,
            versao: this.normalizarVersaoInteira(registro.versao),
            situacao: this.normalizarSituacaoOperador(registro.situacao),
            numero: 0,
            identificacoesAdicionais: identificacoesAdicionais.length > 0
              ? {
                  create: identificacoesAdicionais,
                }
              : undefined,
          },
          select: {
            id: true,
            codigo: true,
            codigoInterno: true,
            paisCodigo: true,
            nome: true,
            situacao: true,
          },
        });

        const operadorCriado: OperadorLocalResumo = {
          id: criado.id,
          codigo: this.normalizarCodigo(criado.codigo),
          codigoInterno: this.normalizarCodigo(criado.codigoInterno),
          paisCodigo: this.normalizarCodigoNormalizado(criado.paisCodigo) ?? paisCodigo!,
          nome: criado.nome,
          situacao: criado.situacao,
        };

        resumo.operadores.criados += 1;
        artefatosReversao.operadorIdsCriados.push(criado.id);
        this.adicionarOperadorAoIndice(indiceOperadores, operadorCriado);
        if (operadorCriado.codigo) {
          operadoresResolvidosPorCodigo.set(operadorCriado.codigo, operadorCriado);
        }
      } catch (error) {
        const mensagemErro =
          error instanceof Error ? error.message : 'Falha desconhecida ao criar operador.';
        resumo.operadores.comErro += 1;
        this.adicionarPendencia(
          resumo.operadores.pendencias,
          referencia,
          `Erro ao criar operador estrangeiro: ${mensagemErro}`
        );
      }
    }

    await emitirHeartbeat();

    if (vinculosArquivo.length > 0) {
      const produtoIdsResolvidos = Array.from(
        new Set(Array.from(produtosResolvidosPorSeq.values()).map(item => item.produtoId))
      );

      const vinculosLocais = produtoIdsResolvidos.length
        ? await catalogoPrisma.operadorEstrangeiroProduto.findMany({
            where: { produtoId: { in: produtoIdsResolvidos } },
            select: {
              id: true,
              produtoId: true,
              paisCodigo: true,
              conhecido: true,
              operadorEstrangeiroId: true,
            },
          })
        : [];

      const indiceVinculos = this.criarIndiceVinculos(vinculosLocais);

      for (let indice = 0; indice < vinculosArquivo.length; indice += 1) {
        const registro = vinculosArquivo[indice];
        const referencia = `V-${this.normalizarReferencia(registro.seq, indice + 1)}`;

        if (registro.vincular === false) {
          resumo.vinculos.comErro += 1;
          this.adicionarPendencia(
            resumo.vinculos.pendencias,
            referencia,
            'Registros de desvinculacao nao sao suportados pela importacao por arquivo.'
          );
          continue;
        }

        const codigoPais = this.normalizarCodigoNormalizado(registro.codigoPais);
        if (!codigoPais || !codigosPaisValidos.has(codigoPais)) {
          resumo.vinculos.comErro += 1;
          this.adicionarPendencia(
            resumo.vinculos.pendencias,
            referencia,
            `Codigo de pais invalido para vinculo: ${registro.codigoPais ?? ''}.`
          );
          continue;
        }

        const chaveProduto = this.normalizarCodigo(registro.codigoProduto);
        if (!chaveProduto) {
          resumo.vinculos.semProduto += 1;
          resumo.vinculos.comErro += 1;
          this.adicionarPendencia(
            resumo.vinculos.pendencias,
            referencia,
            'Codigo do produto nao informado no vinculo.'
          );
          continue;
        }

        const produtoArquivo =
          produtosDoArquivoPorCodigoOuSeq.get(chaveProduto) ??
          produtosDoArquivoPorSeq.get(chaveProduto);

        if (!produtoArquivo) {
          resumo.vinculos.semProduto += 1;
          resumo.vinculos.comErro += 1;
          this.adicionarPendencia(
            resumo.vinculos.pendencias,
            referencia,
            `Nenhum produto do arquivo corresponde ao identificador ${chaveProduto}.`
          );
          continue;
        }

        const produtoResolvido = produtosResolvidosPorSeq.get(produtoArquivo.seqChave);
        if (!produtoResolvido) {
          resumo.vinculos.semProduto += 1;
          resumo.vinculos.comErro += 1;
          this.adicionarPendencia(
            resumo.vinculos.pendencias,
            referencia,
            `O produto ${produtoArquivo.denominacao} nao foi resolvido localmente, entao o vinculo nao pode ser criado.`
          );
          continue;
        }

        let operadorEstrangeiroId: number | null = null;
        const conhecido = Boolean(registro.conhecido);
        const codigoOperador = this.normalizarCodigo(registro.codigoOperadorEstrangeiro);

        if (conhecido) {
          if (!codigoOperador) {
            resumo.vinculos.semOperador += 1;
            resumo.vinculos.comErro += 1;
            this.adicionarPendencia(
              resumo.vinculos.pendencias,
              referencia,
              'Vinculo marcado como conhecido sem codigo de operador estrangeiro.'
            );
            continue;
          }

          const operadorResolvido = operadoresResolvidosPorCodigo.get(codigoOperador);
          if (!operadorResolvido) {
            resumo.vinculos.semOperador += 1;
            resumo.vinculos.comErro += 1;
            this.adicionarPendencia(
              resumo.vinculos.pendencias,
              referencia,
              bundle.arquivos.operadores
                ? `Nao foi possivel localizar localmente o operador ${codigoOperador}.`
                : `Nao foi possivel localizar localmente o operador ${codigoOperador} e o arquivo de operadores nao foi informado.`
            );
            continue;
          }

          operadorEstrangeiroId = operadorResolvido.id;
        }

        const chaveVinculo = this.gerarChaveVinculo(
          produtoResolvido.produtoId,
          codigoPais,
          conhecido,
          operadorEstrangeiroId
        );

        if (indiceVinculos.has(chaveVinculo)) {
          resumo.vinculos.existentes += 1;
          continue;
        }

        try {
          const vinculoCriado = await catalogoPrisma.operadorEstrangeiroProduto.create({
            data: {
              produtoId: produtoResolvido.produtoId,
              paisCodigo: codigoPais,
              conhecido,
              operadorEstrangeiroId,
            },
            select: { id: true },
          });

          artefatosReversao.vinculoIdsCriados.push(vinculoCriado.id);
          resumo.vinculos.criados += 1;
          if (conhecido) {
            resumo.vinculos.criadosComOperador += 1;
          } else {
            resumo.vinculos.criadosSomentePais += 1;
          }
          indiceVinculos.add(chaveVinculo);
        } catch (error) {
          const mensagemErro =
            error instanceof Error ? error.message : 'Falha desconhecida ao criar vinculo.';
          resumo.vinculos.comErro += 1;
          this.adicionarPendencia(
            resumo.vinculos.pendencias,
            referencia,
            `Erro ao criar vinculo local: ${mensagemErro}`
          );
        }
      }
    }

    const resultadoFinal: ImportacaoResultado =
      totalComErro > 0 ||
      totalComAtencao > 0 ||
      resumo.operadores.comErro > 0 ||
      resumo.vinculos.comErro > 0
        ? 'ATENCAO'
        : 'SUCESSO';

    return {
      modalidadeDetectada,
      totalRegistros: produtosArquivo.length,
      totalCriados,
      totalComAtencao,
      totalComErro,
      resultadoFinal,
      resumo,
      artefatosReversao,
    };
  }

  private lerJson<T>(arquivo: ArquivoImportacaoSiscomex, descricao: string): T[] {
    const conteudo = Buffer.from(arquivo.conteudoBase64, 'base64').toString('utf8');
    const dados = JSON.parse(conteudo) as unknown;

    if (!Array.isArray(dados)) {
      throw new Error(`O arquivo JSON de ${descricao} nao contem uma lista de registros.`);
    }

    return dados as T[];
  }

  private validarRaizArquivo<T extends object>(
    registros: T[],
    campo: keyof T,
    raizCatalogo: string | null,
    descricao: string
  ) {
    const raizes = Array.from(
      new Set(
        registros
          .map(registro =>
            this.normalizarCodigo(
              (registro as Record<string, unknown>)[campo as string] as
                | string
                | number
                | null
            )
          )
          .filter((valor): valor is string => Boolean(valor))
      )
    );

    if (raizes.length > 1) {
      throw new Error(
        `O arquivo de ${descricao} contem mais de uma raiz de CNPJ/CPF e nao pode ser importado.`
      );
    }

    if (raizCatalogo && raizes.length === 1 && raizes[0] !== raizCatalogo) {
      throw new Error(
        `A raiz do arquivo de ${descricao} (${raizes[0]}) nao corresponde ao catalogo selecionado (${raizCatalogo}).`
      );
    }
  }

  private normalizarProduto(
    registro: ProdutoSiscomexRegistro,
    referencia: number,
    mensagens: MensagensItemImportacao
  ): ProdutoNormalizado {
    const denominacao = this.normalizarTextoLivre(registro.denominacao);
    if (!denominacao) {
      mensagens.impeditivos.push('Denominacao do produto nao informada.');
    }

    const descricao = this.normalizarTextoLivre(registro.descricao) ?? denominacao ?? '';
    if (!descricao) {
      mensagens.impeditivos.push('Descricao do produto nao informada.');
    }

    const modalidade = this.normalizarModalidade(registro.modalidade);
    if (!modalidade) {
      mensagens.impeditivos.push('Modalidade do produto nao informada.');
    }

    const ncm = this.normalizarNcm(registro.ncm);
    if (!ncm) {
      mensagens.impeditivos.push('NCM nao informada ou mal formatada.');
    }

    const codigosInternos = this.normalizarListaCodigos(registro.codigosInterno);
    const codigoSiscomex = this.normalizarCodigo(registro.codigo);
    const versao = normalizarVersaoSiscomex(registro.versao);

    if (codigoSiscomex && !versao) {
      mensagens.impeditivos.push('Versao SISCOMEX do produto nao informada ou mal formatada.');
    }

    return {
      referencia,
      seqChave: String(referencia),
      codigoSiscomex,
      versao,
      denominacao: denominacao ?? '',
      descricao,
      modalidade: modalidade ?? 'IMPORTACAO',
      ncm,
      situacao: this.normalizarSituacaoProduto(registro.situacao),
      codigosInternos,
    };
  }

  private montarValoresAtributos(registro: ProdutoSiscomexRegistro): Record<string, unknown> {
    const valores: Record<string, unknown> = {};

    const adicionarValor = (codigo: string | null, valor: unknown) => {
      if (!codigo) return;
      if (!(codigo in valores)) {
        valores[codigo] = valor;
        return;
      }

      const atual = valores[codigo];
      if (Array.isArray(atual)) {
        valores[codigo] = [...atual, valor];
        return;
      }

      valores[codigo] = [atual, valor];
    };

    for (const item of registro.atributos ?? []) {
      adicionarValor(this.normalizarCodigo(item.atributo), item.valor);
    }

    for (const item of registro.atributosMultivalorados ?? []) {
      const codigo = this.normalizarCodigo(item.atributo);
      if (!codigo) continue;
      valores[codigo] = Array.isArray(item.valores) ? item.valores : [];
    }

    for (const item of registro.atributosCompostos ?? []) {
      for (const valor of item.valores ?? []) {
        adicionarValor(this.normalizarCodigo(valor.atributo), valor.valor);
      }
    }

    for (const item of registro.atributosCompostosMultivalorados ?? []) {
      for (const grupo of item.valores ?? []) {
        for (const valor of grupo ?? []) {
          adicionarValor(this.normalizarCodigo(valor.atributo), valor.valor);
        }
      }
    }

    return valores;
  }

  private resolverProdutoExistente(
    produto: ProdutoNormalizado,
    indice: ReturnType<ProdutoImportacaoSiscomexArquivoService['criarIndiceProdutos']>
  ): ProdutoMatchResultado {
    if (produto.codigoSiscomex) {
      const porCodigo = indice.porCodigoSiscomex.get(produto.codigoSiscomex);
      if (porCodigo) {
        if (
          porCodigo.ncmCodigo !== produto.ncm ||
          (this.normalizarModalidade(porCodigo.modalidade) ?? 'IMPORTACAO') !== produto.modalidade
        ) {
          return { tipo: 'DIVERGENCIA_NCM', candidatos: [porCodigo] };
        }

        return { tipo: 'EXISTENTE', produto: porCodigo, origem: 'CODIGO' };
      }
    }

    if (!produto.codigosInternos.length) {
      return { tipo: 'SEM_MATCH' };
    }

    const candidatos = new Map<number, ProdutoLocalResumo>();

    for (const codigoInterno of produto.codigosInternos) {
      for (const candidato of indice.porCodigoInterno.get(codigoInterno) ?? []) {
        candidatos.set(candidato.id, candidato);
      }
    }

    const listaCandidatos = Array.from(candidatos.values());
    if (!listaCandidatos.length) {
      return { tipo: 'SEM_MATCH' };
    }

    const candidatosExatos = listaCandidatos.filter(
      candidato =>
        candidato.ncmCodigo === produto.ncm &&
        (this.normalizarModalidade(candidato.modalidade) ?? 'IMPORTACAO') === produto.modalidade
    );

    if (candidatosExatos.length === 1 && listaCandidatos.length === 1) {
      return {
        tipo: 'EXISTENTE',
        produto: candidatosExatos[0],
        origem: 'CODIGO_INTERNO',
      };
    }

    if (candidatosExatos.length === 0 && listaCandidatos.length === 1) {
      return { tipo: 'DIVERGENCIA_NCM', candidatos: listaCandidatos };
    }

    return {
      tipo: 'AMBIGUO',
      candidatos: candidatosExatos.length ? candidatosExatos : listaCandidatos,
      motivo:
        candidatosExatos.length > 1
          ? 'mais de um produto local compartilha o mesmo codigo interno com NCM/modalidade iguais'
          : 'os codigos internos encontrados apontam para mais de um produto local',
    };
  }

  private resolverOperadorExistente(
    operador: {
      codigo: string | null;
      codigoInterno: string | null;
      paisCodigo: string;
      nome: string;
    },
    indice: ReturnType<ProdutoImportacaoSiscomexArquivoService['criarIndiceOperadores']>
  ): OperadorMatchResultado {
    if (operador.codigo) {
      const candidatosPorCodigo = indice.porCodigoSiscomex.get(operador.codigo) ?? [];
      if (candidatosPorCodigo.length === 1) {
        if (candidatosPorCodigo[0].paisCodigo !== operador.paisCodigo) {
          return {
            tipo: 'CONFLITO',
            candidatos: candidatosPorCodigo,
            motivo: `Ja existe operador local com codigo ${operador.codigo}, mas com pais ${candidatosPorCodigo[0].paisCodigo}.`,
          };
        }

        return { tipo: 'EXISTENTE', operador: candidatosPorCodigo[0] };
      }

      if (candidatosPorCodigo.length > 1) {
        return {
          tipo: 'AMBIGUO',
          candidatos: candidatosPorCodigo,
          motivo: `Ja existem ${candidatosPorCodigo.length} operadores locais com o codigo ${operador.codigo}.`,
        };
      }
    }

    if (!operador.codigoInterno) {
      return { tipo: 'SEM_MATCH' };
    }

    const chaveInterna = this.gerarChaveOperadorInterno(
      operador.codigoInterno,
      operador.paisCodigo
    );
    const candidatosPorChave = indice.porCodigoInternoEPais.get(chaveInterna) ?? [];

    if (candidatosPorChave.length === 1) {
      const candidato = candidatosPorChave[0];
      if (candidato.codigo && operador.codigo && candidato.codigo !== operador.codigo) {
        return {
          tipo: 'CONFLITO',
          candidatos: [candidato],
          motivo: `O operador local com codigo interno ${operador.codigoInterno} ja possui codigo SISCOMEX diferente (${candidato.codigo}).`,
        };
      }

      return { tipo: 'EXISTENTE', operador: candidato };
    }

    if (candidatosPorChave.length > 1) {
      return {
        tipo: 'AMBIGUO',
        candidatos: candidatosPorChave,
        motivo: `Mais de um operador local compartilha o codigo interno ${operador.codigoInterno} para o pais ${operador.paisCodigo}.`,
      };
    }

    return { tipo: 'SEM_MATCH' };
  }

  private async registrarItemProduto(params: {
    importacaoId: number;
    referencia: number;
    produto: ProdutoNormalizado;
    resultado: ImportacaoProdutoItemResultado;
    mensagens: MensagensItemImportacao;
    produtoId: number | null;
  }) {
    await catalogoPrisma.importacaoProdutoItem.create({
      data: {
        importacaoId: params.importacaoId,
        linhaPlanilha: params.referencia,
        ncm: params.produto.ncm,
        denominacao: params.produto.denominacao,
        codigosInternos: params.produto.codigosInternos.join(', ') || null,
        resultado: params.resultado,
        mensagens: params.mensagens as unknown as Prisma.InputJsonValue,
        possuiErroImpeditivo: params.mensagens.impeditivos.length > 0,
        possuiAlerta: params.mensagens.atencao.length > 0,
        produtoId: params.produtoId,
      },
    });
  }

  private criarIndiceProdutos(produtos: ProdutoLocalResumo[]) {
    const porCodigoSiscomex = new Map<string, ProdutoLocalResumo>();
    const porCodigoInterno = new Map<string, ProdutoLocalResumo[]>();

    for (const produto of produtos) {
      if (produto.codigo) {
        porCodigoSiscomex.set(produto.codigo, produto);
      }

      for (const codigoInterno of produto.codigosInternos) {
        const lista = porCodigoInterno.get(codigoInterno) ?? [];
        lista.push(produto);
        porCodigoInterno.set(codigoInterno, lista);
      }
    }

    return { porCodigoSiscomex, porCodigoInterno };
  }

  private adicionarProdutoAoIndice(
    indice: ReturnType<ProdutoImportacaoSiscomexArquivoService['criarIndiceProdutos']>,
    produto: ProdutoLocalResumo
  ) {
    if (produto.codigo) {
      indice.porCodigoSiscomex.set(produto.codigo, produto);
    }

    for (const codigoInterno of produto.codigosInternos) {
      const lista = indice.porCodigoInterno.get(codigoInterno) ?? [];
      lista.push(produto);
      indice.porCodigoInterno.set(codigoInterno, lista);
    }
  }

  private criarIndiceOperadores(operadores: OperadorLocalResumo[]) {
    const porCodigoSiscomex = new Map<string, OperadorLocalResumo[]>();
    const porCodigoInternoEPais = new Map<string, OperadorLocalResumo[]>();

    for (const operador of operadores) {
      if (operador.codigo) {
        const lista = porCodigoSiscomex.get(operador.codigo) ?? [];
        lista.push(operador);
        porCodigoSiscomex.set(operador.codigo, lista);
      }

      if (operador.codigoInterno) {
        const chave = this.gerarChaveOperadorInterno(
          operador.codigoInterno,
          operador.paisCodigo
        );
        const lista = porCodigoInternoEPais.get(chave) ?? [];
        lista.push(operador);
        porCodigoInternoEPais.set(chave, lista);
      }
    }

    return { porCodigoSiscomex, porCodigoInternoEPais };
  }

  private adicionarOperadorAoIndice(
    indice: ReturnType<ProdutoImportacaoSiscomexArquivoService['criarIndiceOperadores']>,
    operador: OperadorLocalResumo
  ) {
    if (operador.codigo) {
      const lista = indice.porCodigoSiscomex.get(operador.codigo) ?? [];
      lista.push(operador);
      indice.porCodigoSiscomex.set(operador.codigo, lista);
    }

    if (operador.codigoInterno) {
      const chave = this.gerarChaveOperadorInterno(
        operador.codigoInterno,
        operador.paisCodigo
      );
      const lista = indice.porCodigoInternoEPais.get(chave) ?? [];
      lista.push(operador);
      indice.porCodigoInternoEPais.set(chave, lista);
    }
  }

  private criarIndiceVinculos(vinculos: VinculoLocalResumo[]) {
    return new Set(
      vinculos.map(vinculo =>
        this.gerarChaveVinculo(
          vinculo.produtoId,
          vinculo.paisCodigo,
          vinculo.conhecido,
          vinculo.operadorEstrangeiroId
        )
      )
    );
  }

  private gerarChaveOperadorInterno(codigoInterno: string, paisCodigo: string) {
    return `${codigoInterno}::${paisCodigo}`;
  }

  private gerarChaveVinculo(
    produtoId: number,
    paisCodigo: string,
    conhecido: boolean,
    operadorEstrangeiroId: number | null
  ) {
    return `${produtoId}::${paisCodigo}::${conhecido ? '1' : '0'}::${operadorEstrangeiroId ?? 'null'}`;
  }

  private registroJaTransmitido(
    registro:
      | { situacao: ProdutoSituacao; codigo: string | null }
      | { situacao: OperadorEstrangeiroStatus; codigo: string | null }
  ) {
    return registro.situacao !== 'RASCUNHO' && Boolean(registro.codigo);
  }

  private adicionarPendencia(
    lista: SiscomexResumoPendencia[],
    referencia: string,
    motivo: string
  ) {
    if (lista.length >= LIMITE_PENDENCIAS_RESUMO) {
      return;
    }

    lista.push({ referencia, motivo });
  }

  private normalizarNcm(valor: unknown) {
    if (valor === null || valor === undefined) return null;
    const texto = String(valor).trim();
    if (!/^\d{8}$/.test(texto)) {
      return null;
    }
    return texto;
  }

  private normalizarTexto(valor: unknown) {
    if (valor === null || valor === undefined) return null;
    const texto = String(valor).trim();
    return texto ? texto.toUpperCase() : null;
  }

  private normalizarCodigoNormalizado(valor: unknown) {
    const texto = this.normalizarCodigo(valor);
    return texto ? texto.toUpperCase() : null;
  }

  private normalizarTextoLivre(valor: unknown) {
    if (valor === null || valor === undefined) return null;
    const texto = String(valor).trim();
    return texto ? texto : null;
  }

  private normalizarCodigo(valor: unknown) {
    if (valor === null || valor === undefined) return null;
    const texto = String(valor).trim();
    return texto ? texto : null;
  }

  private normalizarListaCodigos(valor: unknown): string[] {
    if (!Array.isArray(valor)) {
      return [];
    }

    return Array.from(
      new Set(
        valor
          .map(item => this.normalizarCodigo(item))
          .filter((codigo): codigo is string => Boolean(codigo))
      )
    );
  }

  private normalizarModalidade(valor: unknown) {
    const texto = this.normalizarCodigo(valor);
    if (!texto) return null;
    return texto.toUpperCase();
  }

  private normalizarSituacaoProduto(valor: unknown): ProdutoSituacao {
    const texto = this.normalizarCodigo(valor)?.toUpperCase();
    if (texto === 'DESATIVADO') return 'DESATIVADO';
    if (texto === 'ATIVADO' || texto === 'ATIVAR') return 'ATIVADO';
    return 'RASCUNHO';
  }

  private normalizarSituacaoOperador(valor: unknown): OperadorEstrangeiroStatus {
    const texto = this.normalizarCodigo(valor)?.toUpperCase();
    if (texto === 'DESATIVADO') return 'DESATIVADO';
    if (texto === 'ATIVADO' || texto === 'ATIVAR') return 'ATIVADO';
    return 'RASCUNHO';
  }

  private normalizarVersaoInteira(valor: unknown) {
    if (valor === null || valor === undefined) return 1;
    const texto = String(valor).trim();
    const inteiro = Number.parseInt(texto, 10);
    return Number.isFinite(inteiro) && inteiro > 0 ? inteiro : 1;
  }

  private normalizarReferencia(valor: unknown, fallback: number) {
    const numero = Number(valor);
    if (Number.isInteger(numero) && numero > 0) {
      return numero;
    }
    return fallback;
  }

  private obterCpfCnpjRaiz(valor: string | null) {
    if (!valor) return null;
    const apenasDigitos = valor.replace(/\D/g, '');
    return apenasDigitos.length >= 8 ? apenasDigitos.slice(0, 8) : null;
  }
}
