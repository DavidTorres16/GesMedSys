const { createAppointmentService, STATUS } = require('../../src/services/appointmentService');
const { ConflictError, UnprocessableError, NotFoundError } = require('../../src/domain/errors');
const { mockRepo, fixedClock, actor } = require('./helpers');

const availability = [{ id: 1, doctorId: 1, start: '2026-11-03T13:00:00Z', end: '2026-11-03T17:00:00Z' }];

function build(appointments = []) {
  const deps = {
    appointmentRepo: mockRepo(appointments),
    patientRepo: mockRepo([{ id: 1 }, { id: 2 }]),
    doctorRepo: mockRepo([{ id: 1 }, { id: 2 }]),
    availabilityRepo: mockRepo(availability),
    audit: { record: jest.fn() },
    clock: fixedClock,
  };
  return { deps, service: createAppointmentService(deps) };
}

const existing = {
  id: 10, patientId: 1, doctorId: 1, status: STATUS.PROGRAMADA, history: [],
  start: '2026-11-03T14:00:00Z', end: '2026-11-03T14:30:00Z',
};

describe('RF-03 Programar citas sin cruces', () => {
  test('PU-07 crea la cita y registra creador y fecha', async () => {
    const { deps, service } = build();

    const cita = await service.schedule(
      { patientId: 1, doctorId: 1, start: '2026-11-03T13:00:00Z', end: '2026-11-03T13:30:00Z' }, actor,
    );

    expect(cita).toMatchObject({ status: STATUS.PROGRAMADA, createdBy: 'recepcion', createdAt: '2026-11-02T12:00:00.000Z' });
    expect(deps.appointmentRepo.save).toHaveBeenCalledTimes(1);
  });

  test('PU-08 rechaza una cita que se solapa y no realiza segunda escritura', async () => {
    const { deps, service } = build([existing]);

    await expect(service.schedule(
      { patientId: 2, doctorId: 1, start: '2026-11-03T14:15:00Z', end: '2026-11-03T14:45:00Z' }, actor,
    )).rejects.toBeInstanceOf(ConflictError);
    expect(deps.appointmentRepo.save).not.toHaveBeenCalled();
  });

  test('PU-09 acepta citas contiguas [inicio, fin) y rechaza solapes en bordes', async () => {
    const { service } = build([existing]);

    await expect(service.schedule(
      { patientId: 2, doctorId: 1, start: '2026-11-03T14:30:00Z', end: '2026-11-03T15:00:00Z' }, actor,
    )).resolves.toMatchObject({ status: STATUS.PROGRAMADA });

    await expect(service.schedule(
      { patientId: 2, doctorId: 1, start: '2026-11-03T13:31:00Z', end: '2026-11-03T14:01:00Z' }, actor,
    )).rejects.toBeInstanceOf(ConflictError);
  });

  test('PU-09b una cita cancelada no bloquea el horario', async () => {
    const { service } = build([{ ...existing, status: STATUS.CANCELADA }]);
    await expect(service.schedule(
      { patientId: 2, doctorId: 1, start: existing.start, end: existing.end }, actor,
    )).resolves.toBeDefined();
  });

  test('PU-10 rechaza horario fuera de la disponibilidad del médico', async () => {
    const { deps, service } = build();

    await expect(service.schedule(
      { patientId: 1, doctorId: 1, start: '2026-11-03T16:45:00Z', end: '2026-11-03T17:15:00Z' }, actor,
    )).rejects.toBeInstanceOf(UnprocessableError);
    expect(deps.appointmentRepo.save).not.toHaveBeenCalled();
  });

  test('PU-10b paciente inexistente lanza NotFound', async () => {
    const { service } = build();
    await expect(service.schedule(
      { patientId: 50, doctorId: 1, start: '2026-11-03T13:00:00Z', end: '2026-11-03T13:30:00Z' }, actor,
    )).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('RF-04 Cancelar y reprogramar', () => {
  test('PU-11 cancela la cita y registra responsable y fecha', async () => {
    const { service } = build([existing]);

    const cita = await service.cancel(10, actor, 'Paciente no puede asistir');

    expect(cita).toMatchObject({
      status: STATUS.CANCELADA, cancelledBy: 'recepcion', cancelledAt: '2026-11-02T12:00:00.000Z',
    });
  });

  test('PU-11b no permite cancelar una cita ya cancelada', async () => {
    const { service } = build([{ ...existing, status: STATUS.CANCELADA }]);
    await expect(service.cancel(10, actor)).rejects.toBeInstanceOf(ConflictError);
  });

  test('PU-12 reprograma a un bloque libre y conserva trazabilidad', async () => {
    const { service } = build([existing]);

    const cita = await service.reschedule(10, { start: '2026-11-03T15:00:00Z', end: '2026-11-03T15:30:00Z' }, actor);

    expect(cita.status).toBe(STATUS.REPROGRAMADA);
    expect(cita.start).toBe('2026-11-03T15:00:00Z');
    expect(cita.history).toEqual([expect.objectContaining({
      from: { start: existing.start, end: existing.end }, by: 'recepcion',
    })]);
  });

  test('PU-12b reprogramar dentro de su propio horario no choca consigo misma', async () => {
    const { service } = build([existing]);
    await expect(service.reschedule(10, { start: '2026-11-03T14:15:00Z', end: '2026-11-03T14:45:00Z' }, actor))
      .resolves.toMatchObject({ status: STATUS.REPROGRAMADA });
  });

  test('PU-13 rechaza reprogramación con conflicto y mantiene el horario original', async () => {
    const other = { ...existing, id: 11, patientId: 2, start: '2026-11-03T15:00:00Z', end: '2026-11-03T15:30:00Z' };
    const { deps, service } = build([existing, other]);

    await expect(service.reschedule(10, { start: other.start, end: other.end }, actor))
      .rejects.toBeInstanceOf(ConflictError);
    expect(deps.appointmentRepo.save).not.toHaveBeenCalled();
  });
});

describe('RF-05 Historial', () => {
  const citas = [
    { ...existing, id: 1, patientId: 1, doctorId: 1, start: '2026-11-03T15:00:00Z' },
    { ...existing, id: 2, patientId: 2, doctorId: 1, start: '2026-11-03T13:00:00Z' },
    { ...existing, id: 3, patientId: 1, doctorId: 2, start: '2026-11-03T13:30:00Z' },
  ];

  test('PU-14 retorna únicamente las citas del paciente, ordenadas por fecha', async () => {
    const { service } = build(citas);
    const result = await service.historyByPatient('1');
    expect(result.map((c) => c.id)).toEqual([3, 1]);
  });

  test('PU-15 retorna únicamente las citas del médico consultado', async () => {
    const { service } = build(citas);
    const result = await service.historyByDoctor(1);
    expect(result.map((c) => c.id)).toEqual([2, 1]);
  });
});

describe('Auditoría', () => {
  test('PU-18 registra actor, acción y marca temporal en crear, cancelar y reprogramar', async () => {
    const { deps, service } = build([existing]);

    await service.schedule({ patientId: 2, doctorId: 1, start: '2026-11-03T13:00:00Z', end: '2026-11-03T13:30:00Z' }, actor);
    await service.reschedule(10, { start: '2026-11-03T16:00:00Z', end: '2026-11-03T16:30:00Z' }, actor);
    await service.cancel(10, actor);

    const actions = deps.audit.record.mock.calls.map(([who, action]) => [who.username, action]);
    expect(actions).toEqual([
      ['recepcion', 'CREAR_CITA'],
      ['recepcion', 'REPROGRAMAR_CITA'],
      ['recepcion', 'CANCELAR_CITA'],
    ]);
  });
});
