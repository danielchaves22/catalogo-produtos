import { serializarMetadadosLog } from '../logger';

describe('logger metadata serialization', () => {
  it('serializa metadados circulares sem lancar erro', () => {
    const circular: Record<string, unknown> = { id: 1 };
    circular.self = circular;

    const resultado = serializarMetadadosLog({ circular });

    expect(resultado).toContain('"id":1');
    expect(resultado).toContain('[Circular]');
  });

  it('normaliza erros HTTP/Axios sem serializar estruturas internas circulares', () => {
    class ClientRequest {}
    class IncomingMessage {}

    const request = new ClientRequest() as ClientRequest & { res?: unknown };
    const response = new IncomingMessage() as IncomingMessage & {
      data?: unknown;
      req?: unknown;
      status?: number;
      statusText?: string;
    };

    request.res = response;
    response.req = request;
    response.status = 502;
    response.statusText = 'Bad Gateway';
    response.data = { mensagem: 'SISCOMEX indisponivel' };

    const error = Object.assign(new Error('Erro de conexao com SISCOMEX'), {
      code: 'ECONNRESET',
      config: {
        headers: {
          Authorization: 'Bearer segredo',
          'X-CSRF-Token': 'csrf-segredo',
        },
        method: 'get',
        timeout: 15000,
        url: '/ext/produto',
      },
      request,
      response,
    });

    const resultado = serializarMetadadosLog({ erro: error });

    expect(resultado).toContain('Erro de conexao com SISCOMEX');
    expect(resultado).toContain('ECONNRESET');
    expect(resultado).toContain('/ext/produto');
    expect(resultado).toContain('502');
    expect(resultado).toContain('[REDACTED]');
    expect(resultado).not.toContain('Bearer segredo');
    expect(resultado).not.toContain('csrf-segredo');
  });
});
