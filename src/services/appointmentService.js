const {
  ValidationError,
  NotFoundError,
  ConflictError,
  UnprocessableError,
} = require('../domain/errors');
const { parseInterval, overlaps, contains } = require('../domain/time');

const STATUS = Object.freeze({
  PROGRAMADA: 'PROGRAMADA',
  REPROGRAMADA: 'REPROGRAMADA',
  CANCELADA: 'CANCELADA',
});
const ACTIVE = [STATUS.PROGRAMADA, STATUS.REPROGRAMADA];

function createAppointmentService({
  appointmentRepo,
  patientRepo,
  doctorRepo,
  availabilityRepo,
  audit,
  clock = () => new Date(),
}) {
  async function ensureSlotIsFree(doctorId, interval, ignoreId) {
    const slots = await availabilityRepo.findAll((a) => a.doctorId === doctorId);
    const inside = slots.some((a) => contains(parseInterval(a.start, a.end), interval));
    if (!inside) {
      throw new UnprocessableError('El horario está fuera de la disponibilidad del médico');
    }
    const active = await appointmentRepo.findAll(
      (c) => c.doctorId === doctorId && c.id !== ignoreId && ACTIVE.includes(c.status),
    );
    if (active.some((c) => overlaps(interval, parseInterval(c.start, c.end)))) {
      throw new ConflictError('El médico ya tiene una cita en ese horario');
    }
  }

  async function schedule({ patientId, doctorId, start, end } = {}, actor) {
    const interval = parseInterval(start, end);
    const patient = await patientRepo.findById(patientId);
    if (!patient) throw new NotFoundError('Paciente no encontrado');
    const doctor = await doctorRepo.findById(doctorId);
    if (!doctor) throw new NotFoundError('Médico no encontrado');

    await ensureSlotIsFree(doctor.id, interval);

    const appointment = await appointmentRepo.save({
      patientId: patient.id,
      doctorId: doctor.id,
      start,
      end,
      status: STATUS.PROGRAMADA,
      createdBy: actor?.username,
      createdAt: clock().toISOString(),
      history: [],
    });
    await audit.record(actor, 'CREAR_CITA', 'cita', appointment.id, { start, end });
    return appointment;
  }

  async function findActive(id) {
    const appointment = await appointmentRepo.findById(id);
    if (!appointment) throw new NotFoundError('Cita no encontrada');
    if (!ACTIVE.includes(appointment.status)) {
      throw new ConflictError('La cita no está activa');
    }
    return appointment;
  }

  async function cancel(id, actor, reason = '') {
    const appointment = await findActive(id);
    const updated = await appointmentRepo.save({
      ...appointment,
      status: STATUS.CANCELADA,
      cancelledBy: actor?.username,
      cancelledAt: clock().toISOString(),
      cancelReason: reason,
    });
    await audit.record(actor, 'CANCELAR_CITA', 'cita', id, { reason });
    return updated;
  }

  async function reschedule(id, { start, end } = {}, actor) {
    const appointment = await findActive(id);
    const interval = parseInterval(start, end);
    await ensureSlotIsFree(appointment.doctorId, interval, appointment.id);

    const updated = await appointmentRepo.save({
      ...appointment,
      start,
      end,
      status: STATUS.REPROGRAMADA,
      history: [
        ...appointment.history,
        {
          from: { start: appointment.start, end: appointment.end },
          to: { start, end },
          by: actor?.username,
          at: clock().toISOString(),
        },
      ],
    });
    await audit.record(actor, 'REPROGRAMAR_CITA', 'cita', id, {
      from: { start: appointment.start, end: appointment.end },
      to: { start, end },
    });
    return updated;
  }

  const byStart = (a, b) => Date.parse(a.start) - Date.parse(b.start);

  async function historyByPatient(patientId) {
    const id = Number(patientId);
    if (!Number.isInteger(id)) throw new ValidationError('patientId inválido');
    return (await appointmentRepo.findAll((c) => c.patientId === id)).sort(byStart);
  }

  async function historyByDoctor(doctorId) {
    const id = Number(doctorId);
    if (!Number.isInteger(id)) throw new ValidationError('doctorId inválido');
    return (await appointmentRepo.findAll((c) => c.doctorId === id)).sort(byStart);
  }

  return { schedule, cancel, reschedule, historyByPatient, historyByDoctor };
}

module.exports = { createAppointmentService, STATUS, ACTIVE };
