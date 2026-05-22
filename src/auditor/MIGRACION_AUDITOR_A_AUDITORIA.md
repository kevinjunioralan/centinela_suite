# Migracion de /auditor a /auditoria

## Estado actual

- Las rutas `/api/centinela-banco-pruebas/auditor/*` quedan en modo legacy y deprecadas.
- Todas las operaciones ya usan persistencia real via `EventoAuditoria`.
- Se expone metadata de deprecacion en headers y payload:
  - `Deprecation: true`
  - `Sunset: <fecha UTC>`
  - `Link: </api/centinela-banco-pruebas/auditoria>; rel="successor-version"`
  - `Warning: 299 ...`
  - `deprecation` en JSON de respuesta

## Fecha objetivo de sunset

- Default: `2026-12-31T23:59:59Z`
- Override por variable: `AUDITOR_LEGACY_SUNSET`
- Matriz recomendada por entorno: `src/auditor/MATRIZ_ENTORNOS_AUDITOR_LEGACY.md`

## Equivalencias recomendadas

- `GET /auditor/eventos` -> `GET /auditoria/eventos`
- `POST /auditor/eventos/registrar` -> `POST /auditoria/eventos/registrar`
- `GET /auditor/eventos/estadisticas` -> `GET /auditoria/estadisticas`

## Diferencias de contrato a considerar

- `/auditor/eventos` ahora devuelve:
  - `data`: items
  - `pagination`: total, limit, offset, hasMore
  - `deprecation`: metadata de migracion
- `/auditoria/eventos` devuelve `data` con estructura paginada completa (`items`, `total`, etc.)

## Checklist de migracion para clientes

1. Cambiar base path de `/auditor` a `/auditoria`.
2. Ajustar parseo de respuesta para usar `data.items` en endpoints paginados donde aplique.
3. Validar filtros soportados (`tipo`, `usuario`, `modulo`, `expedienteId`, `fechaInicio`, `fechaFin`, `limit`, `offset`).
4. Actualizar tests de integracion HTTP de clientes consumidores.
5. Monitorear logs durante 1 semana para detectar llamadas residuales a `/auditor`.
6. Eliminar consumo de `/auditor` antes de la fecha de sunset.

## Plan de retiro sugerido

1. Fase A (actual): deprecacion con compatibilidad.
2. Fase B: responder `410 Gone` para rutas `/auditor/*` en entorno de staging.
3. Fase C: remover `app.use('/api/centinela-banco-pruebas/auditor', ...)` en produccion.
