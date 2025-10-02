import { logger } from '../utils/logger';

export interface ProdutoImportacaoJobData {
  importacaoId: number;
  superUserId: number;
  usuarioCatalogoId: number | null;
  catalogoId: number;
  modalidade: string;
  arquivo: {
    nome: string;
    conteudoBase64: string;
  };
}

type ProdutoImportacaoProcessor = (data: ProdutoImportacaoJobData) => Promise<void>;

const fila: ProdutoImportacaoJobData[] = [];
let processor: ProdutoImportacaoProcessor | null = null;
let processando = false;

export function registerProdutoImportacaoProcessor(fn: ProdutoImportacaoProcessor) {
  processor = fn;
  if (fila.length > 0) {
    iniciarProcessamento();
  }
}

export async function enqueueProdutoImportacaoJob(data: ProdutoImportacaoJobData) {
  fila.push(data);
  iniciarProcessamento();
}

function iniciarProcessamento() {
  if (processando) {
    return;
  }

  processando = true;
  setImmediate(processarProximo);
}

async function processarProximo() {
  const proximo = fila.shift();

  if (!proximo) {
    processando = false;
    return;
  }

  try {
    if (!processor) {
      throw new Error('Nenhum processador registrado para a fila de importação.');
    }

    await processor(proximo);
  } catch (error) {
    logger.error('Falha ao processar job de importação de produtos:', error);
  } finally {
    if (fila.length > 0) {
      setImmediate(processarProximo);
    } else {
      processando = false;
    }
  }
}

export function getFilaTamanhoAtual() {
  return fila.length;
}

export function limparFila() {
  fila.length = 0;
  processando = false;
}
