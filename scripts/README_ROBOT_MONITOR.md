# Monitor de produccion reutilizable para VMs

## Gate oficial de aceptacion pre-release

El comando oficial de salida operativa es unico y consolidado (backend + frontend):

```bash
cd backend
npm run ops:production:readiness
```

Criterio de aprobacion:

- Resultado final `PASS`.
- Reporte consolidado generado en `backend/temp/ops-readiness-*.md`.
- Reportes individuales generados en `backend/temp/ops-gate-backend-*.md` y `backend/temp/ops-gate-frontend-*.md`.

Si este gate falla, no se aprueba release ni despliegue.

## ⚡ Forma rápida: Script Orquestador

Todo en uno en la VM:

```bash
cd backend/scripts
chmod +x production-orquestador.sh

# Ejecutar TODO: setup + preflight + doctor + start + final-check
sudo ./production-orquestador.sh full

# O solo validar sin cambiar nada
./production-orquestador.sh check
```

## 📋 Opciones del Orquestador

```bash
./production-orquestador.sh setup       # Setup environment (root required)
./production-orquestador.sh preflight   # Validate preflight
./production-orquestador.sh doctor      # Run doctor checks
./production-orquestador.sh start       # Start monitor session
./production-orquestador.sh check       # Final pre-operation check (30 seg)
./production-orquestador.sh restart     # Restart monitor
./production-orquestador.sh status      # Show session status
./production-orquestador.sh logs        # Attach to monitor logs
./production-orquestador.sh help        # Show help
```

## 🔧 Forma manual (si necesitas control fino)

```bash
cd backend/scripts

# 1. Setup (solo una vez)
sudo ./setup-ubuntu-robot.sh luis

# 2. Validar antes de operacion
./preflight-production.sh monitor_production
./monitor-production-pretty.sh doctor monitor_production

# 3. Arrancar monitor
./monitor-production-pretty.sh start monitor_production

# Opcional: forzar layout
MONITOR_LAYOUT=multitail ./monitor-production-pretty.sh start monitor_production
MONITOR_LAYOUT=fallback ./monitor-production-pretty.sh start monitor_production

# 4. Verificacion final antes de operacion (30 seg)
./final-check.sh monitor_production

# Smoke por pack (opcional pero recomendado)
EXPECTED_PACK=pack_web NGINX_HTTP_PORT=80 POSTGRES_DB_NAME=centinela_app ./final-check.sh monitor_production
EXPECTED_PACK=pack_dominio DOMINIO_ESPERADO=empresa.local DHCP_RANGO_INICIO=192.168.1.100 DHCP_RANGO_FIN=192.168.1.200 ./final-check.sh monitor_production

# Endurecimiento opcional (produccion estricta)
FINAL_CHECK_FAIL_ON_LOCKS=1 ./final-check.sh monitor_production
FINAL_CHECK_REQUIRE_ROBOT_SSH=1 ROBOT_HOST=10.0.0.12 ROBOT_USER=centinela ./final-check.sh monitor_production
```

## 🎯 Comandos útiles del monitor

```bash
./monitor-production-pretty.sh status    # Ver estado
./monitor-production-pretty.sh attach    # Ver logs en vivo
./monitor-production-pretty.sh restart   # Reiniciar sesión
./monitor-production-pretty.sh locks     # Ver locks apt/dpkg
./monitor-production-pretty.sh doctor    # Diagnóstico
./monitor-production-pretty.sh stop      # Detener
```

## 📋 Runbook de Contingencia

Consultar guía rápida:

```bash
cat RUNBOOK_CONTINGENCIA_PRODUCCION.md
```

## 🧪 Preflight: Variables y códigos de salida

`preflight-production.sh` ahora soporta parametros de robustez y observabilidad adicionales.

### Variables de entorno

```bash
# Health endpoint a validar
HEALTH_URL=http://localhost:3012/api/centinela-banco-pruebas/estado

# Timeout por intento (segundos). Default: 5
HEALTH_TIMEOUT_SECS=5

# Reintentos de health check. Default: 2
HEALTH_RETRIES=2

# Espera entre reintentos de health (segundos). Default: 1
HEALTH_RETRY_DELAY_SECS=1

# Omitir health check backend (0|1). Default: 0
SKIP_BACKEND_CHECK=0

# Permitir locks apt/dpkg sin fallar (0|1). Default: 0
ALLOW_APT_LOCKS=0

# Modo de salida: legacy|typed. Default: legacy
EXIT_CODE_MODE=legacy

# Si es 1, cualquier warning convierte el preflight en fallo. Default: 0
STRICT_WARNINGS=0

# Si es 1, ejecuta perfil minimo (solo HTTP + politicas). Default: 0
PREFLIGHT_MINIMAL=0

# Minimos de recursos (MB)
MIN_DISK_MB=2048
MIN_MEM_MB=256
```

Notas de validacion:

- Si `HEALTH_TIMEOUT_SECS`, `HEALTH_RETRIES`, `HEALTH_RETRY_DELAY_SECS`, `MIN_DISK_MB` o `MIN_MEM_MB` vienen invalidos (`0`, vacio, texto), el script emite `[WARN]` y usa el default seguro.
- Si `EXIT_CODE_MODE` no es `legacy` ni `typed`, el script emite `[WARN]` y usa `legacy`.
- Si `STRICT_WARNINGS=1`, cualquier warning al final del preflight marca fallo.
- Si `PREFLIGHT_MINIMAL=1`, el preflight corre solo checks minimos (HTTP/politicas) para pruebas deterministas o CI ligero.

### Ejemplos

```bash
# Ejecución normal (legacy): cualquier fallo -> exit 1
./preflight-production.sh monitor_production

# Con timeout/reintentos custom
HEALTH_TIMEOUT_SECS=3 HEALTH_RETRIES=3 ./preflight-production.sh monitor_production

# Con delay entre reintentos (arranque backend lento)
HEALTH_TIMEOUT_SECS=3 HEALTH_RETRIES=4 HEALTH_RETRY_DELAY_SECS=2 ./preflight-production.sh monitor_production

# Modo tipado para pipelines CI/automatización
EXIT_CODE_MODE=typed ./preflight-production.sh monitor_production

# Modo estricto: warnings tambien fallan
EXIT_CODE_MODE=typed STRICT_WARNINGS=1 ./preflight-production.sh monitor_production
```

### Pruebas rápidas Linux/WSL (recomendado)

Ejecuta estas pruebas desde `backend/scripts` para validar comportamiento del hardening:

```bash
# 1) Normalización de enteros inválidos + warning
HEALTH_TIMEOUT_SECS=abc HEALTH_RETRIES=0 HEALTH_RETRY_DELAY_SECS=x MIN_DISK_MB=0 MIN_MEM_MB=foo SKIP_BACKEND_CHECK=1 ./preflight-production.sh monitor_production

# Esperado:
# - Varias líneas [WARN] invalid ... using default
# - Summary con WARN > 0
# - Exit 0 (si el resto de checks del host están correctos)

# 2) EXIT_CODE_MODE inválido cae a legacy
EXIT_CODE_MODE=custom SKIP_BACKEND_CHECK=1 ./preflight-production.sh monitor_production

# Esperado:
# - [WARN] invalid EXIT_CODE_MODE='custom'; using legacy

# 3) Reintentos con delay explícito (backend lento/no disponible)
HEALTH_TIMEOUT_SECS=1 HEALTH_RETRIES=3 HEALTH_RETRY_DELAY_SECS=2 HEALTH_URL=http://127.0.0.1:65535/health ./preflight-production.sh monitor_production

# Esperado:
# - Mensajes de reintento con "retrying in 2s"
# - Falla final de backend tras 3 intentos

# 4) Códigos tipados por categoría
EXIT_CODE_MODE=typed HEALTH_URL=http://127.0.0.1:65535/health ./preflight-production.sh monitor_production; echo "exit=$?"

# Esperado:
# - Failure category: backend
# - exit=21
```

### Smoke test dedicado (exit 27 por modo estricto)

Script incluido:

```bash
chmod +x preflight-smoke-strict.sh
./preflight-smoke-strict.sh
```

Comportamiento:

- Ejecuta `preflight-production.sh` en `PREFLIGHT_MINIMAL=1`.
- Fuerza warning controlado (`HEALTH_RETRIES=0`) con `STRICT_WARNINGS=1`.
- Valida que la salida tipada sea exactamente `27`.

### Salida tipada (`EXIT_CODE_MODE=typed`)

En modo `typed`, si hay fallo el script devuelve según la primera categoría fallida:

- `21`: `backend`
- `22`: `prereq`
- `23`: `scripts`
- `24`: `resource`
- `25`: `security`
- `26`: `network`
- `27`: `strict` (warnings bloqueados por politica)

En modo `legacy` se preserva comportamiento histórico: cualquier fallo devuelve `1`.

### Observabilidad de salida

Cada línea `[OK]`, `[WARN]`, `[FAIL]` incluye timestamp y al final se imprime:

- `Duration: <segundos>`
- `Failure category: <categoria|none>`
- `Summary: FAIL=<n> WARN=<n>`

## 🤖 Integración CI rápida

Para automatizar validaciones del preflight con diagnóstico claro, usa `EXIT_CODE_MODE=typed` y trata los códigos `21-26` como categorías de error.

### Ejemplo GitHub Actions (self-hosted Linux/VM)

```yaml
name: preflight-production

on:
	workflow_dispatch:

jobs:
	preflight:
		runs-on: self-hosted
		steps:
			- name: Checkout
				uses: actions/checkout@v4

			- name: Make scripts executable
				run: chmod +x backend/scripts/*.sh

			- name: Run preflight typed
				run: |
					cd backend/scripts
					EXIT_CODE_MODE=typed \
					HEALTH_TIMEOUT_SECS=5 \
					HEALTH_RETRIES=2 \
					./preflight-production.sh monitor_production
```

### Ejemplo GitHub Actions (runner Ubuntu genérico)

Si en CI no quieres depender del backend local del runner, puedes omitir ese check:

```yaml
- name: Run preflight typed without backend check
	run: |
		cd backend/scripts
		EXIT_CODE_MODE=typed \
		SKIP_BACKEND_CHECK=1 \
		./preflight-production.sh monitor_production
```

### Lectura rápida de códigos de salida

- `21`: backend no saludable o payload inválido
- `22`: prerequisitos faltantes (comandos base)
- `23`: scripts de soporte ausentes/no legibles
- `24`: recursos insuficientes o locks apt/dpkg
- `25`: requisitos de seguridad (sudo/logs)
- `26`: conectividad de red/SSH robot
- `27`: warning(s) detectados con `STRICT_WARNINGS=1`
