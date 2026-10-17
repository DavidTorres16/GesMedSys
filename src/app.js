const express = require('express');
const { createRepositories } = require('./repositories/memoryRepository');
const { createAuditService } = require('./services/auditService');
const { createAuthService } = require('./services/authService');
const { createPatientService } = require('./services/patientService');
const { createDoctorService } = require('./services/doctorService');
const { createAppointmentService } = require('./services/appointmentService');
const { createReportService } = require('./services/reportService');
const { createApiRouter } = require('./routes/api');
const { AppError } = require('./domain/errors');
const pkg = require('../package.json');

function createServices({ repos = createRepositories(), jwtSecret, clock } = {}) {
  const audit = createAuditService({ auditRepo: repos.audit, clock });
  return {
    repos,
    audit,
    auth: createAuthService({ userRepo: repos.users, audit, secret: jwtSecret }),
    patients: createPatientService({ patientRepo: repos.patients }),
    doctors: createDoctorService({ doctorRepo: repos.doctors, availabilityRepo: repos.availability }),
    appointments: createAppointmentService({
      appointmentRepo: repos.appointments,
      patientRepo: repos.patients,
      doctorRepo: repos.doctors,
      availabilityRepo: repos.availability,
      audit,
      clock,
    }),
    reports: createReportService({
      availabilityRepo: repos.availability,
      appointmentRepo: repos.appointments,
    }),
  };
}

function createApp(services) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: process.env.APP_VERSION ?? pkg.version });
  });

  app.use('/api', createApiRouter(services));

  app.use((_req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON inválido' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error interno' });
  });

  return app;
}

module.exports = { createApp, createServices };
