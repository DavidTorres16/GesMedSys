const request = require('supertest');
const { createApp, createServices } = require('../../src/app');
const { seed } = require('../../src/seed');

const PASSWORD = 'ClaveDePrueba1';
let app;
let tokens;

async function login(username) {
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  return res.body.token;
}

const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });

beforeEach(async () => {
  const services = createServices({ jwtSecret: 'integration-secret' });
  await seed(services, { adminPassword: PASSWORD });
  app = createApp(services);
  tokens = { admin: await login('admin'), recepcion: await login('recepcion'), medico: await login('medico') };
});

async function seedAgenda() {
  const paciente = await request(app).post('/api/pacientes').set(as('recepcion'))
    .send({ documento: '100', nombres: 'Luis', apellidos: 'Ríos', telefono: '3000000000' });
  const medico = await request(app).post('/api/medicos').set(as('admin'))
    .send({ nombre: 'Dra. Mora', especialidad: 'Pediatría' });
  await request(app).post(`/api/medicos/${medico.body.id}/disponibilidad`).set(as('admin'))
    .send({ start: '2026-11-03T13:00:00Z', end: '2026-11-03T17:00:00Z' });
  return { pacienteId: paciente.body.id, medicoId: medico.body.id };
}

describe('API REST - pruebas de caja negra', () => {
  test('health check responde 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('CN-01 / CN-02 crear paciente válido (201) y sin campo obligatorio (400)', async () => {
    const ok = await request(app).post('/api/pacientes').set(as('recepcion'))
      .send({ documento: '1', nombres: 'A', apellidos: 'B', telefono: '1' });
    expect(ok.status).toBe(201);

    const bad = await request(app).post('/api/pacientes').set(as('recepcion')).send({ nombres: 'A' });
    expect(bad.status).toBe(400);
    const list = await request(app).get('/api/pacientes').set(as('recepcion'));
    expect(list.body).toHaveLength(1);
  });

  test('CN-03 / CN-04 actualizar paciente existente (200) e inexistente (404)', async () => {
    const { pacienteId } = await seedAgenda();
    const upd = await request(app).put(`/api/pacientes/${pacienteId}`).set(as('recepcion')).send({ telefono: '311' });
    expect(upd.status).toBe(200);
    const get = await request(app).get(`/api/pacientes/${pacienteId}`).set(as('recepcion'));
    expect(get.body.telefono).toBe('311');

    const missing = await request(app).put('/api/pacientes/999').set(as('recepcion')).send({ telefono: '1' });
    expect(missing.status).toBe(404);
  });

  test('CN-05 / CN-06 / CN-07 médico y disponibilidad', async () => {
    const { medicoId } = await seedAgenda();
    const slots = await request(app).get(`/api/medicos/${medicoId}/disponibilidad`).set(as('recepcion'));
    expect(slots.body).toHaveLength(1);

    const bad = await request(app).post(`/api/medicos/${medicoId}/disponibilidad`).set(as('admin'))
      .send({ start: '2026-11-04T17:00:00Z', end: '2026-11-04T13:00:00Z' });
    expect(bad.status).toBe(400);
  });

  test('CN-08 a CN-12 programación de citas', async () => {
    const { pacienteId, medicoId } = await seedAgenda();
    const cita = { patientId: pacienteId, doctorId: medicoId, start: '2026-11-03T13:00:00Z', end: '2026-11-03T13:30:00Z' };

    expect((await request(app).post('/api/citas').set(as('recepcion')).send(cita)).status).toBe(201); // CN-08
    expect((await request(app).post('/api/citas').set(as('recepcion')).send(cita)).status).toBe(409); // CN-09
    expect((await request(app).post('/api/citas').set(as('recepcion'))
      .send({ ...cita, start: '2026-11-03T18:00:00Z', end: '2026-11-03T18:30:00Z' })).status).toBe(422); // CN-10
    expect((await request(app).post('/api/citas').set(as('recepcion'))
      .send({ ...cita, start: '2026-11-03T13:30:00Z', end: '2026-11-03T14:00:00Z' })).status).toBe(201); // CN-11
    expect((await request(app).post('/api/citas').set(as('recepcion'))
      .send({ ...cita, patientId: 999 })).status).toBe(404); // CN-12

    const historial = await request(app).get(`/api/medicos/${medicoId}/citas`).set(as('medico'));
    expect(historial.body).toHaveLength(2);
  });

  test('CN-13 a CN-15 cancelar y reprogramar; CN-21 auditoría', async () => {
    const { pacienteId, medicoId } = await seedAgenda();
    const base = { patientId: pacienteId, doctorId: medicoId };
    const a = await request(app).post('/api/citas').set(as('recepcion'))
      .send({ ...base, start: '2026-11-03T13:00:00Z', end: '2026-11-03T13:30:00Z' });
    const b = await request(app).post('/api/citas').set(as('recepcion'))
      .send({ ...base, start: '2026-11-03T14:00:00Z', end: '2026-11-03T14:30:00Z' });

    const ocupado = await request(app).post(`/api/citas/${a.body.id}/reprogramar`).set(as('recepcion'))
      .send({ start: '2026-11-03T14:00:00Z', end: '2026-11-03T14:30:00Z' });
    expect(ocupado.status).toBe(409); // CN-15

    const repro = await request(app).post(`/api/citas/${a.body.id}/reprogramar`).set(as('recepcion'))
      .send({ start: '2026-11-03T15:00:00Z', end: '2026-11-03T15:30:00Z' });
    expect(repro.status).toBe(200); // CN-14
    expect(repro.body.history).toHaveLength(1);

    const cancel = await request(app).post(`/api/citas/${b.body.id}/cancelar`).set(as('recepcion')).send({ motivo: 'x' });
    expect(cancel.status).toBe(200); // CN-13
    expect(cancel.body.status).toBe('CANCELADA');

    const audit = await request(app).get('/api/auditoria').set(as('admin'));
    const acciones = audit.body.map((e) => e.action);
    expect(acciones).toEqual(expect.arrayContaining(['CREAR_CITA', 'REPROGRAMAR_CITA', 'CANCELAR_CITA', 'LOGIN_OK']));
  });

  test('CN-16 / CN-18 historial por paciente y reporte de ocupación', async () => {
    const { pacienteId, medicoId } = await seedAgenda();
    await request(app).post('/api/citas').set(as('recepcion'))
      .send({ patientId: pacienteId, doctorId: medicoId, start: '2026-11-03T13:00:00Z', end: '2026-11-03T14:00:00Z' });

    const historial = await request(app).get(`/api/pacientes/${pacienteId}/citas`).set(as('medico'));
    expect(historial.body).toHaveLength(1);

    const reporte = await request(app).get('/api/reportes/ocupacion').set(as('admin'))
      .query({ from: '2026-11-03T00:00:00Z', to: '2026-11-04T00:00:00Z' });
    expect(reporte.status).toBe(200);
    expect(reporte.body).toMatchObject({ availableMinutes: 240, occupiedMinutes: 60, percentage: 25 });
  });

  test('CN-19 sin JWT válido responde 401', async () => {
    expect((await request(app).get('/api/pacientes')).status).toBe(401);
    expect((await request(app).get('/api/pacientes').set('Authorization', 'Bearer x.y.z')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ username: 'admin', password: 'mala' })).status).toBe(401);
  });

  test('CN-20 acción sin permiso de rol responde 403 y no modifica datos', async () => {
    const res = await request(app).post('/api/medicos').set(as('recepcion')).send({ nombre: 'X', especialidad: 'Y' });
    expect(res.status).toBe(403);
    const medicos = await request(app).get('/api/medicos').set(as('admin'));
    expect(medicos.body).toHaveLength(0);
  });

  test('CN-22 registrar y consultar citas responde en menos de 3 s', async () => {
    const { pacienteId, medicoId } = await seedAgenda();
    const t0 = Date.now();
    await request(app).post('/api/citas').set(as('recepcion'))
      .send({ patientId: pacienteId, doctorId: medicoId, start: '2026-11-03T16:00:00Z', end: '2026-11-03T16:30:00Z' });
    await request(app).get(`/api/medicos/${medicoId}/citas`).set(as('medico'));
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  test('JSON malformado responde 400 y ruta desconocida 404', async () => {
    const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{');
    expect(bad.status).toBe(400);
    expect((await request(app).get('/nada')).status).toBe(404);
  });
});
