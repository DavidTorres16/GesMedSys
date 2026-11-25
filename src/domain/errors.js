class AppError extends Error {
  constructor(message, status) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

class ValidationError extends AppError {
  constructor(message) { super(message, 400); }
}
class UnauthorizedError extends AppError {
  constructor(message = 'Autenticación requerida') { super(message, 401); }
}
class ForbiddenError extends AppError {
  constructor(message = 'Acción no permitida para el rol') { super(message, 403); }
}
class NotFoundError extends AppError {
  constructor(message) { super(message, 404); }
}
class ConflictError extends AppError {
  constructor(message) { super(message, 409); }
}
class UnprocessableError extends AppError {
  constructor(message) { super(message, 422); }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableError,
};
