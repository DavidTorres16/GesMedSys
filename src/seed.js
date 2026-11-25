const { ROLES } = require('./domain/roles');

// Datos ficticios de demostración (el plan de pruebas exige no usar datos reales).
async function seed(services, { adminPassword }) {
  await services.auth.register({ username: 'admin', password: adminPassword, role: ROLES.ADMIN });
  await services.auth.register({ username: 'recepcion', password: adminPassword, role: ROLES.RECEPCIONISTA });
  await services.auth.register({ username: 'medico', password: adminPassword, role: ROLES.MEDICO });
}

module.exports = { seed };
