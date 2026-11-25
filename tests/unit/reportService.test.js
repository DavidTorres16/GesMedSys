const { createReportService } = require('../../src/services/reportService');
const { mockRepo } = require('./helpers');

describe('RF-06 Reportes de ocupación', () => {
  test('PU-16 calcula totales y porcentaje con la fórmula ocupado/disponible', async () => {
    const service = createReportService({
      availabilityRepo: mockRepo([
        { id: 1, doctorId: 1, start: '2026-11-03T13:00:00Z', end: '2026-11-03T15:00:00Z' }, // 120 min
        { id: 2, doctorId: 2, start: '2026-11-03T13:00:00Z', end: '2026-11-03T14:00:00Z' }, // 60 min
      ]),
      appointmentRepo: mockRepo([
        { id: 1, doctorId: 1, status: 'PROGRAMADA', start: '2026-11-03T13:00:00Z', end: '2026-11-03T13:30:00Z' },
        { id: 2, doctorId: 1, status: 'REPROGRAMADA', start: '2026-11-03T14:00:00Z', end: '2026-11-03T14:30:00Z' },
        { id: 3, doctorId: 1, status: 'CANCELADA', start: '2026-11-03T14:30:00Z', end: '2026-11-03T15:00:00Z' },
        { id: 4, doctorId: 2, status: 'PROGRAMADA', start: '2026-11-03T13:00:00Z', end: '2026-11-03T13:30:00Z' },
      ]),
    });

    const all = await service.occupancy({ from: '2026-11-03T00:00:00Z', to: '2026-11-04T00:00:00Z' });
    expect(all).toMatchObject({ availableMinutes: 180, occupiedMinutes: 90, appointments: 3, percentage: 50 });

    const doctor1 = await service.occupancy({ from: '2026-11-03T00:00:00Z', to: '2026-11-04T00:00:00Z', doctorId: '1' });
    expect(doctor1).toMatchObject({ availableMinutes: 120, occupiedMinutes: 60, percentage: 50 });
  });

  test('PU-16b sin disponibilidad la ocupación es 0 %', async () => {
    const service = createReportService({ availabilityRepo: mockRepo(), appointmentRepo: mockRepo() });
    const r = await service.occupancy({ from: '2026-11-03T00:00:00Z', to: '2026-11-04T00:00:00Z' });
    expect(r.percentage).toBe(0);
  });
});
