# Modulos Terminados - Definition of Done

## Alcance

Este documento fija el cierre formal de los modulos:
- clientes
- expedientes
- instalacion
- auditoria
- informes

## Criterios de cierre por modulo

### Clientes
- CRUD operativo en backend sin errores de contrato.
- Integracion con expediente y consultas relacionadas estable.
- Respuestas con shape consistente de exito/error.

### Expedientes
- Flujo de estados y transiciones validado por contratos.
- Persistencia de historial de estados estable.
- Endpoints HTTP criticos cubiertos por pruebas de contrato.

### Instalacion
- Inicio y reintento funcionales.
- Guardado de historial de configuracion con paginacion.
- Emision de auditoria durante el ciclo de instalacion.

### Auditoria
- Persistencia real via base de datos.
- Endpoint principal con filtros y paginacion.
- Ruta legacy de /auditor deprecada y con plan de sunset.

### Informes
- Historial de informes generado y consultable con paginacion.
- Metadata de generacion/descarga persistida.
- Contrato minimo de historial validado en CI.

## Evidencia tecnica de cierre

- Suite de contratos backend en verde: npm run test:contracts:all.
- CI full contracts activa en .github/workflows/backend-contracts.yml.
- CI quick quality activa en .github/workflows/backend-quick-quality.yml.
- Repositorio remoto inicializado y sincronizado en rama main.

## Estado

Estos modulos se consideran TERMINADOS para produccion inicial.
A partir de este punto solo aplican mejoras evolutivas y cambios de negocio nuevos.
