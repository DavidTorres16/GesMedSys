#!/usr/bin/env node
// Lee los reportes JUnit de Jest y escribe un resumen legible en la página de la
// ejecución de GitHub Actions (Job Summary). Cada prueba fallida también se publica
// como anotación de error, para verla sin abrir el log.
//
// Uso: node scripts/resumen-pruebas.js "Pruebas unitarias=reports/junit-unitarias.xml" ...
// Fuera de GitHub Actions imprime el resumen en la consola.

const fs = require('fs');

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' };
const unescape = (s) => s.replace(/&(lt|gt|quot|apos|amp);/g, (m) => ENTITIES[m]);
const cell = (s) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const attrs = (s) => Object.fromEntries([...s.matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k, unescape(v)]));

// Identificadores definidos en el Plan de Pruebas (sección 3).
const range = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`);
const PLAN = { PU: range('PU', 18), CN: range('CN', 22) };

function parseReport(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const cases = [];
  for (const suite of xml.matchAll(/<testsuite\s([^>]*)>([\s\S]*?)<\/testsuite>/g)) {
    const suiteFile = attrs(suite[1]).name;
    for (const tc of suite[2].matchAll(/<testcase\s([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const { name } = attrs(tc[1]);
      const body = tc[2] || '';
      const failure = body.match(/<(failure|error)[^>]*>([\s\S]*?)<\/\1>/);
      const status = failure ? 'fallida' : /<skipped/.test(body) ? 'omitida' : 'aprobada';
      const reason = failure
        ? unescape(failure[2]).split('\n').map((l) => l.trim())
          .filter((l) => l && !l.startsWith('at ')).slice(0, 3).join(' · ') || 'Sin detalle'
        : '';
      cases.push({ name, file: suiteFile, status, reason });
    }
  }
  return cases;
}

// "CN-08 a CN-12" o "CN-05 / CN-06" -> lista de IDs mencionados en el título.
function idsIn(title) {
  const ids = new Set((title.match(/\b(PU|CN)-\d{2}\b/g) || []));
  for (const [, p, a, b] of title.matchAll(/\b(PU|CN)-(\d{2}) a \1-(\d{2})\b/g)) {
    for (let i = Number(a); i <= Number(b); i++) ids.add(`${p}-${String(i).padStart(2, '0')}`);
  }
  return [...ids];
}

const icon = { aprobada: '✅', fallida: '❌', omitida: '⏭️' };
const out = [];
const failures = [];
const seen = new Set();

out.push('## Resultado de las pruebas\n');
out.push('| Nivel | Total | ✅ Aprobadas | ❌ Fallidas | ⏭️ Omitidas |');
out.push('|---|---:|---:|---:|---:|');

const sections = [];
for (const arg of process.argv.slice(2)) {
  const [label, file] = arg.split('=');
  if (!fs.existsSync(file)) {
    out.push(`| ${label} | — | — | — | — |`);
    sections.push(`> **${label}:** no se generó el reporte (\`${file}\`); el paso no llegó a ejecutarse.\n`);
    continue;
  }
  const cases = parseReport(file);
  const count = (s) => cases.filter((c) => c.status === s).length;
  out.push(`| ${label} | ${cases.length} | ${count('aprobada')} | ${count('fallida')} | ${count('omitida')} |`);
  cases.forEach((c) => idsIn(c.name).forEach((id) => seen.add(id)));
  failures.push(...cases.filter((c) => c.status === 'fallida').map((c) => ({ ...c, label })));

  sections.push(`<details><summary>${label}: detalle de los ${cases.length} casos</summary>\n`);
  sections.push('| Estado | Prueba | Archivo |');
  sections.push('|:---:|---|---|');
  cases.forEach((c) => sections.push(`| ${icon[c.status]} | ${cell(c.name)} | \`${c.file}\` |`));
  sections.push('\n</details>\n');
}

out.push('');
if (failures.length) {
  out.push(`### ❌ ${failures.length} prueba(s) fallida(s): el pipeline se detiene y no se despliega\n`);
  out.push('| Nivel | Prueba | Archivo | Motivo |');
  out.push('|---|---|---|---|');
  failures.forEach((f) => out.push(`| ${f.label} | ${cell(f.name)} | \`${f.file}\` | ${cell(f.reason).slice(0, 200)} |`));
  out.push('');
} else {
  out.push('### ✅ Todas las pruebas ejecutadas fueron aprobadas\n');
}

const missing = [...PLAN.PU, ...PLAN.CN].filter((id) => !seen.has(id));
out.push(`**Casos del Plan de Pruebas con prueba automatizada:** PU ${PLAN.PU.filter((id) => seen.has(id)).length}/18 · `
  + `CN ${PLAN.CN.filter((id) => seen.has(id)).length}/22`
  + (missing.length ? ` · sin reporte: ${missing.join(', ')}` : ''));
out.push('');
out.push(...sections);

const markdown = `${out.join('\n')}\n`;
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  // Anotaciones: aparecen arriba en la página de la ejecución.
  failures.forEach((f) => {
    const msg = `${f.name} — ${f.reason}`.replace(/%/g, '%25').replace(/\r?\n/g, '%0A');
    console.log(`::error file=${f.file},title=${f.label}: prueba fallida::${msg}`);
  });
} else {
  process.stdout.write(markdown);
}
