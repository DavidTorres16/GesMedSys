const { ValidationError, NotFoundError } = require('../domain/errors');
const { parseInterval, overlaps } = require('../domain/time');

function createDoctorService({ doctorRepo, availabilityRepo }) {
  async function create(data = {}) {
    for (const field of ['nombre', 'especialidad']) {
      if (typeof data[field] !== 'string' || data[field].trim() === '') {
        throw new ValidationError(`El campo ${field} es obligatorio`);
      }
    }
    return doctorRepo.save({ nombre: data.nombre.trim(), especialidad: data.especialidad.trim() });
  }

  async function get(id) {
    const doctor = await doctorRepo.findById(id);
    if (!doctor) throw new NotFoundError('Médico no encontrado');
    return doctor;
  }

  async function list() {
    return doctorRepo.findAll();
  }

  async function addAvailability(doctorId, { start, end } = {}) {
    const doctor = await get(doctorId);
    const interval = parseInterval(start, end);
    const existing = await availabilityRepo.findAll((a) => a.doctorId === doctor.id);
    if (existing.some((a) => overlaps(interval, parseInterval(a.start, a.end)))) {
      throw new ValidationError('La franja se cruza con otra disponibilidad del médico');
    }
    return availabilityRepo.save({ doctorId: doctor.id, start, end });
  }

  async function listAvailability(doctorId) {
    const doctor = await get(doctorId);
    return availabilityRepo.findAll((a) => a.doctorId === doctor.id);
  }

  return { create, get, list, addAvailability, listAvailability };
}

module.exports = { createDoctorService };
