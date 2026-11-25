const { createAuditService } = require('../../src/services/auditService');
const { mockRepo, fixedClock } = require('./helpers');

test('PU-18b el servicio de auditoría guarda actor, acción y marca temporal', async () => {
  const auditRepo = mockRepo();
  const audit = createAuditService({ auditRepo, clock: fixedClock });

  const event = await audit.record({ username: 'admin' }, 'CREAR_CITA', 'cita', 5);

  expect(event).toMatchObject({
    actor: 'admin', action: 'CREAR_CITA', entity: 'cita', entityId: 5, at: '2026-11-02T12:00:00.000Z',
  });
});
