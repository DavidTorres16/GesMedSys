const express = require('express');
const { authenticate, requirePermission } = require('../middleware/auth');

// Envuelve un handler async para propagar errores al middleware de errores.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

function createApiRouter(services) {
  const { auth, patients, doctors, appointments, reports, audit } = services;
  const router = express.Router();
  const can = (action) => requirePermission(auth, action);

  router.post('/auth/login', wrap(async (req, res) => {
    res.json(await auth.login(req.body.username, req.body.password));
  }));

  router.use(authenticate(auth));

  // RF-01 Pacientes
  router.get('/pacientes', can('patient:read'), wrap(async (_req, res) => {
    res.json(await patients.list());
  }));
  router.post('/pacientes', can('patient:write'), wrap(async (req, res) => {
    res.status(201).json(await patients.create(req.body));
  }));
  router.get('/pacientes/:id', can('patient:read'), wrap(async (req, res) => {
    res.json(await patients.get(req.params.id));
  }));
  router.put('/pacientes/:id', can('patient:write'), wrap(async (req, res) => {
    res.json(await patients.update(req.params.id, req.body));
  }));

  // RF-02 Médicos y disponibilidad
  router.get('/medicos', can('doctor:read'), wrap(async (_req, res) => {
    res.json(await doctors.list());
  }));
  router.post('/medicos', can('doctor:write'), wrap(async (req, res) => {
    res.status(201).json(await doctors.create(req.body));
  }));
  router.get('/medicos/:id/disponibilidad', can('doctor:read'), wrap(async (req, res) => {
    res.json(await doctors.listAvailability(req.params.id));
  }));
  router.post('/medicos/:id/disponibilidad', can('availability:write'), wrap(async (req, res) => {
    res.status(201).json(await doctors.addAvailability(req.params.id, req.body));
  }));

  // RF-03 / RF-04 Citas
  router.post('/citas', can('appointment:write'), wrap(async (req, res) => {
    res.status(201).json(await appointments.schedule(req.body, req.user));
  }));
  router.post('/citas/:id/cancelar', can('appointment:write'), wrap(async (req, res) => {
    res.json(await appointments.cancel(req.params.id, req.user, req.body.motivo));
  }));
  router.post('/citas/:id/reprogramar', can('appointment:write'), wrap(async (req, res) => {
    res.json(await appointments.reschedule(req.params.id, req.body, req.user));
  }));

  // RF-05 Historial
  router.get('/pacientes/:id/citas', can('appointment:read'), wrap(async (req, res) => {
    res.json(await appointments.historyByPatient(req.params.id));
  }));
  router.get('/medicos/:id/citas', can('appointment:read'), wrap(async (req, res) => {
    res.json(await appointments.historyByDoctor(req.params.id));
  }));

  // RF-06 Reportes y auditoría
  router.get('/reportes/ocupacion', can('report:read'), wrap(async (req, res) => {
    res.json(await reports.occupancy(req.query));
  }));
  router.get('/auditoria', can('audit:read'), wrap(async (_req, res) => {
    res.json(await audit.list());
  }));

  return router;
}

module.exports = { createApiRouter };
