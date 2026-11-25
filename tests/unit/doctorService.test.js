const { createDoctorService } = require('../../src/services/doctorService');
const { ValidationError } = require('../../src/domain/errors');
const { mockRepo } = require('./helpers');

describe('RF-02 Médicos y disponibilidad', () => {
  test('PU-04 registra médico con datos consistentes', async () => {
    const doctorRepo = mockRepo();
    const service = createDoctorService({ doctorRepo, availabilityRepo: mockRepo() });

    const doctor = await service.create({ nombre: ' Dr. Gómez ', especialidad: 'Medicina general' });

    expect(doctor).toEqual({ id: 99, nombre: 'Dr. Gómez', especialidad: 'Medicina general' });
    expect(doctorRepo.save).toHaveBeenCalledTimes(1);
  });

  test('PU-05 registra disponibilidad con intervalo válido', async () => {
    const availabilityRepo = mockRepo();
    const service = createDoctorService({ doctorRepo: mockRepo([{ id: 1 }]), availabilityRepo });

    const slot = await service.addAvailability(1, { start: '2026-11-03T13:00:00Z', end: '2026-11-03T17:00:00Z' });

    expect(slot).toMatchObject({ doctorId: 1, start: '2026-11-03T13:00:00Z' });
    expect(availabilityRepo.save).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['invertido', { start: '2026-11-03T17:00:00Z', end: '2026-11-03T13:00:00Z' }],
    ['inicio igual a fin', { start: '2026-11-03T13:00:00Z', end: '2026-11-03T13:00:00Z' }],
    ['fecha inválida', { start: 'mañana', end: '2026-11-03T13:00:00Z' }],
  ])('PU-06 rechaza disponibilidad con intervalo %s y no persiste', async (_c, range) => {
    const availabilityRepo = mockRepo();
    const service = createDoctorService({ doctorRepo: mockRepo([{ id: 1 }]), availabilityRepo });

    await expect(service.addAvailability(1, range)).rejects.toBeInstanceOf(ValidationError);
    expect(availabilityRepo.save).not.toHaveBeenCalled();
  });
});
