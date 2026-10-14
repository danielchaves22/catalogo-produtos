import axios, { AxiosInstance } from 'axios';
import { IaSugestaoAtributosService } from '../ia-sugestao-atributos.service';
import { logger } from '../../utils/logger';

jest.mock('axios');
jest.mock('../../utils/logger', () => ({ logger: { warn: jest.fn() } }));

const mockedAxios = jest.mocked(axios);
const postMock = jest.fn();
const requisicao = {
  descricao: 'Camiseta de algodão azul',
  atributos: [{
    codigo: 'ATT_MATERIAL',
    nome: 'Material',
    tipo: 'TEXTO',
    obrigatorio: false,
    multivalorado: false,
    validacoes: {}
  }]
};

describe('IaSugestaoAtributosService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.replaceProperty(process, 'env', {
      ...process.env,
      OPENAI_API_KEY: 'chave-de-teste',
      OPENAI_MODEL: 'gpt-6-luna'
    });
    mockedAxios.create.mockReturnValue({ post: postMock } as unknown as AxiosInstance);
    postMock.mockResolvedValue({
      data: {
        model: 'gpt-6-luna',
        choices: [{
          message: { content: '{"ATT_MATERIAL":"algodão"}' },
          finish_reason: 'stop'
        }],
        usage: { total_tokens: 120, prompt_tokens: 100, completion_tokens: 20 }
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [undefined, 800],
    [300, 300]
  ])('usa o contrato do Luna com limite solicitado %s', async (maxTokensResposta, limiteEsperado) => {
    const resultado = await new IaSugestaoAtributosService().sugerirValores({
      ...requisicao,
      maxTokensResposta
    });

    expect(postMock).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
      model: 'gpt-6-luna',
      reasoning_effort: 'none',
      temperature: 0.2,
      max_completion_tokens: limiteEsperado,
      response_format: { type: 'json_object' }
    }));
    expect(postMock.mock.calls[0][1]).not.toHaveProperty('max_tokens');
    expect(resultado).toEqual({
      sugestoes: { ATT_MATERIAL: 'algodão' },
      modelo: 'gpt-6-luna',
      tokens: { total: 120, prompt: 100, resposta: 20 }
    });
  });

  it.each(['gpt-4o-mini', undefined])('preserva o contrato anterior com OPENAI_MODEL=%s', async modelo => {
    if (modelo) process.env.OPENAI_MODEL = modelo;
    else delete process.env.OPENAI_MODEL;

    await new IaSugestaoAtributosService().sugerirValores({ ...requisicao, maxTokensResposta: 400 });

    expect(postMock).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: 'json_object' }
    }));
    expect(postMock.mock.calls[0][1]).not.toHaveProperty('reasoning_effort');
    expect(postMock.mock.calls[0][1]).not.toHaveProperty('max_completion_tokens');
  });

  it('rejeita resposta truncada do Luna e registra o limite efetivamente enviado', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        choices: [{ message: { content: '{}' }, finish_reason: 'length' }]
      }
    });

    await expect(new IaSugestaoAtributosService().sugerirValores({
      ...requisicao,
      maxTokensResposta: 300
    })).rejects.toThrow('A resposta da IA foi truncada pelo limite de tokens configurado');
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      payload: { maxTokensUtilizado: 300, modelo: 'gpt-6-luna' }
    }));
  });
});
