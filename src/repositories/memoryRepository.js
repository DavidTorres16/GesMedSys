// Repositorio en memoria. Expone la misma interfaz que tendría un adaptador
// PostgreSQL/MySQL, de modo que los servicios no dependen del almacenamiento.
class MemoryRepository {
  constructor() {
    this.items = new Map();
    this.seq = 0;
  }

  async save(entity) {
    const id = entity.id ?? ++this.seq;
    const stored = { ...entity, id };
    this.items.set(id, stored);
    return { ...stored };
  }

  async findById(id) {
    const found = this.items.get(Number(id));
    return found ? { ...found } : null;
  }

  async findAll(predicate = () => true) {
    return [...this.items.values()].filter(predicate).map((e) => ({ ...e }));
  }

  async clear() {
    this.items.clear();
    this.seq = 0;
  }
}

function createRepositories() {
  return {
    users: new MemoryRepository(),
    patients: new MemoryRepository(),
    doctors: new MemoryRepository(),
    availability: new MemoryRepository(),
    appointments: new MemoryRepository(),
    audit: new MemoryRepository(),
  };
}

module.exports = { MemoryRepository, createRepositories };
