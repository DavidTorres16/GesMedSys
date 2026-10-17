const { parseInterval } = require('../domain/time');
const { ACTIVE } = require('./appointmentService');

const MINUTE = 60 * 1000;

// Minutos de intersección entre dos intervalos en milisegundos.
function overlapMinutes(a, b) {
  return Math.max(0, Math.min(a.e, b.e) - Math.max(a.s, b.s)) / MINUTE;
}

// Ocupación = minutos con citas activas / minutos disponibles * 100,
// restringido al rango [from, to) y opcionalmente a un médico.
function createReportService({ availabilityRepo, appointmentRepo }) {
  async function occupancy({ from, to, doctorId } = {}) {
    const range = parseInterval(from, to);
    const doctorFilter = doctorId === undefined ? () => true : (x) => x.doctorId === Number(doctorId);

    const slots = await availabilityRepo.findAll(doctorFilter);
    const appointments = await appointmentRepo.findAll(
      (c) => doctorFilter(c) && ACTIVE.includes(c.status),
    );

    const availableMinutes = slots.reduce(
      (sum, a) => sum + overlapMinutes(parseInterval(a.start, a.end), range), 0,
    );
    const occupiedMinutes = appointments.reduce(
      (sum, c) => sum + overlapMinutes(parseInterval(c.start, c.end), range), 0,
    );
    const percentage = availableMinutes === 0
      ? 0
      : Math.round((occupiedMinutes / availableMinutes) * 10000) / 100;

    return {
      from,
      to,
      doctorId: doctorId === undefined ? null : Number(doctorId),
      availableMinutes,
      occupiedMinutes,
      appointments: appointments.filter((c) => overlapMinutes(parseInterval(c.start, c.end), range) > 0).length,
      percentage,
    };
  }

  return { occupancy };
}

module.exports = { createReportService };
