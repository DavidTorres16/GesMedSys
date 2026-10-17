const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  RECEPCIONISTA: 'RECEPCIONISTA',
  MEDICO: 'MEDICO',
});

// Matriz de permisos: acción -> roles autorizados.
const PERMISSIONS = Object.freeze({
  'patient:write': [ROLES.ADMIN, ROLES.RECEPCIONISTA],
  'patient:read': [ROLES.ADMIN, ROLES.RECEPCIONISTA, ROLES.MEDICO],
  'doctor:write': [ROLES.ADMIN],
  'doctor:read': [ROLES.ADMIN, ROLES.RECEPCIONISTA, ROLES.MEDICO],
  'availability:write': [ROLES.ADMIN, ROLES.MEDICO],
  'appointment:write': [ROLES.ADMIN, ROLES.RECEPCIONISTA],
  'appointment:read': [ROLES.ADMIN, ROLES.RECEPCIONISTA, ROLES.MEDICO],
  'report:read': [ROLES.ADMIN],
  'audit:read': [ROLES.ADMIN],
});

function isAllowed(role, action) {
  const allowed = PERMISSIONS[action];
  return Array.isArray(allowed) && allowed.includes(role);
}

module.exports = { ROLES, PERMISSIONS, isAllowed };
