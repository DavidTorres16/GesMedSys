const { createAuthService } = require('../../src/services/authService');
const { ForbiddenError, UnauthorizedError } = require('../../src/domain/errors');
const { MemoryRepository } = require('../../src/repositories/memoryRepository');

function build() {
  const audit = { record: jest.fn() };
  const userRepo = new MemoryRepository();
  return { audit, userRepo, auth: createAuthService({ userRepo, audit, secret: 'test-secret' }) };
}

describe('Seguridad y roles', () => {
  test.each([
    ['ADMIN', 'report:read', true],
    ['RECEPCIONISTA', 'appointment:write', true],
    ['MEDICO', 'appointment:read', true],
    ['MEDICO', 'appointment:write', false],
    ['RECEPCIONISTA', 'doctor:write', false],
    ['RECEPCIONISTA', 'report:read', false],
  ])('PU-17 rol %s sobre %s -> permitido=%s', (role, action, allowed) => {
    const { auth } = build();
    const check = () => auth.authorize({ username: 'u', role }, action);
    if (allowed) expect(check()).toBe(true);
    else expect(check).toThrow(ForbiddenError);
  });

  test('PU-17b sin usuario autenticado lanza Unauthorized', () => {
    const { auth } = build();
    expect(() => auth.authorize(undefined, 'patient:read')).toThrow(UnauthorizedError);
  });

  test('guarda la contraseña como hash, emite JWT y audita el inicio de sesión', async () => {
    const { auth, userRepo, audit } = build();
    await auth.register({ username: 'admin', password: 'Secreta123', role: 'ADMIN' });

    const [stored] = await userRepo.findAll();
    expect(stored.passwordHash).not.toBe('Secreta123');

    const { token } = await auth.login('admin', 'Secreta123');
    expect(auth.verify(token)).toMatchObject({ username: 'admin', role: 'ADMIN' });
    expect(audit.record).toHaveBeenCalledWith({ username: 'admin' }, 'LOGIN_OK', 'usuario', stored.id);
  });

  test('rechaza credenciales inválidas y registra el intento fallido', async () => {
    const { auth, audit } = build();
    await auth.register({ username: 'admin', password: 'Secreta123', role: 'ADMIN' });

    await expect(auth.login('admin', 'otra-clave')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(audit.record).toHaveBeenCalledWith({ username: 'admin' }, 'LOGIN_FALLIDO', 'usuario', 1);
  });

  test('rechaza un token manipulado', () => {
    const { auth } = build();
    expect(() => auth.verify('abc.def.ghi')).toThrow(UnauthorizedError);
  });
});
