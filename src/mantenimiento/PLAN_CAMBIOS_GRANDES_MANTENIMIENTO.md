# Plan de Cambios Grandes - Mantenimiento

## Objetivo

Evolucionar el modulo de mantenimiento desde un esquema operativo basico hacia un flujo robusto, auditable y extensible.

## Baseline actual

- Rutas principales en mantenimiento.routes.js:
  - expedientes, estado, metricas, alertas, estadisticas
  - validacion iniciar/estado
  - reintentar
- Contratos existentes validan:
  - shape de metricas
  - normalizacion de fecha en alertas
  - inicio y progreso de validacion
- CustodiaService existe pero todavia simula metricas por interval local.

## Riesgos detectados

1. Demasiada logica de negocio en rutas (router gordo).
2. Validacion con simulacion temporal acoplada al request.
3. Reintento con efecto lateral directo y sin politica configurable.
4. Auditoria de mantenimiento mezclada con origen "oraculo".
5. Falta de capa de servicio dedicada para metricas/alertas/estadisticas.

## Objetivo de arquitectura

Separar por capas:
- MantenimientoController: HTTP y validacion de entrada.
- MantenimientoService: casos de uso.
- MantenimientoRepository: lecturas/escrituras de DB.
- MantenimientoPolicies: reglas de reintento y estados.

## Fase 1 (arranque recomendado)

1. Extraer casos de uso de mantenimiento.routes.js a MantenimientoService.
2. Unificar errores de dominio y codigos HTTP.
3. Estandarizar modulo de auditoria en eventos de mantenimiento.
4. Crear contratos para:
  - GET /estadisticas (shape estable)
  - POST /:id/reintentar (incremento de intentos + auditoria)

## Fase 2

1. Reemplazar simulacion de validacion por ejecutor desacoplado.
2. Definir estados de validacion y mantenimiento como enum central.
3. Agregar paginacion en endpoints de alertas y expedientes.

## Fase 3

1. Telemetria de SLA de custodia (latencia, disponibilidad, fallos).
2. Politica de reintentos configurable por entorno.
3. Hardening de concurrencia para operaciones repetidas sobre mismo expediente.

## Definition of Done del modulo mantenimiento (nueva fase)

- Router liviano y sin logica compleja incrustada.
- Casos criticos cubiertos por contratos.
- Auditoria consistente y trazable.
- Errores predecibles y shape uniforme.
- CI green en quick + full contracts.
