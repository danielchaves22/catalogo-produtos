import request from 'supertest';
import express from 'express';
import { json } from 'body-parser';
import authRoutes from '../../routes/auth.routes';
import { legacyPrisma, catalogoPrisma } from '../../utils/prisma';
import { AuthService } from '../../services/auth.service';

const INVALID_CREDENTIALS_ERROR = 'Não foi possível fazer login com as credenciais informadas';
const ACCESS_DENIED_ERROR =
  'Não foi possível fazer login com as credenciais informadas, entre em contato pelo e-mail comercial@comexdez.com.br';

jest.mock('../../utils/prisma', () => {
  const user = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  };
  const subUsuario = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  };
  const usuarioCatalogo = {
    upsert: jest.fn(),
  };

  return {
    legacyPrisma: {
      user,
      subUsuario,
    },
    catalogoPrisma: {
      usuarioCatalogo,
    },
  };
});

describe('AuthController - flag administrativa do super usuário', () => {
  const mockedLegacyPrisma = legacyPrisma as unknown as {
    user: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
    subUsuario: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  const mockedCatalogoPrisma = catalogoPrisma as unknown as {
    usuarioCatalogo: {
      upsert: jest.Mock;
    };
  };

  const superUser = {
    id: 10,
    email: 'admin@example.com',
    name: 'Admin',
    password: 'hash-super',
    catprodLibera: '1',
    catprodAdmFull: '1',
  };

  let verifyPasswordSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    mockedLegacyPrisma.user.findFirst.mockResolvedValue(superUser);
    mockedLegacyPrisma.user.findUnique.mockResolvedValue(superUser);
    mockedLegacyPrisma.subUsuario.findFirst.mockResolvedValue(null);
    mockedLegacyPrisma.subUsuario.findUnique.mockResolvedValue(null);
    mockedCatalogoPrisma.usuarioCatalogo.upsert.mockResolvedValue(undefined);

    verifyPasswordSpy = jest
      .spyOn(AuthService.prototype, 'verifyPassword')
      .mockReturnValue(true);
  });

  afterEach(() => {
    verifyPasswordSpy.mockRestore();
  });

  it('propaga catprodAdmFull como true quando legado retorna "1"', async () => {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: superUser.email, password: 'qualquer' })
      .expect(200);

    expect(loginResponse.body.user).toMatchObject({
      id: superUser.id,
      email: superUser.email,
      role: 'ADMIN',
      catprodAdmFull: true,
    });

    const token = loginResponse.body.token;

    const meResponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(meResponse.body.catprodAdmFull).toBe(true);
    expect(meResponse.body.role).toBe('ADMIN');
    expect(mockedLegacyPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: superUser.id } });
  });

  it('nega login quando catprodLibera não está habilitado no legado', async () => {
    mockedLegacyPrisma.user.findFirst.mockResolvedValue({
      ...superUser,
      catprodLibera: '0',
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: superUser.email, password: 'qualquer' })
      .expect(401);

    expect(response.body).toEqual({ error: ACCESS_DENIED_ERROR });
    expect(verifyPasswordSpy).toHaveBeenCalledWith('qualquer', superUser.password);
  });

  it('retorna erro de credenciais quando senha está incorreta mesmo sem catprodLibera', async () => {
    mockedLegacyPrisma.user.findFirst.mockResolvedValue({
      ...superUser,
      catprodLibera: '0',
    });
    verifyPasswordSpy.mockReturnValue(false);

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: superUser.email, password: 'senha-incorreta' })
      .expect(401);

    expect(response.body).toEqual({ error: INVALID_CREDENTIALS_ERROR });
    expect(verifyPasswordSpy).toHaveBeenCalledWith('senha-incorreta', superUser.password);
  });
});

const app = express();
app.use(json());
app.use('/api/auth', authRoutes);

describe('AuthController - fluxo para subusuário com mesmo ID de super', () => {
  const mockedLegacyPrisma = legacyPrisma as unknown as {
    user: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
    subUsuario: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  const mockedCatalogoPrisma = catalogoPrisma as unknown as {
    usuarioCatalogo: {
      upsert: jest.Mock;
    };
  };

  const subUsuario = {
    id: 1,
    email: 'sub@example.com',
    password: 'hashed',
    superUserId: 999,
    catprodAdmFull: false,
  };

  let verifyPasswordSpy: jest.SpyInstance;
  let registerUserLoginSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    mockedLegacyPrisma.user.findFirst.mockResolvedValue(null);
    mockedLegacyPrisma.user.findUnique.mockImplementation(() => {
      throw new Error('Consulta ao super usuário não deveria acontecer');
    });

    mockedLegacyPrisma.subUsuario.findFirst.mockResolvedValue(subUsuario);
    mockedLegacyPrisma.subUsuario.findUnique.mockResolvedValue(subUsuario);

    mockedCatalogoPrisma.usuarioCatalogo.upsert.mockResolvedValue(undefined);

    verifyPasswordSpy = jest
      .spyOn(AuthService.prototype, 'verifyPassword')
      .mockReturnValue(true);
    registerUserLoginSpy = jest
      .spyOn(AuthService.prototype, 'registerUserLogin')
      .mockResolvedValue();
  });

  afterEach(() => {
    verifyPasswordSpy.mockRestore();
    registerUserLoginSpy.mockRestore();
  });

  it('realiza login e retorna dados do subusuário no /api/auth/me', async () => {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: subUsuario.email, password: 'qualquer' })
      .expect(200);

    expect(loginResponse.body.user).toMatchObject({
      id: subUsuario.id,
      email: subUsuario.email,
      role: 'SUB',
      catprodAdmFull: false,
    });

    const token = loginResponse.body.token;

    const meResponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(meResponse.body).toEqual({
      id: subUsuario.id,
      name: subUsuario.email,
      email: subUsuario.email,
      superUserId: subUsuario.superUserId,
      role: 'SUB',
      catprodAdmFull: false,
    });

    expect(mockedLegacyPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockedLegacyPrisma.subUsuario.findUnique).toHaveBeenCalledWith({ where: { id: subUsuario.id } });
    expect(verifyPasswordSpy).toHaveBeenCalledWith('qualquer', subUsuario.password);
    expect(registerUserLoginSpy).toHaveBeenCalled();
  });
});
