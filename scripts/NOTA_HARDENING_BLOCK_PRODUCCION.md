# Nota tecnica: Hardening Block de produccion

## Objetivo

Estandarizar una ejecucion unica que consolida readiness, consistencia UX, contingencia y riesgo residual antes de aprobar release o despliegue.

## Comando oficial

Desde backend:

```bash
npm run ops:hardening:block
```

## Etapas que ejecuta

1. Readiness consolidado backend + frontend.
2. Auditoria de consistencia UX (52 vistas evaluadas en estado actual).
3. Drill de contingencia automatizado.
4. Auditoria de riesgo residual con evidencia cruzada.

## Criterio de aprobacion

- Resultado global `PASS` en reporte de hardening.
- Evidencias por etapa presentes en `backend/temp`.
- En CI/Linux, contingencia corre en modo estricto por defecto (`CONTINGENCY_FAIL_ON_SKIPPED=1`).

## Evidencia generada

- `backend/temp/ops-hardening-block-*.md`
- `backend/temp/ops-readiness-*.md`
- `backend/temp/ops-gate-backend-*.md`
- `backend/temp/ops-gate-frontend-*.md`
- `backend/temp/ops-ux-audit-*.md`
- `backend/temp/ops-contingency-drill-*.md`
- `backend/temp/ops-residual-risk-*.md`

## Interpretacion de FAIL por etapa

### 1) Consolidated readiness gate

Significa regresion operativa en backend, frontend, contratos o build.

Accion inmediata:
- Abrir `ops-readiness-*.md` y ubicar subetapa fallida.
- Corregir y relanzar `npm run ops:production:readiness`.

### 2) Frontend UX consistency audit

Significa inconsistencias de experiencia (carga/error/retry/estado vacio/feedback) en vistas criticas.

Accion inmediata:
- Revisar `ops-ux-audit-*.md` y priorizar vistas `HIGH`.
- Homologar patrones de `loading/error/retry/empty/feedback`.

### 3) Contingency drill automation

Significa que no se pudieron validar supuestos de contingencia y recuperacion.

Accion inmediata:
- Revisar `ops-contingency-drill-*.md`.
- Corregir prerequisitos de shell/host o scripts de preflight/final-check.

### 4) Residual risk audit

Significa brecha de evidencia o resultado no PASS en gates base.

Accion inmediata:
- Revisar `ops-residual-risk-*.md` en seccion `Findings`.
- Resolver findings `HIGH` antes de cualquier aprobacion.

## Variables operativas utiles

```bash
# Local/Windows: permite skip controlado de contingencia si no hay bash
CONTINGENCY_FAIL_ON_SKIPPED=0 npm run ops:hardening:block

# CI/Linux: politica estricta (default)
CONTINGENCY_FAIL_ON_SKIPPED=1 npm run ops:hardening:block

# Endurecer UX para bloquear en HIGH
UX_AUDIT_FAIL_ON_HIGH=1 npm run ops:hardening:block

# Bloquear por findings HIGH de riesgo residual (default)
RISK_AUDIT_FAIL_ON_HIGH=1 npm run ops:hardening:block
```

## Politica recomendada

- Desarrollo local: permitir contingencia skip solo cuando falte bash.
- CI y pre-release: bloquear ante cualquier skip de contingencia.
- No aprobar release si el hardening block no termina en `PASS`.
