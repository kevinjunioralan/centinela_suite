# Matriz de entorno - auditor legacy

## Objetivo

Definir un rollout seguro para el flag `ENABLE_AUDITOR_LEGACY` y la fecha de sunset de la ruta legacy `/auditor`.

## Valores recomendados

| Entorno | ENABLE_AUDITOR_LEGACY | AUDITOR_LEGACY_SUNSET | ALLOW_AUDITORIA_PURGE |
|---|---|---|---|
| dev | true | 2026-12-31T23:59:59Z | false |
| staging | false | 2026-12-31T23:59:59Z | false |
| prod | false | 2026-12-31T23:59:59Z | false |

## Comportamiento esperado

- `ENABLE_AUDITOR_LEGACY=true`: mantiene `/auditor` con headers/payload de deprecacion.
- `ENABLE_AUDITOR_LEGACY=false`: `/auditor` responde `410 Gone` y apunta al sucesor `/auditoria`.
- `AUDITOR_LEGACY_SUNSET`: se publica en `Sunset` y en `deprecation.sunset`.

## Activacion rapida por entorno

1. Copiar variables desde `backend/.env.auditor-legacy.example` al `.env` del entorno.
2. Reiniciar servicio backend.
3. Verificar:
   - `GET /api/centinela-banco-pruebas/auditor/eventos`
   - headers `Deprecation`, `Sunset`, `Link`.
4. Si legacy esta deshabilitado, confirmar `410` y payload con `successor`.
