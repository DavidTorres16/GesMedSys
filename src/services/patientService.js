const { ValidationError, NotFoundError, ConflictError } = require('../domain/errors');

const REQUIRED = ['documento', 'nombres', 'apellidos', 'telefono'];
const UPDATABLE = ['nombres', 'apellidos', 'telefono', 'email'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(data, fields) {
  for (const field of fields) {
    const value = data[field];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ValidationError(`El campo ${field} es obligatorio`);
    }
  }
  if (data.email !== undefined && !EMAIL_RE.test(data.email)) {
    throw new ValidationError('El email no es válido');
  }
}

function createPatientService({ patientRepo }) {
  async function create(data = {}) {
    validate(data, REQUIRED);
    const duplicated = await patientRepo.findAll((p) => p.documento === data.documento);
    if (duplicated.length > 0) {
      throw new ConflictError('Ya existe un paciente con ese documento');
    }
    const patient = { documento: data.documento.trim() };
    for (const field of UPDATABLE) {
      if (data[field] !== undefined) patient[field] = data[field].trim();
    }
    return patientRepo.save(patient);
  }

  async function update(id, changes = {}) {
    const current = await patientRepo.findById(id);
    if (!current) throw new NotFoundError('Paciente no encontrado');
    const allowed = {};
    for (const field of UPDATABLE) {
      if (changes[field] !== undefined) allowed[field] = changes[field];
    }
    validate({ ...current, ...allowed }, REQUIRED);
    return patientRepo.save({ ...current, ...allowed, id: current.id });
  }

  async function get(id) {
    const patient = await patientRepo.findById(id);
    if (!patient) throw new NotFoundError('Paciente no encontrado');
    return patient;
  }

  async function list() {
    return patientRepo.findAll();
  }

  return { create, update, get, list };
}

module.exports = { createPatientService };
