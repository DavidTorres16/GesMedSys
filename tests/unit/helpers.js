// Doble de prueba de repositorio: todas las funciones son jest.fn().
function mockRepo(items = []) {
  return {
    save: jest.fn(async (e) => ({ ...e, id: e.id ?? 99 })),
    findById: jest.fn(async (id) => items.find((i) => i.id === Number(id)) ?? null),
    findAll: jest.fn(async (pred = () => true) => items.filter(pred)),
  };
}

const fixedClock = () => new Date('2026-11-02T12:00:00.000Z');
const actor = { username: 'recepcion', role: 'RECEPCIONISTA' };

module.exports = { mockRepo, fixedClock, actor };
