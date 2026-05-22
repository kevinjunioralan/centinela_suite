# Monitor demo reutilizable para VMs

## ⚡ Forma rápida: Script Orquestador

Todo en uno en la VM:

```bash
cd backend/scripts
chmod +x demo-orquestador.sh

# Ejecutar TODO: setup + preflight + doctor + start + final-check
sudo ./demo-orquestador.sh full

# O solo validar sin cambiar nada
./demo-orquestador.sh check
```

## 📋 Opciones del Orquestador

```bash
./demo-orquestador.sh setup       # Setup environment (root required)
./demo-orquestador.sh preflight   # Validate preflight
./demo-orquestador.sh doctor      # Run doctor checks
./demo-orquestador.sh start       # Start monitor session
./demo-orquestador.sh check       # Final pre-demo check (30 seg)
./demo-orquestador.sh restart     # Restart monitor
./demo-orquestador.sh status      # Show session status
./demo-orquestador.sh logs        # Attach to monitor logs
./demo-orquestador.sh help        # Show help
```

## 🔧 Forma manual (si necesitas control fino)

```bash
cd backend/scripts

# 1. Setup (solo una vez)
sudo ./setup-ubuntu-robot.sh luis

# 2. Validar antes de demo
./preflight-demo.sh monitor_demo
./monitor-demo-pretty.sh doctor monitor_demo

# 3. Arrancar monitor
./monitor-demo-pretty.sh start monitor_demo

# Opcional: forzar layout
MONITOR_LAYOUT=multitail ./monitor-demo-pretty.sh start monitor_demo
MONITOR_LAYOUT=fallback ./monitor-demo-pretty.sh start monitor_demo

# 4. Justo antes que entre tribunal (30 seg)
./final-check.sh monitor_demo

# Smoke por pack (opcional pero recomendado)
EXPECTED_PACK=pack_web NGINX_HTTP_PORT=80 POSTGRES_DB_NAME=centinela_app ./final-check.sh monitor_demo
EXPECTED_PACK=pack_dominio DOMINIO_ESPERADO=empresa.local DHCP_RANGO_INICIO=192.168.1.100 DHCP_RANGO_FIN=192.168.1.200 ./final-check.sh monitor_demo
```

## 🎯 Comandos útiles del monitor

```bash
./monitor-demo-pretty.sh status    # Ver estado
./monitor-demo-pretty.sh attach    # Ver logs en vivo
./monitor-demo-pretty.sh restart   # Reiniciar sesión
./monitor-demo-pretty.sh locks     # Ver locks apt/dpkg
./monitor-demo-pretty.sh doctor    # Diagnóstico
./monitor-demo-pretty.sh stop      # Detener
```

## 📋 Runbook de Contingencia

Consultar guía rápida:

```bash
cat RUNBOOK_CONTINGENCIA_DEMO.md
```
