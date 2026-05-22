# Resumen del Código de Instalación de Servicios en Servidor

Este documento resume el código responsable de las instalaciones de servicios en servidores remotos, extraído del proyecto **monest-studio-v2**.

## 1. Instalador SSH Principal (InstalacionService.js)

**Ubicación:** `packages/centinela-banco-pruebas/backend/src/instalacion/InstalacionService.js`

### Clase InstaladorSSH

Clase principal para la instalación de paquetes en servidores remotos via SSH.

#### Métodos clave:

```javascript
// Conexión SSH al servidor
async conectar() // Establece conexión SSH usando ssh2.Client
async ejecutarComando(comando, timeout) // Ejecuta comandos remotos
async verificarInternet() // Verifica conectividad (ping 8.8.8.8)
async verificarEspacio() // Verifica espacio en disco (mínimo 5GB)
async actualizarRepositorios() // apt-get update -y
async configurarPostfixNoInteractivo() // Preconfiguración para paquetes interactivos
async instalarPaquete(paquete) // Instalación con DEBIAN_FRONTEND=noninteractive
async verificarInstalacion(paquete) // dpkg -l | grep o which
async desinstalarPaquete(paquete) // apt-get remove/purge
async limpiarDependencias() // apt-get autoremove -y && apt-get autoclean
async cerrar() // Cierra conexión SSH
```

#### Comando de instalación típico:
```bash
DEBIAN_FRONTEND=noninteractive apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" [paquete]
```

---

## 2. Instalaciones por Tipo de Servicio

### 2.1 Bases de Datos (RobotBDService.js)

**Ubicación:** `packages/centinela-banco-pruebas/backend/src/robot/RobotBDService.js`

#### Comandos de instalación:
```javascript
postgresql: 'apt-get install -y postgresql postgresql-contrib'
mysql: 'apt-get install -y mysql-server'  
mongodb: 'apt-get install -y mongodb'
```

---

### 2.2 Contenedores (RobotContenedoresService.js)

**Ubicación:** `packages/centinela-banco-pruebas/backend/src/robot/RobotContenedoresService.js`

#### Instalación de runtimes:
```javascript
docker: 'apt-get install -y docker.io && systemctl enable docker && systemctl start docker'
podman: 'apt-get install -y podman'
```

---

### 2.3 Hardware (RobotHardwareService.js)

**Ubicación:** `packages/centinela-banco-pruebas/backend/src/robot/RobotHardwareService.js`

#### Comandos de instalación:
```bash
apt-get update -qq
apt-get install -y -qq lm-sensors hddtemp smartmontools sysstat
sensors-detect --auto
```

---

### 2.4 Seguridad (RobotSeguridadService.js)

**Ubicación:** `packages/centinela-banco-pruebas/backend/src/robot/RobotSeguridadService.js`

#### Comandos de instalación:
```bash
apt-get update -qq
apt-get install -y -qq nmap hydra fail2ban
systemctl enable fail2ban && systemctl start fail2ban
```

---

### 2.5 Red (RobotRedService.js)

**Ubicación:** `packages/centinela-banco-pruebas/backend/src/robot/RobotRedService.js`

#### Verificación e instalación de herramientas:
```bash
which ping || apt-get install -y iputils-ping
which tc || apt-get install -y iproute2
which iperf3 || apt-get install -y iperf3
```

---

## 3. Flujo de Instalación REAL

El proceso de instalación sigue estos pasos en `_ejecutarInstalacionReal()`:

1. **Conexión SSH** - Conecta al servidor remoto
2. **Verificación Internet** - ping a 8.8.8.8
3. **Verificación Espacio** - mínimo 5GB libres
4. **Actualización repositorios** - apt-get update
5. **Instalación de paquetes** - uno por uno con verificación
6. **Verificación de servicios** - systemctl is-active
7. **Limpieza** - SSH cerrado, métricas guardadas

---

## 4. Gestión de Errores y Rollback

```javascript
// Si falla una instalación:
// 1. Marcar paquete como error
// 2. Ejecutar rollback de paquetes instalados previamente
// 3. Desinstalar en orden inverso
for (const pkg of paquetesInstalados.reverse()) {
  await instalador.desinstalarPaquete(pkg);
}
```

---

## Archivos Clave

| Archivo | Descripción |
|---------|-------------|
| `InstalacionService.js` | Servicio principal de instalación |
| `instalacion.routes.js` | Rutas API de instalación |
| `RobotBDService.js` | Simulación e instalación de BD |
| `RobotContenedoresService.js` | Simulación e instalación de contenedores |
| `RobotHardwareService.js` | Simulación e instalación de herramientas hardware |
| `RobotSeguridadService.js` | Simulación e instalación de herramientas seguridad |
| `RobotRedService.js` | Simulación e instalación de herramientas red |