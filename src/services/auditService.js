// Registra quién hizo qué y cuándo (requisito de trazabilidad del RFP).
function createAuditService({ auditRepo, clock = () => new Date() }) {
  async function record(actor, action, entity, entityId, detail = {}) {
    return auditRepo.save({
      actor: actor?.username ?? 'sistema',
      action,
      entity,
      entityId,
      detail,
      at: clock().toISOString(),
    });
  }

  async function list() {
    return auditRepo.findAll();
  }

  return { record, list };
}

module.exports = { createAuditService };
