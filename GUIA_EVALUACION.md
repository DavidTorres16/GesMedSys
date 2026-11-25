# Guía de instalación, configuración y ejecución del pipeline

**Proyecto:** Sistema de Gestión de Citas Médicas (GesMedSys)
**Integrantes:** Marlon Andrés Campo · David Mauricio Torres
**Repositorio:** https://github.com/DavidTorres16/GesMedSys

Esta guía explica cómo instalar el proyecto, ejecutar las pruebas en local, poner a correr
el pipeline de GitHub Actions y comprobar que se detiene cuando una prueba unitaria falla.

---

## 1. Qué hay en el repositorio

| Ruta | Contenido |
|---|---|
| `src/` | API REST en Node.js + Express (pacientes, médicos, citas, historial, reportes, JWT, roles y auditoría). |
| `tests/unit/` | Pruebas unitarias **PU-01 a PU-18** del Plan de Pruebas (Jest, con dobles de prueba). |
| `tests/integration/api.test.js` | Pruebas de caja negra **CN-01 a CN-22** sobre la API (Jest + Supertest). |
| `.github/workflows/ci-cd.yml` | Definición del pipeline. |
| `scripts/smoke-test.sh` | Prueba de humo que se ejecuta después del despliegue de staging. |
| `scripts/resumen-pruebas.js` | Genera la tabla de resultados que aparece en la página de cada ejecución. |
| `Dockerfile` | Imagen que se despliega en staging (y en Cloud Run, si se configura). |
| `docs/Documento_Tecnico_Pipeline_CI_CD.md` | Documento técnico del pipeline. |

Cada prueba empieza con el identificador del Plan de Pruebas (por ejemplo,
`PU-08 rechaza una cita que se solapa...`), así que cualquier resultado se puede cruzar
directamente con el plan.

---

## 2. Requisitos

| Herramienta | Versión | ¿Obligatoria? |
|---|---|---|
| Cuenta de GitHub | — | Sí, para ejecutar el pipeline |
| Git | 2.x | Sí |
| Node.js | **22 LTS** (incluye npm 10) | Solo para ejecutar en local |
| Docker | 24 o superior | No; solo si quiere probar la imagen en local |

Para ejecutar el pipeline **no hace falta instalar nada**: corre en los servidores de GitHub.

Comprobar versiones:

```bash
git --version
node -v      # debe mostrar v22.x
npm -v
```

---

## 3. Instalación y ejecución en local (opcional)

```bash
git clone https://github.com/DavidTorres16/GesMedSys.git
cd GesMedSys
npm ci                      # instala dependencias exactas (package-lock.json)
```

| Comando | Qué hace |
|---|---|
| `npm test` | Ejecuta todas las pruebas (unitarias y de caja negra). |
| `npm run test:unit` | Solo las pruebas unitarias PU-01 a PU-18. |
| `npm run test:integration` | Solo las pruebas de caja negra CN-01 a CN-22. |
| `npm run test:ci` | Igual que la etapa de cobertura del pipeline: cobertura + reporte JUnit en `reports/`. |

Resultado esperado de `npm test`: `Test Suites: 7 passed` y `Tests: 50 passed`.

Levantar la API (opcional):

```bash
# macOS / Linux
JWT_SECRET=dev SEED_PASSWORD=ClaveDemo2026 npm start
# Windows (PowerShell)
$env:JWT_SECRET="dev"; $env:SEED_PASSWORD="ClaveDemo2026"; npm start
```

La API queda en `http://localhost:8080` (`GET /health` responde `{"status":"ok"}`).
Usuarios ficticios: `admin`, `recepcion` y `medico`, todos con la clave de `SEED_PASSWORD`.

Con Docker:

```bash
docker build -t gesmedsys .
docker run -p 8080:8080 -e JWT_SECRET=dev -e SEED_PASSWORD=ClaveDemo2026 gesmedsys
```

---

## 4. Ejecutar el pipeline en GitHub Actions

### 4.1 Crear su copia del repositorio (fork)

1. Inicie sesión en GitHub y abra https://github.com/DavidTorres16/GesMedSys.
2. Pulse **Fork** → **Create fork**.
3. En su fork, abra la pestaña **Actions**. GitHub desactiva los workflows en los forks:
   pulse **"I understand my workflows, go ahead and enable them"**.
   *Sin este paso el pipeline no se ejecuta.*

### 4.2 Lanzar la primera ejecución

Hay dos formas:

- **Manual:** pestaña **Actions** → workflow **CI/CD GesMedSys** (columna izquierda) →
  botón **Run workflow** → rama `main` → **Run workflow**.
- **Automática:** cualquier `push` a cualquier rama, o un pull request hacia `main`.

### 4.3 Qué se ve en la ejecución

Al abrir la ejecución aparece el flujo de tres etapas, cada una dependiente de la anterior:

```
1. Pruebas unitarias y de caja negra  ──►  2. Build y despliegue de staging  ──►  3. Despliegue a Cloud Run (opcional)
```

| Etapa | Pasos | Tiempo aprox. |
|---|---|---|
| **1. Pruebas unitarias y de caja negra** | Descargar código → Configurar Node.js → Instalar dependencias → **Pruebas unitarias (PU-01 a PU-18)** → Pruebas de caja negra (CN-01 a CN-22) → Cobertura (mínimo 80 %) → Resumen de resultados → Guardar reportes | 40 s |
| **2. Build y despliegue de staging** | Construir imagen Docker → Desplegar contenedor en el runner → Prueba de humo → Logs → Exportar imagen | 40 s |
| **3. Despliegue a Google Cloud Run** | Solo corre en `main` si se configuró GCP (ver sección 5.3). Si no, aparece como **omitida** (gris). | — |

En la página de la ejecución (**Summary**) se publica:

- Una tabla con el total de pruebas **aprobadas y fallidas** por nivel.
- La lista de pruebas fallidas, con el archivo y el motivo de cada falla.
- El conteo de casos del Plan de Pruebas cubiertos (PU 18/18 · CN 22/22).
- La cobertura de código.
- Los **artefactos** descargables: `reportes-pruebas` (JUnit XML + cobertura HTML en
  `coverage/lcov-report/index.html`) e `imagen-docker`.

---

## 5. Parámetros del pipeline

### 5.1 Parámetros en el archivo del workflow

Se editan en el bloque `env:` al inicio de `.github/workflows/ci-cd.yml`:

| Parámetro | Valor por defecto | Para qué sirve |
|---|---|---|
| `NODE_VERSION` | `'22'` | Versión de Node.js con la que se instalan y ejecutan las pruebas. |
| `COVERAGE_MIN` | `'80'` | Porcentaje mínimo de líneas cubiertas. Si la cobertura queda por debajo, la etapa 1 falla. |
| `IMAGE_NAME` | `gesmedsys` | Nombre de la imagen Docker construida en la etapa 2. |

Disparadores (bloque `on:` del mismo archivo):

| Evento | Configuración |
|---|---|
| `push` | Cualquier rama (`'**'`). |
| `pull_request` | Hacia `main`. |
| `workflow_dispatch` | Ejecución manual desde la pestaña Actions. |

### 5.2 Secretos (opcionales para las etapas 1 y 2)

En su fork: **Settings → Secrets and variables → Actions → New repository secret**.

| Secreto | Uso | Si no se define |
|---|---|---|
| `SEED_PASSWORD` | Clave de los usuarios ficticios en staging (la usa la prueba de humo). | Se usa una clave de demostración. |

### 5.3 Despliegue en Google Cloud Run (opcional)

Solo es necesario si se quiere ver la etapa 3 en ejecución. Requiere un proyecto de Google
Cloud con facturación activa. Los pasos detallados están en la sección 7.2 del
[documento técnico](docs/Documento_Tecnico_Pipeline_CI_CD.md).

| Dónde | Nombre | Valor |
|---|---|---|
| Variables | `GCP_PROJECT_ID` | ID del proyecto de Google Cloud |
| Variables | `GCP_REGION` | Región, por ejemplo `us-central1` (opcional) |
| Secrets | `GCP_SA_KEY` | JSON de la cuenta de servicio |
| Secrets | `SEED_PASSWORD` | Clave del usuario `admin` |

Sin estas variables, la etapa 3 aparece como omitida y el pipeline termina en verde.

---

## 6. Comprobar que el pipeline detecta pruebas unitarias fallidas

### 6.1 Modificar una prueba desde el navegador

1. En su fork, abra por ejemplo `tests/unit/appointmentService.test.js`.
2. Pulse el ícono del lápiz (**Edit this file**).
3. Cambie una aserción. Algunos ejemplos:

| Prueba | Línea original | Cambio que la hace fallar |
|---|---|---|
| **PU-08** impedir cruce de médico | `expect(deps.appointmentRepo.save).not.toHaveBeenCalled();` | `expect(deps.appointmentRepo.save).toHaveBeenCalledTimes(1);` |
| **PU-07** programar cita | `createdBy: 'recepcion'` | `createdBy: 'admin'` |
| **PU-01** registrar paciente (`patientService.test.js`) | `toHaveBeenCalledTimes(1)` | `toHaveBeenCalledTimes(2)` |
| **PU-16** calcular ocupación (`reportService.test.js`) | `occupiedMinutes: 90, appointments: 3, percentage: 50` | cambiar `percentage: 50` por `percentage: 60` |

4. Pulse **Commit changes** (directamente en `main` o en una rama nueva).
   El `push` lanza el pipeline automáticamente.

### 6.2 Resultado esperado

- El paso **Pruebas unitarias (PU-01 a PU-18)** queda en **rojo (❌)**.
- La etapa 1 termina en rojo y las etapas 2 y 3 aparecen como **omitidas**:
  el código con pruebas fallidas no se despliega.
- En **Summary** aparece la tabla *"❌ 1 prueba(s) fallida(s)"* con el nombre de la prueba
  (por ejemplo `PU-08 rechaza una cita que se solapa...`), el archivo y el motivo
  (por ejemplo `Expected number of calls: 1 · Received number of calls: 0`).
- En **Annotations** aparece un error por cada prueba fallida.
- El artefacto `reportes-pruebas` contiene `reports/junit-unitarias.xml` con la falla.

Las pruebas de caja negra se ejecutan de todos modos, para que el reporte quede completo.

### 6.3 Volver a verde

Deshaga el cambio (edite el archivo de nuevo o use `git revert`) y haga commit.
El pipeline se ejecuta otra vez y vuelve a quedar en verde.

### 6.4 En local

Con el mismo cambio, `npm run test:unit` termina con código de salida 1 y muestra la prueba
fallida con el valor esperado y el recibido.

---

## 7. Ubicación de cada prueba del Plan

| Requisito | Pruebas unitarias | Archivo | Caja negra |
|---|---|---|---|
| RF-01 Pacientes | PU-01, PU-02, PU-03 | `tests/unit/patientService.test.js` | CN-01 a CN-04 |
| RF-02 Médicos y disponibilidad | PU-04, PU-05, PU-06 | `tests/unit/doctorService.test.js` | CN-05 a CN-07 |
| RF-03 Programar citas sin cruces | PU-07, PU-08, PU-09, PU-10 | `tests/unit/appointmentService.test.js` | CN-08 a CN-12 |
| RF-04 Cancelar y reprogramar | PU-11, PU-12, PU-13 | `tests/unit/appointmentService.test.js` | CN-13 a CN-15 |
| RF-05 Historial | PU-14, PU-15 | `tests/unit/appointmentService.test.js` | CN-16, CN-17 |
| RF-06 Reportes | PU-16 | `tests/unit/reportService.test.js` | CN-18 |
| Seguridad y roles | PU-17 | `tests/unit/authService.test.js` | CN-19, CN-20 |
| Auditoría | PU-18 | `tests/unit/appointmentService.test.js`, `tests/unit/auditService.test.js` | CN-21 |
| Rendimiento (< 3 s) | — | — | CN-22 |

Todas las pruebas de caja negra están en `tests/integration/api.test.js`. Los casos con
sufijo `b` (por ejemplo `PU-09b`) son rutas negativas complementarias.

---

## 8. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| La pestaña Actions del fork no muestra ejecuciones | Los workflows no están habilitados en el fork. Vea el paso 3 de la sección 4.1. |
| No aparece el botón **Run workflow** | Seleccione primero **CI/CD GesMedSys** en la columna izquierda de Actions. |
| `npm ci` falla en local con error de versión | Instale Node.js 22 LTS (`node -v` debe mostrar `v22.x`). |
| La etapa 3 aparece en gris | Es lo esperado si no se configuró Google Cloud (sección 5.3). |
| `./scripts/smoke-test.sh` no corre en Windows | Ejecútelo desde Git Bash o WSL. En el pipeline corre en Linux y no requiere nada. |
