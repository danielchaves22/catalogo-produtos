import { createHash } from 'crypto';
import { AsyncJobStatus } from '@prisma/client';
import { AsyncJobHandler } from '../async-job.worker';
import { AtributoEstruturaDTO, AtributoLegacyService } from '../../services/atributo-legacy.service';
import { catalogoPrisma } from '../../utils/prisma';
import { atualizarArquivoJob, registerJobLog } from '../async-job.repository';

export interface VerificacaoAtributosPayload {
  superUserId: number;
  usuarioId: number;
}

interface DiferencaAtributo {
  codigo: string;
  tipo: 'ADICIONADO' | 'REMOVIDO' | 'MODIFICADO';
  campo?: string;
  valorAtual?: unknown;
  valorLegado?: unknown;
  caminho?: string[];
}

export interface ResultadoVerificacao {
  ncmCodigo: string;
  modalidade: string;
  versaoId: number;
  versaoNumero: number;
  hashAtual: string;
  hashLegado: string;
  divergente: boolean;
  totais: {
    atributos: number;
    dominios: number;
  };
  diferencas?: DiferencaAtributo[];
}

const atributoLegacyService = new AtributoLegacyService();

function normalizarValor(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(normalizarValor);
  }

  if (valor && typeof valor === 'object') {
    const entradasOrdenadas = Object.entries(valor as Record<string, unknown>)
      .sort(([chaveA], [chaveB]) => chaveA.localeCompare(chaveB));

    return entradasOrdenadas.reduce<Record<string, unknown>>((acc, [chave, val]) => {
      acc[chave] = normalizarValor(val);
      return acc;
    }, {});
  }

  return valor ?? null;
}

function normalizarAtributo(atributo: AtributoEstruturaDTO): AtributoEstruturaDTO {
  const dominioOrdenado = [...(atributo.dominio ?? [])].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const subAtributosOrdenados = [...(atributo.subAtributos ?? [])]
    .map(sub => normalizarAtributo(sub))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  const validacoesOrdenadas = normalizarValor(atributo.validacoes ?? {});
  const condicaoOrdenada = normalizarValor(atributo.condicao ?? null);

  return {
    ...atributo,
    validacoes: validacoesOrdenadas as Record<string, unknown>,
    condicao: condicaoOrdenada ?? undefined,
    dominio: dominioOrdenado,
    subAtributos: subAtributosOrdenados,
  };
}

function gerarHashEstrutura(estrutura: AtributoEstruturaDTO[]): string {
  const estruturaNormalizada = estrutura
    .map(normalizarAtributo)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  const json = JSON.stringify(estruturaNormalizada);
  return createHash('sha256').update(json).digest('hex');
}

function contarEstrutura(estrutura: AtributoEstruturaDTO[]): { atributos: number; dominios: number } {
  let atributos = 0;
  let dominios = 0;

  const percorrer = (lista: AtributoEstruturaDTO[]) => {
    for (const attr of lista) {
      atributos += 1;
      dominios += attr.dominio?.length ?? 0;
      if (attr.subAtributos?.length) {
        percorrer(attr.subAtributos);
      }
    }
  };

  percorrer(estrutura);
  return { atributos, dominios };
}

function detectarDiferencas(
  estruturaAtual: AtributoEstruturaDTO[],
  estruturaLegada: AtributoEstruturaDTO[],
  caminho: string[] = []
): DiferencaAtributo[] {
  const diferencas: DiferencaAtributo[] = [];

  // Cria mapas indexados por código para facilitar comparação
  const mapaAtual = new Map<string, AtributoEstruturaDTO>();
  const mapaLegado = new Map<string, AtributoEstruturaDTO>();

  const indexar = (lista: AtributoEstruturaDTO[], mapa: Map<string, AtributoEstruturaDTO>) => {
    for (const attr of lista) {
      mapa.set(attr.codigo, attr);
      if (attr.subAtributos?.length) {
        indexar(attr.subAtributos, mapa);
      }
    }
  };

  indexar(estruturaAtual, mapaAtual);
  indexar(estruturaLegada, mapaLegado);

  // Verifica atributos removidos ou modificados
  for (const [codigo, attrAtual] of mapaAtual) {
    const attrLegado = mapaLegado.get(codigo);
    const caminhoAtual = [...caminho, codigo];

    if (!attrLegado) {
      diferencas.push({
        codigo,
        tipo: 'REMOVIDO',
        caminho: caminhoAtual,
        valorAtual: attrAtual.nome,
      });
      continue;
    }

    // Compara propriedades
    if (attrAtual.nome !== attrLegado.nome) {
      diferencas.push({
        codigo,
        tipo: 'MODIFICADO',
        campo: 'nome',
        valorAtual: attrAtual.nome,
        valorLegado: attrLegado.nome,
        caminho: caminhoAtual,
      });
    }

    if (attrAtual.tipo !== attrLegado.tipo) {
      diferencas.push({
        codigo,
        tipo: 'MODIFICADO',
        campo: 'tipo',
        valorAtual: attrAtual.tipo,
        valorLegado: attrLegado.tipo,
        caminho: caminhoAtual,
      });
    }

    if (attrAtual.obrigatorio !== attrLegado.obrigatorio) {
      diferencas.push({
        codigo,
        tipo: 'MODIFICADO',
        campo: 'obrigatorio',
        valorAtual: attrAtual.obrigatorio,
        valorLegado: attrLegado.obrigatorio,
        caminho: caminhoAtual,
      });
    }

    if (attrAtual.multivalorado !== attrLegado.multivalorado) {
      diferencas.push({
        codigo,
        tipo: 'MODIFICADO',
        campo: 'multivalorado',
        valorAtual: attrAtual.multivalorado,
        valorLegado: attrLegado.multivalorado,
        caminho: caminhoAtual,
      });
    }

    // Compara domínios
    const dominioAtualStr = JSON.stringify(attrAtual.dominio?.map(d => d.codigo).sort() ?? []);
    const dominioLegadoStr = JSON.stringify(attrLegado.dominio?.map(d => d.codigo).sort() ?? []);
    if (dominioAtualStr !== dominioLegadoStr) {
      diferencas.push({
        codigo,
        tipo: 'MODIFICADO',
        campo: 'dominio',
        valorAtual: attrAtual.dominio?.length ?? 0,
        valorLegado: attrLegado.dominio?.length ?? 0,
        caminho: caminhoAtual,
      });
    }

    // Compara validações
    const validacoesAtualStr = JSON.stringify(normalizarValor(attrAtual.validacoes));
    const validacoesLegadoStr = JSON.stringify(normalizarValor(attrLegado.validacoes));
    if (validacoesAtualStr !== validacoesLegadoStr) {
      diferencas.push({
        codigo,
        tipo: 'MODIFICADO',
        campo: 'validacoes',
        valorAtual: attrAtual.validacoes,
        valorLegado: attrLegado.validacoes,
        caminho: caminhoAtual,
      });
    }
  }

  // Verifica atributos adicionados
  for (const [codigo, attrLegado] of mapaLegado) {
    if (!mapaAtual.has(codigo)) {
      diferencas.push({
        codigo,
        tipo: 'ADICIONADO',
        caminho: [...caminho, codigo],
        valorLegado: attrLegado.nome,
      });
    }
  }

  return diferencas;
}

export const verificacaoAtributosNcmHandler: AsyncJobHandler<VerificacaoAtributosPayload> = async ({
  job,
  payload,
  heartbeat,
}) => {
  if (!payload?.superUserId || !payload?.usuarioId) {
    throw new Error('Payload da verificação de atributos inválido.');
  }

  // Busca apenas NCMs que estão sendo utilizadas em produtos
  const ncmsUtilizadas = await catalogoPrisma.$queryRaw<Array<{ ncmCodigo: string; modalidade: string }>>`
    SELECT DISTINCT p.ncm_codigo AS ncmCodigo, p.modalidade
    FROM produto p
    WHERE p.ncm_codigo IS NOT NULL
    ORDER BY p.ncm_codigo, p.modalidade
  `;

  // Busca as versões mais recentes dessas NCMs
  const versoes = await catalogoPrisma.$transaction(
    ncmsUtilizadas.map(({ ncmCodigo, modalidade }) =>
      catalogoPrisma.atributoVersao.findFirst({
        where: { ncmCodigo, modalidade },
        orderBy: { versao: 'desc' },
      })
    )
  );

  const versoesValidas = versoes.filter((v): v is NonNullable<typeof v> => v !== null);

  await registerJobLog(
    job.id,
    AsyncJobStatus.PROCESSANDO,
    `Iniciando verificação de ${versoesValidas.length} combinação(ões) de NCM/modalidade utilizadas em produtos.`
  );

  const resultados: ResultadoVerificacao[] = [];

  for (const versao of versoesValidas) {
    await heartbeat();

    const modalidade = versao.modalidade ?? 'IMPORTACAO';
    const estruturaAtual = await atributoLegacyService.buscarEstruturaPorVersao(versao.id);

    if (!estruturaAtual) {
      await registerJobLog(
        job.id,
        AsyncJobStatus.PROCESSANDO,
        `Estrutura local não encontrada para ${versao.ncmCodigo} (${modalidade}).`
      );
      continue;
    }

    const estruturaLegada = await atributoLegacyService.buscarEstruturaLegadaAtual(
      versao.ncmCodigo,
      modalidade
    );

    const hashAtual = gerarHashEstrutura(estruturaAtual.estrutura);
    const hashLegado = gerarHashEstrutura(estruturaLegada);
    const totais = contarEstrutura(estruturaAtual.estrutura);
    const divergente = hashAtual !== hashLegado;

    // Se houver divergência, detecta as diferenças específicas
    const diferencas = divergente
      ? detectarDiferencas(estruturaAtual.estrutura, estruturaLegada)
      : undefined;

    resultados.push({
      ncmCodigo: versao.ncmCodigo,
      modalidade,
      versaoId: versao.id,
      versaoNumero: versao.versao,
      hashAtual,
      hashLegado,
      divergente,
      totais,
      diferencas,
    });
  }

  const divergentes = resultados.filter(item => item.divergente).length;
  const conteudo = JSON.stringify(resultados, null, 2);
  const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await atualizarArquivoJob(job.id, {
    nome: `verificacao-atributos-${job.id}.json`,
    conteudoBase64: Buffer.from(conteudo, 'utf8').toString('base64'),
    expiraEm,
  });

  await registerJobLog(
    job.id,
    AsyncJobStatus.PROCESSANDO,
    `Verificação concluída com ${divergentes} divergência(s) em ${resultados.length} combinação(ões).`
  );
};
