import axios, { AxiosInstance } from 'axios';
import { AtributoEstruturaDTO } from './atributo-legacy.service';
import { logger } from '../utils/logger';

interface SugestaoIARequest {
  descricao: string;
  atributos: AtributoEstruturaDTO[];
  ncm?: string;
  modalidade?: string;
  maxTokensResposta?: number;
}

interface SugestaoIAResultado {
  sugestoes: Record<string, string | string[]>;
  modelo: string;
  tokens?: {
    total?: number;
    prompt?: number;
    resposta?: number;
  };
}

interface AtributoCompacto {
  codigo: string;
  nome: string;
  tipo: string;
  obrigatorio?: boolean;
  multivalorado?: boolean;
  dominio?: Array<{ codigo: string; descricao?: string | null }>;
  validacoes?: Record<string, unknown>;
  condicao?: any;
  descricaoCondicao?: string;
  parentCodigo?: string;
  condicionanteCodigo?: string;
}

export class IaSugestaoAtributosService {
  private readonly apiKey = process.env.OPENAI_API_KEY;
  private readonly baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  private readonly modelo = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  private readonly timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS ?? 15000);
  private readonly cliente: AxiosInstance;

  constructor() {
    if (!this.apiKey) {
      logger.warn('OPENAI_API_KEY não configurada; sugestões por IA estarão indisponíveis');
    }

    this.cliente = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeoutMs,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async sugerirValores({
    descricao,
    atributos,
    ncm,
    modalidade,
    maxTokensResposta
  }: SugestaoIARequest): Promise<SugestaoIAResultado> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY ausente');
    }

    const descricaoCompacta = this.compactarDescricao(descricao);
    const atributosCompactos = this.compactarAtributos(atributos);

    const prompt = this.montarPrompt({
      descricao: descricaoCompacta,
      atributos: atributosCompactos,
      ncm,
      modalidade
    });

    const resposta = await this.cliente.post('/chat/completions', {
      model: this.modelo,
      temperature: 0.2,
      max_tokens: maxTokensResposta ?? 240,
      response_format: { type: 'json_object' },
      messages: prompt
    });

    const conteudo = resposta.data?.choices?.[0]?.message?.content;
    if (!conteudo) {
      throw new Error('Resposta vazia do provedor de IA');
    }

    let payload: Record<string, string | string[]>;
    try {
      payload = JSON.parse(conteudo);
    } catch (error) {
      logger.warn(
        `Falha ao converter resposta da IA para JSON. Conteúdo bruto retornado: ${conteudo}`
      );
      throw new Error('Formato de resposta inválido retornado pela IA');
    }

    return {
      sugestoes: payload,
      modelo: resposta.data?.model ?? this.modelo,
      tokens: {
        total: resposta.data?.usage?.total_tokens,
        prompt: resposta.data?.usage?.prompt_tokens,
        resposta: resposta.data?.usage?.completion_tokens
      }
    };
  }

  private compactarDescricao(texto: string): string {
    const normalizado = texto.replace(/\s+/g, ' ').trim();
    const limite = 1200;
    if (normalizado.length <= limite) return normalizado;
    return `${normalizado.slice(0, limite)}...`;
  }

  private compactarAtributos(atributos: AtributoEstruturaDTO[]): AtributoCompacto[] {
    const resultado: AtributoCompacto[] = [];

    const visitar = (lista: AtributoEstruturaDTO[]) => {
      for (const attr of lista) {
        resultado.push({
          codigo: attr.codigo,
          nome: attr.nome,
          tipo: attr.tipo,
          obrigatorio: attr.obrigatorio,
          multivalorado: attr.multivalorado,
          dominio: attr.dominio?.map(d => ({ codigo: d.codigo, descricao: d.descricao })),
          validacoes: this.compactarValidacoes(attr.validacoes),
          condicao: attr.condicao,
          descricaoCondicao: attr.descricaoCondicao,
          parentCodigo: attr.parentCodigo,
          condicionanteCodigo: attr.condicionanteCodigo
        });

        if (attr.subAtributos?.length) {
          visitar(attr.subAtributos);
        }
      }
    };

    visitar(atributos);
    return resultado;
  }

  private compactarValidacoes(validacoes?: Record<string, any>): Record<string, unknown> | undefined {
    if (!validacoes) return undefined;
    const chavesPermitidas = ['tamanho_maximo', 'casas_decimais', 'mascara'];
    const compactadas: Record<string, unknown> = {};

    for (const chave of chavesPermitidas) {
      if (validacoes[chave] !== undefined) {
        compactadas[chave] = validacoes[chave];
      }
    }

    return Object.keys(compactadas).length ? compactadas : undefined;
  }

  private montarPrompt({
    descricao,
    atributos,
    ncm,
    modalidade
  }: {
    descricao: string;
    atributos: AtributoCompacto[];
    ncm?: string;
    modalidade?: string;
  }) {
    const partes: string[] = [];

    if (ncm) partes.push(`NCM: ${ncm}`);
    if (modalidade) partes.push(`Modalidade: ${modalidade}`);
    partes.push(`Detalhamento do produto: ${descricao}`);
    partes.push(
      'Atributos esperados (JSON compacto): ' +
        JSON.stringify(atributos)
    );
    partes.push(
      'Responda apenas com JSON {"CODIGO_ATRIBUTO": valor}. Use códigos do domínio quando fornecidos. ' +
        'Para atributos multivalorados use array ordenado. Não invente atributos ou textos adicionais.'
    );

    const conteudo = partes.join('\n');

    return [
      {
        role: 'system',
        content:
          'Você extrai valores de atributos de produto a partir de uma descrição curta. ' +
          'Use somente o que estiver na descrição e nos domínios fornecidos. Responda de forma concisa.'
      },
      {
        role: 'user',
        content: conteudo
      }
    ];
  }
}

