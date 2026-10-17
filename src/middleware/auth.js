const { UnauthorizedError } = require('../domain/errors');

// Extrae y verifica el JWT del encabezado Authorization: Bearer <token>.
function authenticate(authService) {
  return (req, _res, next) => {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    try {
      if (scheme !== 'Bearer' || !token) throw new UnauthorizedError();
      req.user = authService.verify(token);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function requirePermission(authService, action) {
  return (req, _res, next) => {
    try {
      authService.authorize(req.user, action);
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { authenticate, requirePermission };
