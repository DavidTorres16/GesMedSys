# GesMedSys — Sistema de Gestión de Citas Médicas

API REST monolítica (Node.js + Express) para gestionar pacientes, médicos, disponibilidad,
citas, historial y reportes de ocupación, con autenticación JWT, roles y auditoría.

![CI/CD](https://github.com/DavidTorres16/GesMedSys/actions/workflows/ci-cd.yml/badge.svg)

## Inicio rápido

```bash
npm ci
npm test                 # pruebas unitarias (PU-01..PU-18) e integración (CN-01..CN-22)
npm run test:ci          # con cobertura y reporte JUnit, como en el pipeline
JWT_SECRET=dev SEED_PASSWORD=ClaveDemo2026 npm start
SEED_PASSWORD=ClaveDemo2026 ./scripts/smoke-test.sh
```

Con Docker:

```bash
docker build -t gesmedsys .
docker run -p 8080:8080 -e JWT_SECRET=dev -e SEED_PASSWORD=ClaveDemo2026 gesmedsys
```

Usuarios semilla ficticios: `admin`, `recepcion`, `medico` (clave = `SEED_PASSWORD`).

## Pipeline

`.github/workflows/ci-cd.yml`:

1. **Pruebas** — Jest con cobertura (mínimo 80 % de líneas) y reporte JUnit.
2. **Build y staging** — imagen Docker, contenedor en el runner y prueba de humo.
3. **Cloud Run (opcional)** — solo en `main` cuando existe la variable `GCP_PROJECT_ID`.

Detalle completo en [docs/Documento_Tecnico_Pipeline_CI_CD.md](docs/Documento_Tecnico_Pipeline_CI_CD.md)
(también en formato Word: `docs/Documento_Tecnico_Pipeline_CI_CD.docx`).
