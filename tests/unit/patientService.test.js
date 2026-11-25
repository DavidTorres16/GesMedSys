const { createPatientService } = require('../../src/services/patientService');
const { ValidationError, NotFoundError } = require('../../src/domain/errors');
const { mockRepo } = require('./helpers');

const valid = { documento: '1094000001', nombres: 'Ana', apellidos: 'Pérez', telefono: '3001234567', email: 'ana@example.com' };

describe('RF-01 Gestión de pacientes', () => {
  test('PU-01 registra un paciente válido e invoca la persistencia una vez', async () => {
    const repo = mockRepo();
    const service = createPatientService({ patientRepo: repo });

    const result = await service.create(valid);

    expect(result).toMatchObject({ ...valid, id: 99 });
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['documento faltante', { ...valid, documento: undefined }],
    ['nombres vacío', { ...valid, nombres: '  ' }],
    ['email inválido', { ...valid, email: 'no-es-email' }],
  ])('PU-02 rechaza datos inválidos (%s) y no guarda', async (_c, data) => {
    const repo = mockRepo();
    const service = createPatientService({ patientRepo: repo });

    await expect(service.create(data)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  test('PU-03 actualiza solo campos permitidos y preserva el identificador', async () => {
    const repo = mockRepo([{ ...valid, id: 7 }]);
    const service = createPatientService({ patientRepo: repo });

    const result = await service.update(7, { telefono: '3109999999', documento: 'HACK', id: 500 });

    expect(result.id).toBe(7);
    expect(result.telefono).toBe('3109999999');
    expect(result.documento).toBe(valid.documento);
  });

  test('PU-03b actualizar paciente inexistente lanza NotFound', async () => {
    const service = createPatientService({ patientRepo: mockRepo() });
    await expect(service.update(1, { telefono: '1' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
