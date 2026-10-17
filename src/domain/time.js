const { ValidationError } = require('./errors');

// Convierte una fecha ISO 8601 a milisegundos; lanza error si no es válida.
function toMillis(value, field) {
  const ms = Date.parse(value);
  if (typeof value !== 'string' || Number.isNaN(ms)) {
    throw new ValidationError(`${field} debe ser una fecha ISO 8601 válida`);
  }
  return ms;
}

// Valida un intervalo [inicio, fin) y lo devuelve en milisegundos.
function parseInterval(start, end) {
  const s = toMillis(start, 'inicio');
  const e = toMillis(end, 'fin');
  if (s >= e) {
    throw new ValidationError('El inicio debe ser anterior al fin');
  }
  return { s, e };
}

// Intervalos semiabiertos [inicio, fin): citas contiguas no se solapan.
function overlaps(a, b) {
  return a.s < b.e && b.s < a.e;
}

function contains(outer, inner) {
  return outer.s <= inner.s && inner.e <= outer.e;
}

module.exports = { toMillis, parseInterval, overlaps, contains };
