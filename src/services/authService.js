const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ValidationError, UnauthorizedError, ForbiddenError } = require('../domain/errors');
const { ROLES, isAllowed } = require('../domain/roles');

function createAuthService({ userRepo, audit, secret, expiresIn = '8h' }) {
  if (!secret) throw new Error('JWT_SECRET es obligatorio');

  async function register({ username, password, role } = {}) {
    if (!username || !password || password.length < 8) {
      throw new ValidationError('Usuario y contraseña (mínimo 8 caracteres) son obligatorios');
    }
    if (!Object.values(ROLES).includes(role)) {
      throw new ValidationError('Rol inválido');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userRepo.save({ username, passwordHash, role });
    return { id: user.id, username: user.username, role: user.role };
  }

  async function login(username, password) {
    const [user] = await userRepo.findAll((u) => u.username === username);
    const ok = user ? await bcrypt.compare(password ?? '', user.passwordHash) : false;
    await audit.record({ username: username ?? 'desconocido' }, ok ? 'LOGIN_OK' : 'LOGIN_FALLIDO', 'usuario', user?.id ?? null);
    if (!ok) throw new UnauthorizedError('Credenciales inválidas');
    const token = jwt.sign({ sub: user.id, username: user.username, role: user.role }, secret, { expiresIn });
    return { token, role: user.role };
  }

  function verify(token) {
    try {
      const payload = jwt.verify(token, secret);
      return { id: payload.sub, username: payload.username, role: payload.role };
    } catch {
      throw new UnauthorizedError('Token inválido o expirado');
    }
  }

  function authorize(user, action) {
    if (!user) throw new UnauthorizedError();
    if (!isAllowed(user.role, action)) throw new ForbiddenError();
    return true;
  }

  return { register, login, verify, authorize };
}

module.exports = { createAuthService };
