# Runbook de contingencia para produccion

Objetivo: responder rapido cuando algo se sale del guion, sin romper el entorno y sin mostrar errores visibles.

## 1) Antes de iniciar operacion

```bash
cd backend/scripts
./preflight-production.sh monitor_production
./monitor-production-pretty.sh doctor monitor_production
```

Si falla preflight, no iniciar instalacion. Corregir primero y volver a correr.

## 2) Arranque recomendado

```bash
export MONITOR_LAYOUT=auto
./monitor-production-pretty.sh start monitor_production
```

Si quieres forzar layout:

```bash
MONITOR_LAYOUT=multitail ./monitor-production-pretty.sh start monitor_production
MONITOR_LAYOUT=fallback ./monitor-production-pretty.sh start monitor_production
```

En otra terminal:

```bash
curl -fsS http://localhost:3012/api/centinela-banco-pruebas/salud
```

## 3) Si el monitor se cae o se cierra

```bash
./monitor-production-pretty.sh restart monitor_production
```

Si solo se cerro la vista:

```bash
./monitor-production-pretty.sh attach monitor_production
```

## 4) Si aparece bloqueo de apt/dpkg

```bash
./monitor-production-pretty.sh locks monitor_production
```

Esperar a que termine el proceso que retiene lock. Evitar matar procesos si hay instalacion en curso.

## 5) Si backend no responde

1. Mostrar que hay deteccion de fallo con preflight.
2. Relanzar backend de forma controlada.
3. Verificar endpoint de salud antes de continuar.

Comando de chequeo:

```bash
curl -i http://localhost:3012/api/centinela-banco-pruebas/salud
```

## 6) Si tribunal pide acciones fuera de instalacion

Respuesta puente recomendada:

"Esa parte no forma parte del alcance evaluado hoy. Para mostrar robustez, aqui tienen trazabilidad en vivo, salud del servicio y control de contingencia sin romper el entorno."

Luego mostrar:

```bash
./monitor-production-pretty.sh status monitor_production
./monitor-production-pretty.sh locks monitor_production
```

## 7) Cierre limpio

```bash
./monitor-production-pretty.sh stop monitor_production
```

## 8) Smoke E2E post-instalacion por pack

Pack Web:

```bash
EXPECTED_PACK=pack_web \
NGINX_HTTP_PORT=80 \
POSTGRES_DB_NAME=centinela_app \
./final-check.sh monitor_production
```

Pack Dominio:

```bash
EXPECTED_PACK=pack_dominio \
DOMINIO_ESPERADO=empresa.local \
DHCP_RANGO_INICIO=192.168.1.100 \
DHCP_RANGO_FIN=192.168.1.200 \
./final-check.sh monitor_production
```

## 9) Ensayo de contingencia (semanal o pre-release)

Ejecutar siempre desde `backend` para validar deteccion y recuperacion antes de aprobar salida:

```bash
npm run ops:production:readiness
```

Escenario A - Locks apt/dpkg detectados en modo estricto CI:

```bash
cd backend/scripts
CI=1 FINAL_CHECK_FAIL_ON_LOCKS=1 ./final-check.sh monitor_production
```

Esperado:

- Si hay locks activos, el check debe fallar explicitamente.
- Al liberar locks y repetir, el check vuelve a estado saludable.

Escenario B - Backend no disponible:

```bash
cd backend/scripts
HEALTH_URL=http://127.0.0.1:65535/estado EXIT_CODE_MODE=typed ./preflight-production.sh monitor_production; echo "exit=$?"
```

Esperado:

- El preflight debe marcar categoria `backend`.
- En modo tipado el codigo de salida esperado es `21`.

Escenario C - SSH intermitente o no alcanzable:

```bash
cd backend/scripts
FINAL_CHECK_REQUIRE_ROBOT_SSH=1 ROBOT_HOST=10.255.255.1 ROBOT_USER=centinela ./final-check.sh monitor_production
```

Esperado:

- Si no hay conectividad, el check debe fallar con mensaje claro de SSH.
- Con conectividad restablecida, el check vuelve a `OK`.

Criterio de cierre del ensayo:

- Deteccion en menos de 2 minutos por escenario.
- Evidencia trazable en consola y reportes de `backend/temp`.
- Recuperacion confirmada en nueva corrida de `npm run ops:production:readiness`.

No ejecutar acciones destructivas durante evaluacion, salvo que se pidan explicitamente.
