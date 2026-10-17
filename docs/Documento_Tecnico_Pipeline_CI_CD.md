---
title: "Documento Técnico — Pipeline de Despliegue y Ejecución Automatizada de Pruebas Unitarias"
subtitle: "Sistema de Gestión de Citas Médicas (GesMedSys)"
author: "Marlon Andrés Campo · David Mauricio Torres"
date: "Octubre de 2026 — Versión 1.0"
lang: es
---

# 1. Introducción

Este documento describe el proceso técnico que el equipo seguirá para realizar, de forma
automatizada, el **despliegue** del Sistema de Gestión de Citas Médicas y la **ejecución de
sus pruebas unitarias y de integración** cada vez que se modifica el código fuente.

El ejercicio se apoya en tres documentos previos del proyecto:

- **RFP Especializado para Desarrollo de Software** (06/10/2026): fija la arquitectura
  monolítica, la API REST, los lenguajes aceptados (Java, Python o JavaScript), Git/GitHub
  como control de versiones y GitHub Actions como herramienta opcional de CI/CD, con
  despliegue previsto en Google Cloud.
- **Plan de Pruebas** (13/10/2026): define 18 pruebas unitarias (PU-01 a PU-18) y 22
  pruebas de caja negra (CN-01 a CN-22), sus criterios de aceptación, suspensión y
  reanudación.
- **Introducción del proyecto**: contexto del problema (cruces de horario, falta de
  trazabilidad y de reportes) que el sistema resuelve.

## 1.1 Objetivo

Construir un pipeline sencillo y reproducible que, ante cada `push` o *pull request* en
GitHub:

1. Instale dependencias y ejecute automáticamente las pruebas unitarias y de integración,
   generando reportes de resultados (JUnit) y de cobertura.
2. Detenga el proceso si alguna prueba falla o si la cobertura es inferior al umbral.
3. Empaquete la aplicación en una imagen Docker, la "despliegue" en un ambiente de staging
   efímero y verifique su funcionamiento con una prueba de humo.
4. Opcionalmente, publique la versión en Google Cloud Run cuando el cambio llega a la rama
   `main`.

## 1.2 Alcance

| Incluido | Fuera de alcance |
|---|---|
| API REST con los módulos RF-01 a RF-06, autenticación JWT, roles y auditoría | Interfaz React (frontend) |
| Pruebas unitarias PU-01 a PU-18 automatizadas | Pruebas E2E, de seguridad y de carga (el RFP no las exige) |
| Pruebas de caja negra CN-01 a CN-22 automatizadas sobre la API | Base de datos persistente (se usa un repositorio en memoria intercambiable) |
| Pipeline de GitHub Actions con despliegue de staging y despliegue opcional a Cloud Run | Copias de seguridad, dominio propio y monitoreo |

# 2. Selección del stack tecnológico

El RFP deja abierta la elección entre Java/Spring Boot, Python/Django y JavaScript/Node.js.
Se seleccionó **JavaScript sobre Node.js** por las siguientes razones:

| Criterio | Decisión | Justificación |
|---|---|---|
| Lenguaje | JavaScript (Node.js 20 LTS) | Aceptado por el RFP; un solo lenguaje para backend y el frontend React sugerido. |
| Framework web | Express 4 | Sugerido explícitamente por el RFP ("Node.js (Express)"); mínimo y fácil de probar. |
| Pruebas unitarias | Jest 29 | Mencionado en el Plan de Pruebas ("Jest/Vitest en JavaScript"); incluye *mocks*, aserciones y cobertura sin dependencias extra. |
| Pruebas de caja negra | Supertest 7 | Ejecuta peticiones HTTP reales contra la API dentro del mismo proceso, sin levantar un servidor externo. |
| Seguridad | `jsonwebtoken`, `bcryptjs` | Cumplen "sesión con JWT" y "contraseñas cifradas (hash)" del RFP. |
| Contenedor | Docker (`node:20-alpine`) | Mismo artefacto en staging y producción; requisito de Cloud Run. |
| CI/CD | GitHub Actions | Opción indicada por el RFP; integrada con el repositorio en GitHub. |
| Nube | Google Cloud Run | Infraestructura marcada en el RFP (Google Cloud); provee HTTPS automáticamente. |

**Persistencia.** Para mantener el ejercicio sencillo, los repositorios se implementan en
memoria (`src/repositories/memoryRepository.js`). Los servicios dependen solo de la interfaz
`save / findById / findAll`, por lo que agregar un adaptador PostgreSQL o MySQL (Cloud SQL) no
requiere modificar la lógica de negocio ni las pruebas unitarias.

# 3. Arquitectura de la solución

Aplicación **monolítica por capas** con API REST, tal como exige el RFP:

```
                 +-------------------------------------------------+
  Cliente HTTP   |                 GesMedSys (Node.js)             |
 (Postman/React) |                                                 |
 ---- JSON ----->|  Rutas REST (/api/...)   src/routes/api.js      |
                 |        |                                        |
                 |  Middleware JWT + roles  src/middleware/auth.js |
                 |        |                                        |
                 |  Servicios de dominio    src/services/*.js      |
                 |   pacientes | médicos | citas | reportes |      |
                 |   autenticación | auditoría                     |
                 |        |                                        |
                 |  Repositorios            src/repositories/      |
                 |   (memoria; reemplazable por PostgreSQL/MySQL)  |
                 +-------------------------------------------------+
```

Decisiones de diseño relevantes para las pruebas:

- **Inyección de dependencias.** Cada servicio se crea con `createXService({ repos, audit,
  clock })`. En las pruebas unitarias se inyectan dobles de prueba (`jest.fn()`) y un reloj
  fijo, lo que hace los resultados deterministas.
- **Intervalos semiabiertos `[inicio, fin)`.** Dos citas contiguas (fin = inicio) no se
  cruzan; cualquier traslape sí. Es la regla que el Plan de Pruebas pide verificar en PU-09
  y CN-11.
- **Errores tipados.** `ValidationError` (400), `UnauthorizedError` (401),
  `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409) y
  `UnprocessableError` (422). Con ello se fija un único código HTTP para cada caso que el
  Plan de Pruebas dejó como alternativa provisional.

## 3.1 Contrato REST

| Método y ruta | Requisito | Roles permitidos |
|---|---|---|
| `POST /api/auth/login` | Seguridad | Público |
| `GET/POST /api/pacientes`, `GET/PUT /api/pacientes/:id` | RF-01 | Admin, Recepcionista (lectura también Médico) |
| `GET/POST /api/medicos` | RF-02 | Admin (lectura todos) |
| `GET/POST /api/medicos/:id/disponibilidad` | RF-02 | Admin, Médico (lectura todos) |
| `POST /api/citas` | RF-03 | Admin, Recepcionista |
| `POST /api/citas/:id/cancelar`, `POST /api/citas/:id/reprogramar` | RF-04 | Admin, Recepcionista |
| `GET /api/pacientes/:id/citas`, `GET /api/medicos/:id/citas` | RF-05 | Todos los roles |
| `GET /api/reportes/ocupacion?from=&to=&doctorId=` | RF-06 | Admin |
| `GET /api/auditoria` | Trazabilidad | Admin |
| `GET /health` | Despliegue | Público |

Códigos de respuesta fijados: creación 201; validación 400; sin sesión 401; sin permiso 403;
recurso inexistente 404; cruce de citas 409; horario fuera de disponibilidad 422.

# 4. Estructura del repositorio

```
GesMedSys/
├── .github/workflows/ci-cd.yml    Definición del pipeline
├── Dockerfile                     Imagen de despliegue
├── package.json                   Dependencias y scripts (start, test, test:ci)
├── scripts/smoke-test.sh          Prueba de humo posterior al despliegue
├── src/
│   ├── app.js / server.js         Composición de la aplicación y arranque
│   ├── domain/                    Errores, roles/permisos, utilidades de tiempo
│   ├── middleware/auth.js         Verificación JWT y autorización por rol
│   ├── repositories/              Repositorio en memoria
│   ├── routes/api.js              Endpoints REST
│   └── services/                  Lógica de negocio (RF-01 a RF-06, auditoría, auth)
├── tests/
│   ├── unit/                      PU-01 a PU-18 (Jest + mocks)
│   └── integration/api.test.js    CN-01 a CN-22 (Supertest sobre la API)
└── docs/                          Este documento
```

# 5. Estrategia de pruebas automatizadas

## 5.1 Niveles

| Nivel | Herramienta | Qué valida | Dependencias |
|---|---|---|---|
| Unitario (caja blanca) | Jest | Reglas de negocio de cada servicio de forma aislada | Repositorios simulados con `jest.fn()`, reloj fijo |
| Integración / caja negra | Jest + Supertest | Entradas y salidas HTTP: códigos, cuerpos, permisos | Aplicación completa con repositorio en memoria y datos semilla ficticios |
| Humo (post-despliegue) | `curl` (Bash) | Que el contenedor desplegado arranca, autentica y protege los recursos | Contenedor real en staging o Cloud Run |

Cada prueba unitaria sigue el patrón indicado en el Plan de Pruebas: **preparar** dobles de
prueba, **ejecutar** el método real, **comprobar** valores o excepciones y **verificar** que
la persistencia se invocó (o no) según corresponda. Por ejemplo, PU-08 verifica que
`appointmentRepo.save` *no* fue llamado cuando se detecta un cruce.

## 5.2 Trazabilidad Plan de Pruebas → código

| Requisito | Pruebas unitarias | Archivo | Caja negra | Archivo |
|---|---|---|---|---|
| RF-01 Pacientes | PU-01, PU-02, PU-03 | `tests/unit/patientService.test.js` | CN-01 a CN-04 | `tests/integration/api.test.js` |
| RF-02 Médicos y disponibilidad | PU-04, PU-05, PU-06 | `tests/unit/doctorService.test.js` | CN-05 a CN-07 | ídem |
| RF-03 Programación sin cruces | PU-07, PU-08, PU-09, PU-10 | `tests/unit/appointmentService.test.js` | CN-08 a CN-12 | ídem |
| RF-04 Cancelar / reprogramar | PU-11, PU-12, PU-13 | `tests/unit/appointmentService.test.js` | CN-13 a CN-15 | ídem |
| RF-05 Historial | PU-14, PU-15 | `tests/unit/appointmentService.test.js` | CN-16, CN-17 | ídem |
| RF-06 Reportes | PU-16 | `tests/unit/reportService.test.js` | CN-18 | ídem |
| Seguridad / roles | PU-17 | `tests/unit/authService.test.js` | CN-19, CN-20 | ídem |
| Auditoría | PU-18 | `tests/unit/appointmentService.test.js`, `auditService.test.js` | CN-21 | ídem |
| Rendimiento (< 3 s) | — | — | CN-22 | ídem |

Los nombres de cada prueba comienzan con su identificador (por ejemplo,
`PU-08 rechaza una cita que se solapa...`), de modo que el reporte JUnit del pipeline sirve
directamente como evidencia para la sección 7 del Plan de Pruebas. Se agregaron casos
complementarios (sufijo `b`) para rutas negativas: cita cancelada que no bloquea el horario,
cancelación doble, paciente inexistente, token manipulado, etc.

**Fórmula de ocupación (PU-16 / CN-18).** El Plan de Pruebas pidió fijarla antes de
ejecutar. Se definió como:

$$\text{Ocupación (\%)} = \frac{\text{minutos con citas activas en el rango}}{\text{minutos de disponibilidad en el rango}} \times 100$$

Se consideran activas las citas en estado `PROGRAMADA` o `REPROGRAMADA`; si no hay
disponibilidad, la ocupación es 0 %.

## 5.3 Resultado de referencia

Ejecución local de `npm run test:ci` (Node.js 22, octubre de 2026):

| Métrica | Valor |
|---|---|
| Suites de prueba | 7 aprobadas de 7 |
| Casos de prueba | 49 aprobados de 49 (38 unitarios, 11 de integración que agrupan CN-01 a CN-22) |
| Cobertura de líneas | 96,77 % (umbral mínimo configurado: 80 %) |
| Cobertura de funciones | 96,03 % |
| Tiempo total | ≈ 7 s |

# 6. Diseño del pipeline CI/CD

## 6.1 Disparadores

El archivo `.github/workflows/ci-cd.yml` se ejecuta cuando:

- se hace `push` a `main` o a ramas de trabajo `claude/**`;
- se abre o actualiza un *pull request* hacia `main`;
- se lanza manualmente desde la pestaña **Actions** (`workflow_dispatch`).

## 6.2 Flujo general

```
 push / PR
    |
    v
+--------------------------+   falla   +---------------------------+
| 1. Pruebas unitarias e   |---------->| Pipeline detenido (rojo)  |
|    integración (Jest)    |           | Reporte JUnit disponible  |
+--------------------------+           +---------------------------+
    | OK (cobertura >= 80 %)
    v
+--------------------------+   falla   +---------------------------+
| 2. Build Docker +        |---------->| No se publica la imagen   |
|    despliegue staging +  |           | Logs del contenedor       |
|    prueba de humo        |           +---------------------------+
+--------------------------+
    | OK  (solo rama main y GCP configurado)
    v
+--------------------------+
| 3. Despliegue a Cloud Run|
|    + prueba de humo      |
+--------------------------+
```

Cada etapa depende de la anterior (`needs:`), por lo que **ningún código que rompa las
pruebas llega a desplegarse**.

## 6.3 Etapa 1 — Pruebas unitarias e integración

| Paso | Acción | Propósito |
|---|---|---|
| Descargar código | `actions/checkout@v4` | Obtener la versión exacta del commit. |
| Configurar Node.js | `actions/setup-node@v4` (v20, caché npm) | Entorno idéntico en cada ejecución. |
| Instalar dependencias | `npm ci` | Instalación reproducible desde `package-lock.json`. |
| Ejecutar pruebas | `npm run test:ci` | Jest en modo CI con cobertura y reporte JUnit. Falla si una prueba falla o la cobertura de líneas < 80 %. |
| Resumen | Escribe la cobertura en el *Job Summary* | Visible en la página de la ejecución. |
| Guardar reportes | `actions/upload-artifact@v4` | `reports/junit.xml` y `coverage/` como evidencia descargable (14 días). |

## 6.4 Etapa 2 — Build y despliegue de staging

Esta etapa simula el despliegue en un ambiente controlado dentro del propio runner de
GitHub (no requiere cuenta en la nube):

1. **Construir la imagen** `gesmedsys:<sha-del-commit>` a partir del `Dockerfile`. La imagen
   solo contiene dependencias de producción (`npm ci --omit=dev`) y se ejecuta con un
   usuario sin privilegios.
2. **Desplegar el contenedor** en el puerto 8080 con variables de entorno de staging
   (`JWT_SECRET` aleatorio por ejecución y `SEED_PASSWORD`).
3. **Prueba de humo** (`scripts/smoke-test.sh`): espera a que `/health` responda, inicia
   sesión como administrador, comprueba que un recurso protegido devuelve **401** sin token y
   **200** con token.
4. **Logs del contenedor** siempre visibles, incluso si algo falla.
5. **Exportar la imagen** como artefacto (`imagen-docker`, 7 días), para que pueda
   descargarse y ejecutarse con `docker load`.

## 6.5 Etapa 3 — Despliegue a Google Cloud Run (opcional)

Se ejecuta solo si: la rama es `main`, el evento no es un *pull request* y el repositorio
tiene definida la variable `GCP_PROJECT_ID`. Si no se configura, la etapa aparece como
*omitida* y el pipeline termina en verde tras la etapa 2.

1. Autenticación con la cuenta de servicio (`google-github-actions/auth@v2`).
2. `gcloud run deploy gesmedsys --source .`: Cloud Build construye la imagen con el mismo
   `Dockerfile` y Cloud Run la publica con HTTPS.
3. Los secretos `JWT_SECRET` y `SEED_PASSWORD` se leen desde **Secret Manager**; nunca se
   escriben en el código ni en el log.
4. Prueba de humo contra la URL pública devuelta por Cloud Run.

El job usa el *environment* `produccion` de GitHub, que puede configurarse con aprobación
manual obligatoria antes de desplegar.

# 7. Configuración requerida

## 7.1 Mínima (etapas 1 y 2)

No se requiere configuración: basta con que el repositorio tenga habilitado GitHub Actions.
Opcionalmente puede crearse el secreto `SEED_PASSWORD` (Settings → Secrets and variables →
Actions); si no existe se usa una clave de demostración solo para staging.

## 7.2 Despliegue en Google Cloud (etapa 3)

| Dónde | Nombre | Valor |
|---|---|---|
| GitHub → Variables | `GCP_PROJECT_ID` | ID del proyecto de Google Cloud |
| GitHub → Variables | `GCP_REGION` | Región, por ejemplo `us-central1` (opcional) |
| GitHub → Secrets | `GCP_SA_KEY` | JSON de la cuenta de servicio |
| GitHub → Secrets | `SEED_PASSWORD` | Clave del usuario `admin` (para la prueba de humo) |
| Google Secret Manager | `jwt-secret` | Secreto de firma de los JWT |
| Google Secret Manager | `seed-password` | Mismo valor que `SEED_PASSWORD` |

Preparación del proyecto en Google Cloud (una sola vez):

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com
gcloud iam service-accounts create github-deployer
# Roles: Cloud Run Admin, Cloud Build Editor, Service Account User,
#        Artifact Registry Writer, Storage Admin, Secret Manager Secret Accessor
printf 'un-secreto-largo' | gcloud secrets create jwt-secret --data-file=-
printf 'ClaveSegura2026'  | gcloud secrets create seed-password --data-file=-
gcloud iam service-accounts keys create key.json \
  --iam-account github-deployer@<PROYECTO>.iam.gserviceaccount.com
# Copiar el contenido de key.json en el secreto GCP_SA_KEY y luego borrar el archivo.
```

# 8. Procedimiento de ejecución del ejercicio

## 8.1 Ejecución local (antes de subir cambios)

```bash
git clone https://github.com/DavidTorres16/GesMedSys.git
cd GesMedSys
npm ci                       # instalar dependencias
npm test                     # todas las pruebas
npm run test:unit            # solo PU-01 a PU-18
npm run test:integration     # solo CN-01 a CN-22
npm run test:ci              # igual que el pipeline: cobertura + JUnit

# Levantar la API y probar el despliegue localmente
JWT_SECRET=dev SEED_PASSWORD=ClaveDemo2026 npm start
SEED_PASSWORD=ClaveDemo2026 ./scripts/smoke-test.sh

# Con Docker
docker build -t gesmedsys .
docker run -p 8080:8080 -e JWT_SECRET=dev -e SEED_PASSWORD=ClaveDemo2026 gesmedsys
```

Usuarios semilla (ficticios): `admin`, `recepcion` y `medico`, todos con la clave definida
en `SEED_PASSWORD`.

## 8.2 Ejecución automatizada en GitHub

1. Crear una rama de trabajo y hacer un cambio (código o prueba).
2. `git push` a la rama: el pipeline arranca automáticamente.
3. Abrir **Actions → CI/CD GesMedSys** y seguir las etapas en tiempo real.
4. Al terminar, descargar los artefactos `reportes-pruebas` (JUnit + cobertura HTML en
   `coverage/lcov-report/index.html`) e `imagen-docker`.
5. Abrir un *pull request* hacia `main`: el pipeline vuelve a ejecutarse y su resultado
   aparece como verificación obligatoria del PR (recomendado activar *branch protection*).
6. Al fusionar en `main`, si GCP está configurado, se despliega a Cloud Run y la URL se
   muestra en el resumen de la ejecución.

## 8.3 Demostración de una falla controlada

Para evidenciar que el pipeline bloquea código defectuoso, se recomienda:

1. En `src/domain/time.js` cambiar `a.s < b.e && b.s < a.e` por `a.s <= b.e && b.s <= a.e`.
2. Hacer `push`. La etapa 1 falla en **PU-09** (citas contiguas) y en el caso de
   integración **CN-08 a CN-12** (aserción de CN-11); las etapas 2 y 3 no se ejecutan.
3. Revertir el cambio y hacer `push`: el pipeline vuelve a verde.

# 9. Evidencias y relación con el Plan de Pruebas

| Ítem del Plan (sección 7) | Evidencia generada por el pipeline |
|---|---|
| 1. PU-08 impedir solapamiento | Caso `PU-08` en `junit.xml` y log de la etapa 1 |
| 2. PU-13 reprogramación con conflicto | Caso `PU-13` en `junit.xml` |
| 3. CN-09 segunda cita simultánea | Caso `CN-08 a CN-12` (respuesta 409) |
| 4. CN-20 rol sin permiso | Caso `CN-20` (respuesta 403 y lista vacía) |
| 5. CN-22 latencia | Caso `CN-22` (operaciones < 3 s) |
| Registro de defectos (Anexo B) | Ejecución fallida en Actions: commit, fecha, autor, caso y traza |

Criterios del Plan aplicados al pipeline:

- **Aceptación:** todas las pruebas aprobadas y cobertura ≥ 80 % → etapa 1 en verde.
- **Rechazo / suspensión:** cualquier prueba fallida (p. ej. doble reserva o acceso no
  autorizado) detiene el pipeline y bloquea el despliegue.
- **Reanudación:** se corrige el defecto, se hace un nuevo `push` y el pipeline re-ejecuta
  todas las pruebas (regresión completa).

# 10. Limitaciones y trabajo futuro

- **Persistencia:** el repositorio en memoria se reinicia con cada despliegue. El siguiente
  paso es un adaptador PostgreSQL (Cloud SQL) con la misma interfaz, transacciones para
  evitar dobles reservas concurrentes y copias de seguridad automáticas (requisito del RFP).
- **Frontend React:** se agregaría un job adicional (`npm run build` y pruebas con
  Vitest/Testing Library) en el mismo pipeline.
- **Calidad estática:** incorporar ESLint y análisis de dependencias (`npm audit`) como pasos
  previos a las pruebas.
- **HTTPS:** en staging (runner) se usa HTTP local; en Cloud Run el tráfico es HTTPS de
  forma nativa.
- **Rendimiento:** CN-22 mide la latencia en un entorno sin carga; una prueba de carga
  formal (k6, JMeter) queda fuera del alcance del RFP.

# 11. Glosario

| Término | Definición |
|---|---|
| CI (Integración Continua) | Práctica de compilar y probar automáticamente cada cambio que se integra al repositorio. |
| CD (Despliegue Continuo) | Publicación automática de la versión que superó las pruebas en un ambiente. |
| Job / etapa | Conjunto de pasos que GitHub Actions ejecuta en una máquina virtual. |
| Artefacto | Archivo generado por el pipeline y conservado para descarga (reportes, imagen). |
| Prueba de humo | Verificación rápida de que la aplicación desplegada arranca y responde. |
| Mock / doble de prueba | Objeto simulado que reemplaza una dependencia real en una prueba unitaria. |
| JUnit XML | Formato estándar de reporte de resultados de pruebas. |
