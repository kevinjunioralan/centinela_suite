# Runbook de contingencia para demo

Objetivo: responder rapido cuando algo se sale del guion, sin romper el entorno y sin mostrar errores visibles.

## 1) Antes de iniciar demo

```bash
cd backend/scripts
./preflight-demo.sh monitor_demo
./monitor-demo-pretty.sh doctor monitor_demo
```

Si falla preflight, no iniciar instalacion. Corregir primero y volver a correr.

## 2) Arranque recomendado

```bash
export MONITOR_LAYOUT=auto
./monitor-demo-pretty.sh start monitor_demo
```

Si quieres forzar layout:

```bash
MONITOR_LAYOUT=multitail ./monitor-demo-pretty.sh start monitor_demo
MONITOR_LAYOUT=fallback ./monitor-demo-pretty.sh start monitor_demo
```

En otra terminal:

```bash
curl -fsS http://localhost:3012/api/centinela-banco-pruebas/salud
```

## 3) Si el monitor se cae o se cierra

```bash
./monitor-demo-pretty.sh restart monitor_demo
```

Si solo se cerro la vista:

```bash
./monitor-demo-pretty.sh attach monitor_demo
```

## 4) Si aparece bloqueo de apt/dpkg

```bash
./monitor-demo-pretty.sh locks monitor_demo
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
./monitor-demo-pretty.sh status monitor_demo
./monitor-demo-pretty.sh locks monitor_demo
```

## 7) Cierre limpio

```bash
./monitor-demo-pretty.sh stop monitor_demo
```

## 8) Smoke E2E post-instalacion por pack

Pack Web:

```bash
EXPECTED_PACK=pack_web \
NGINX_HTTP_PORT=80 \
POSTGRES_DB_NAME=centinela_app \
./final-check.sh monitor_demo
```

Pack Dominio:

```bash
EXPECTED_PACK=pack_dominio \
DOMINIO_ESPERADO=empresa.local \
DHCP_RANGO_INICIO=192.168.1.100 \
DHCP_RANGO_FIN=192.168.1.200 \
./final-check.sh monitor_demo
```

No ejecutar acciones destructivas durante evaluacion, salvo que se pidan explicitamente.
