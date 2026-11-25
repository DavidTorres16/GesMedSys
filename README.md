# GesMedSys — Sistema de Gestión de Citas Médicas

API REST monolítica (Node.js + Express) para gestionar pacientes, médicos, disponibilidad,
citas, historial y reportes de ocupación, con autenticación JWT, roles y auditoría.

![CI/CD](https://github.com/DavidTorres16/GesMedSys/actions/workflows/ci-cd.yml/badge.svg)

> **Para evaluar el proyecto:** siga la [Guía de instalación, configuración y ejecución del pipeline](GUIA_EVALUACION.md).

## Inicio rápido

Requiere Node.js 22 LTS.

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

1. **Pruebas** — unitarias (PU-01 a PU-18) y de caja negra (CN-01 a CN-22) en pasos separados,
   cobertura mínima de 80 % de líneas, reporte JUnit y tabla de resultados en el resumen de la ejecución.
2. **Build y staging** — imagen Docker, contenedor en el runner y prueba de humo.
3. **Cloud Run (opcional)** — solo en `main` cuando existe la variable `GCP_PROJECT_ID`.

Se ejecuta con cada `push` a cualquier rama, con cada pull request hacia `main` y manualmente
desde la pestaña **Actions**. Detalle completo en
[docs/Documento_Tecnico_Pipeline_CI_CD.md](docs/Documento_Tecnico_Pipeline_CI_CD.md).
