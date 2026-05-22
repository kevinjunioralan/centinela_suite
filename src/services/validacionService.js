const Expediente = require('../expediente/models/Expediente');
const { Client } = require('ssh2');

// Scripts de simulación para cada pack
const SCRIPTS_SIMULACION = {
  pack_web: {
    nombre: 'Simulador Web',
    duracionRecomendada: 24,
    scripts: [
      {
        nombre: 'simulador_web.sh',
        ruta: '/usr/local/bin/simulador_web.sh',
        contenido: `#!/bin/bash
# Simulador de carga para servidor web
LOG_FILE="/var/log/simulador_web.log"

echo "🚀 Iniciando simulador Web - $(date)" >> $LOG_FILE

while true; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost)
  HTTP_TIME=$(curl -s -o /dev/null -w "%{time_total}" http://localhost)
  PG_RESULT=$(echo "SELECT 1" | sudo -u postgres psql -tA 2>/dev/null)
  REDIS_PONG=$(redis-cli ping 2>/dev/null)
  NODE_VERSION=$(node --version 2>/dev/null)
  
  echo "{\"timestamp\":\"$(date -Iseconds)\",\"http_code\":$HTTP_CODE,\"http_time\":$HTTP_TIME,\"pg\":\"$PG_RESULT\",\"redis\":\"$REDIS_PONG\",\"node\":\"$NODE_VERSION\"}" >> $LOG_FILE
  sleep 10
done`,
        permisos: '0755'
      },
      {
        nombre: 'simulador_web.service',
        ruta: '/etc/systemd/system/simulador_web.service',
        contenido: `[Unit]
Description=Simulador de carga para servidor web
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/simulador_web.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target`,
        permisos: '0644'
      }
    ],
    pruebas: [
      { nombre: 'HTTP Server', comando: 'curl -s -o /dev/null -w "%{http_code}" http://localhost', esperado: '200', timeout: 10000, nivel: 'critico', ponderacion: 25 },
      { nombre: 'PostgreSQL', comando: 'echo "SELECT 1" | sudo -u postgres psql -tA', esperado: '1', timeout: 10000, nivel: 'critico', ponderacion: 25 },
      { nombre: 'Redis', comando: 'redis-cli ping', esperado: 'PONG', timeout: 5000, nivel: 'critico', ponderacion: 25 },
      { nombre: 'Node.js', comando: 'node --version', esperado: 'v', timeout: 5000, nivel: 'critico', ponderacion: 25 }
    ]
  },
  
  pack_dominio: {
    nombre: 'Simulador Dominio',
    duracionRecomendada: 48,
    scripts: [
      {
        nombre: 'simulador_dominio.sh',
        ruta: '/usr/local/bin/simulador_dominio.sh',
        contenido: `#!/bin/bash
LOG_FILE="/var/log/simulador_dominio.log"
echo "🚀 Iniciando simulador Dominio - $(date)" >> $LOG_FILE

while true; do
  DIG_RESULT=$(dig @localhost ejemplo.com +short 2>/dev/null)
  DHCP_SIM="OK"
  SAMBA_CHECK=$(smbclient -L localhost -N 2>&1 | grep -q "Share" && echo "OK" || echo "FAIL")
  KERBEROS_CHECK=$(klist 2>&1 | grep -q "Ticket cache" && echo "OK" || echo "FAIL")
  
  echo "{\"timestamp\":\"$(date -Iseconds)\",\"dns\":\"$DIG_RESULT\",\"dhcp\":\"$DHCP_SIM\",\"samba\":\"$SAMBA_CHECK\",\"kerberos\":\"$KERBEROS_CHECK\"}" >> $LOG_FILE
  sleep 15
done`,
        permisos: '0755'
      },
      {
        nombre: 'simulador_dominio.service',
        ruta: '/etc/systemd/system/simulador_dominio.service',
        contenido: `[Unit]
Description=Simulador de carga para servidor de dominio
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/simulador_dominio.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target`,
        permisos: '0644'
      }
    ],
    pruebas: [
      { nombre: 'DNS', comando: 'dig @localhost ejemplo.com +short', esperado: '', timeout: 10000, nivel: 'critico', ponderacion: 35 },
      { nombre: 'Samba', comando: 'smbclient -L localhost -N 2>&1 | grep -q "Share" && echo "OK"', esperado: 'OK', timeout: 10000, nivel: 'critico', ponderacion: 35 },
      { nombre: 'Kerberos', comando: 'klist 2>&1 | grep -q "Ticket cache" && echo "OK"', esperado: 'OK', timeout: 5000, nivel: 'normal', ponderacion: 15 },
      { nombre: 'DHCP', comando: 'systemctl is-active isc-dhcp-server', esperado: 'active', timeout: 5000, nivel: 'normal', ponderacion: 15 }
    ]
  },
  
  pack_cortafuegos: {
    nombre: 'Simulador Cortafuegos',
    duracionRecomendada: 24,
    scripts: [
      {
        nombre: 'simulador_cortafuegos.sh',
        ruta: '/usr/local/bin/simulador_cortafuegos.sh',
        contenido: `#!/bin/bash
LOG_FILE="/var/log/simulador_cortafuegos.log"
echo "🚀 Iniciando simulador Cortafuegos - $(date)" >> $LOG_FILE

while true; do
  IPTABLES_CHECK=$(dpkg -l | grep -c "iptables")
  FAIL2BAN_CHECK=$(dpkg -l | grep -c "fail2ban")
  NFTABLES_CHECK=$(dpkg -l | grep -c "nftables")
  
  echo "{\"timestamp\":\"$(date -Iseconds)\",\"iptables\":$IPTABLES_CHECK,\"fail2ban\":$FAIL2BAN_CHECK,\"nftables\":$NFTABLES_CHECK}" >> $LOG_FILE
  sleep 10
done`,
        permisos: '0755'
      },
      {
        nombre: 'simulador_cortafuegos.service',
        ruta: '/etc/systemd/system/simulador_cortafuegos.service',
        contenido: `[Unit]
Description=Simulador de carga para servidor cortafuegos
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/simulador_cortafuegos.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target`,
        permisos: '0644'
      }
    ],
    pruebas: [
      { nombre: 'Iptables', comando: 'dpkg -l | grep -q "iptables" && echo "OK"', esperado: 'OK', timeout: 10000, nivel: 'critico', ponderacion: 35 },
      { nombre: 'Fail2ban', comando: 'dpkg -l | grep -q "fail2ban" && echo "OK"', esperado: 'OK', timeout: 10000, nivel: 'critico', ponderacion: 35 },
      { nombre: 'Nftables', comando: 'dpkg -l | grep -q "nftables" && echo "OK"', esperado: 'OK', timeout: 10000, nivel: 'normal', ponderacion: 30 }
    ]
  },
  
  pack_correo: {
    nombre: 'Simulador Correo',
    duracionRecomendada: 48,
    scripts: [
      {
        nombre: 'simulador_correo.sh',
        ruta: '/usr/local/bin/simulador_correo.sh',
        contenido: `#!/bin/bash
LOG_FILE="/var/log/simulador_correo.log"
echo "🚀 Iniciando simulador Correo - $(date)" >> $LOG_FILE

while true; do
  POSTFIX_CHECK=$(dpkg -l | grep -c "postfix")
  DOVECOT_CHECK=$(dpkg -l | grep -c "dovecot-core")
  
  echo "{\"timestamp\":\"$(date -Iseconds)\",\"postfix\":$POSTFIX_CHECK,\"dovecot\":$DOVECOT_CHECK}" >> $LOG_FILE
  sleep 15
done`,
        permisos: '0755'
      },
      {
        nombre: 'simulador_correo.service',
        ruta: '/etc/systemd/system/simulador_correo.service',
        contenido: `[Unit]
Description=Simulador de carga para servidor de correo
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/simulador_correo.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target`,
        permisos: '0644'
      }
    ],
    pruebas: [
      { nombre: 'Postfix', comando: 'dpkg -l | grep -q "postfix" && echo "OK"', esperado: 'OK', timeout: 10000, nivel: 'critico', ponderacion: 40 },
      { nombre: 'Dovecot', comando: 'dpkg -l | grep -q "dovecot-core" && echo "OK"', esperado: 'OK', timeout: 10000, nivel: 'critico', ponderacion: 40 },
      { nombre: 'SpamAssassin', comando: 'dpkg -l | grep -q "spamassassin" && echo "OK"', esperado: 'OK', timeout: 10000, nivel: 'normal', ponderacion: 10 },
      { nombre: 'ClamAV', comando: 'dpkg -l | grep -q "clamav" && echo "OK"', esperado: 'OK', timeout: 10000, nivel: 'normal', ponderacion: 10 }
    ]
  },
  
  // 🔥 PACK MONITOREO - SIN GRAFANA
  pack_monitoreo: {
    nombre: 'Simulador Monitoreo',
    duracionRecomendada: 24,
    scripts: [
      {
        nombre: 'simulador_monitoreo.sh',
        ruta: '/usr/local/bin/simulador_monitoreo.sh',
        contenido: `#!/bin/bash
LOG_FILE="/var/log/simulador_monitoreo.log"
echo "🚀 Iniciando simulador Monitoreo - $(date)" >> $LOG_FILE

while true; do
  PROMETHEUS_CHECK=$(dpkg -l | grep -c "prometheus")
  EXPORTER_CHECK=$(dpkg -l | grep -c "prometheus-node-exporter")
  
  echo "{\"timestamp\":\"$(date -Iseconds)\",\"prometheus\":$PROMETHEUS_CHECK,\"exporter\":$EXPORTER_CHECK}" >> $LOG_FILE
  sleep 10
done`,
        permisos: '0755'
      },
      {
        nombre: 'simulador_monitoreo.service',
        ruta: '/etc/systemd/system/simulador_monitoreo.service',
        contenido: `[Unit]
Description=Simulador de carga para servidor de monitoreo
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/simulador_monitoreo.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target`,
        permisos: '0644'
      }
    ],
    pruebas: [
      { nombre: 'Prometheus', comando: 'dpkg -l | grep -q "prometheus" && echo "OK"', esperado: 'OK', timeout: 10000, nivel: 'critico', ponderacion: 60 },
      { nombre: 'Node Exporter', comando: 'dpkg -l | grep -q "prometheus-node-exporter" && echo "OK"', esperado: 'OK', timeout: 10000, nivel: 'critico', ponderacion: 40 }
    ]
  }
};

class ValidacionService {
  
  async iniciarValidacion(expedienteId) {
    const expediente = await Expediente.findById(expedienteId);
    if (!expediente) throw new Error('Expediente no encontrado');
    
    const packTipo = expediente.instalacion?.packSeleccionado;
    if (!packTipo || !SCRIPTS_SIMULACION[packTipo]) {
      throw new Error(`No hay scripts de simulación para el pack: ${packTipo}`);
    }
    
    expediente.validacion = {
      estado: 'en_progreso',
      packTipo: packTipo,
      fechaInicio: new Date(),
      enProgreso: true,
      progreso: 0,
      pruebasEjecutadas: 0,
      pruebasExitosas: 0,
      pruebasFallidas: 0,
      score: 0,
      logs: [{
        timestamp: new Date(),
        mensaje: `🚀 Iniciando simulación para ${SCRIPTS_SIMULACION[packTipo].nombre}`,
        tipo: 'info'
      }],
      metricas: {
        cpuPromedio: 0, cpuMax: 0, ramPromedio: 0, ramMax: 0,
        tiempoRespuestaPromedio: 0, tiempoRespuestaMax: 0
      }
    };
    
    await expediente.save();
    this._ejecutarValidacion(expedienteId);
    return { success: true, message: 'Validación iniciada' };
  }
  
  async _ejecutarValidacion(expedienteId) {
    const expediente = await Expediente.findById(expedienteId);
    if (!expediente) return;
    
    const packTipo = expediente.validacion.packTipo;
    const pack = SCRIPTS_SIMULACION[packTipo];
    let instalador = null;
    
    try {
      instalador = new SSHInstalador(expediente.servidor);
      await instalador.conectar();
      await instalador.configurarSudoSinPassword();
      
      expediente.validacion.logs.push({
        timestamp: new Date(),
        mensaje: '✅ Conexión SSH establecida',
        tipo: 'exito'
      });
      await expediente.save();
      
      for (const script of pack.scripts) {
        expediente.validacion.logs.push({
          timestamp: new Date(),
          mensaje: `📤 Subiendo ${script.nombre}...`,
          tipo: 'info'
        });
        await expediente.save();
        await instalador.subirScript(script.ruta, script.contenido, script.permisos);
      }
      
      let servicioNombre = 'simulador_web';
      if (packTipo === 'pack_web') servicioNombre = 'simulador_web';
      else if (packTipo === 'pack_dominio') servicioNombre = 'simulador_dominio';
      else if (packTipo === 'pack_cortafuegos') servicioNombre = 'simulador_cortafuegos';
      else if (packTipo === 'pack_correo') servicioNombre = 'simulador_correo';
      else if (packTipo === 'pack_monitoreo') servicioNombre = 'simulador_monitoreo';
      
      await instalador.ejecutarComando('systemctl daemon-reload');
      await instalador.ejecutarComando(`systemctl enable ${servicioNombre}`);
      await instalador.ejecutarComando(`systemctl start ${servicioNombre}`);
      
      expediente.validacion.logs.push({
        timestamp: new Date(),
        mensaje: `✅ Simulador ${pack.nombre} iniciado correctamente`,
        tipo: 'exito'
      });
      await expediente.save();
      
      await this._monitorearValidacion(expedienteId, instalador, pack);
      
    } catch (error) {
      console.error('Error en validación:', error);
      expediente.validacion.estado = 'fallo';
      expediente.validacion.enProgreso = false;
      expediente.validacion.logs.push({
        timestamp: new Date(),
        mensaje: `❌ Error en validación: ${error.message}`,
        tipo: 'error'
      });
      await expediente.save();
      if (instalador) await instalador.cerrar();
    }
  }
  
  async _monitorearValidacion(expedienteId, instalador, pack) {
    const expediente = await Expediente.findById(expedienteId);
    if (!expediente) return;
    
    const maxRondas = 10;
    let rondas = 0;
    let pruebasEjecutadas = 0;
    let pruebasExitosas = 0;
    let sumaTiemposRespuesta = 0;
    let maxTiempoRespuesta = 0;
    const inicio = Date.now();
    
    let puntuacionMaximaTotal = 0;
    for (const prueba of pack.pruebas) {
      puntuacionMaximaTotal += prueba.ponderacion || 10;
    }
    
    while (rondas < maxRondas && expediente.validacion.enProgreso) {
      rondas++;
      let puntuacionTotalRonda = 0;
      
      for (const prueba of pack.pruebas) {
        pruebasEjecutadas++;
        const inicioPrueba = Date.now();
        const ponderacion = prueba.ponderacion || 10;
        
        try {
          const { stdout, code } = await instalador.ejecutarComando(prueba.comando, prueba.timeout || 30000);
          const tiempoRespuesta = Date.now() - inicioPrueba;
          
          let exitoso = false;
          if (prueba.esperado === '') {
            exitoso = code === 0;
          } else {
            exitoso = stdout.includes(prueba.esperado);
          }
          
          if (exitoso) {
            pruebasExitosas++;
            sumaTiemposRespuesta += tiempoRespuesta;
            if (tiempoRespuesta > maxTiempoRespuesta) maxTiempoRespuesta = tiempoRespuesta;
            puntuacionTotalRonda += ponderacion;
          }
        } catch (error) {
          console.log(`Prueba fallida: ${prueba.nombre} - ${error.message}`);
        }
      }
      
      const scoreActual = Math.round((puntuacionTotalRonda / puntuacionMaximaTotal) * 100);
      const progreso = Math.round((rondas / maxRondas) * 100);
      
      expediente.validacion.pruebasEjecutadas = pruebasEjecutadas;
      expediente.validacion.pruebasExitosas = pruebasExitosas;
      expediente.validacion.pruebasFallidas = pruebasEjecutadas - pruebasExitosas;
      expediente.validacion.score = scoreActual;
      expediente.validacion.progreso = progreso;
      expediente.validacion.metricas.tiempoRespuestaPromedio = Math.round(sumaTiemposRespuesta / pruebasExitosas) || 0;
      expediente.validacion.metricas.tiempoRespuestaMax = maxTiempoRespuesta;
      
      await this._actualizarMetricasSistema(expedienteId, instalador);
      await expediente.save();
      
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    const scoreFinal = expediente.validacion.score;
    let recomendacion = '';
    if (scoreFinal >= 90) recomendacion = '✅ Servidor aprobado - Listo para entrega al cliente';
    else if (scoreFinal >= 70) recomendacion = '⚠️ Servidor con observaciones - Revisar antes de entregar';
    else recomendacion = '❌ Servidor no aprobado - Requiere revisión completa';
    
    let servicioNombre = 'simulador_web';
    if (pack === SCRIPTS_SIMULACION.pack_web) servicioNombre = 'simulador_web';
    else if (pack === SCRIPTS_SIMULACION.pack_dominio) servicioNombre = 'simulador_dominio';
    else if (pack === SCRIPTS_SIMULACION.pack_cortafuegos) servicioNombre = 'simulador_cortafuegos';
    else if (pack === SCRIPTS_SIMULACION.pack_correo) servicioNombre = 'simulador_correo';
    else if (pack === SCRIPTS_SIMULACION.pack_monitoreo) servicioNombre = 'simulador_monitoreo';
    
    await instalador.ejecutarComando(`systemctl stop ${servicioNombre}`);
    await instalador.ejecutarComando(`systemctl disable ${servicioNombre}`);
    
    expediente.validacion.estado = 'completado';
    expediente.validacion.enProgreso = false;
    expediente.validacion.fechaFin = new Date();
    expediente.validacion.duracionHoras = (Date.now() - inicio) / 1000 / 60 / 60;
    expediente.validacion.score = scoreFinal;
    expediente.validacion.recomendacion = recomendacion;
    expediente.validacion.logs.push({
      timestamp: new Date(),
      mensaje: `🏁 Validación completada. Score: ${scoreFinal}%. ${recomendacion}`,
      tipo: scoreFinal >= 90 ? 'exito' : (scoreFinal >= 70 ? 'info' : 'error')
    });
    
    await expediente.save();
    await instalador.cerrar();
    console.log(`✅ Validación completada para ${expedienteId}. Score: ${scoreFinal}%`);
  }
  
  async _actualizarMetricasSistema(expedienteId, instalador) {
    const expediente = await Expediente.findById(expedienteId);
    if (!expediente) return;
    
    try {
      const { stdout: cpuStdout } = await instalador.ejecutarComando(
        "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1"
      );
      let cpu = parseFloat(cpuStdout);
      if (isNaN(cpu)) {
        const { stdout: cpuAlt } = await instalador.ejecutarComando(
          "grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}'"
        );
        cpu = parseFloat(cpuAlt);
      }
      
      const { stdout: ramStdout } = await instalador.ejecutarComando(
        "free | grep Mem | awk '{print ($3/$2) * 100}'"
      );
      let ram = parseFloat(ramStdout);
      if (isNaN(ram)) {
        const { stdout: ramAlt } = await instalador.ejecutarComando(
          "vmstat -s | grep 'used memory' | awk '{print $1}' && vmstat -s | grep 'total memory' | awk '{print $1}'"
        );
        const parts = ramAlt.split('\n');
        if (parts.length >= 2) {
          const used = parseFloat(parts[0]);
          const total = parseFloat(parts[1]);
          ram = (used / total) * 100;
        }
      }
      
      cpu = isNaN(cpu) ? 0 : Math.min(100, Math.max(0, cpu));
      ram = isNaN(ram) ? 0 : Math.min(100, Math.max(0, ram));
      
      const metricas = expediente.validacion.metricas || {};
      const rondas = metricas.rondas || 0;
      metricas.cpuPromedio = metricas.cpuPromedio ? Math.round((metricas.cpuPromedio * rondas + cpu) / (rondas + 1)) : cpu;
      metricas.cpuMax = Math.max(metricas.cpuMax || 0, cpu);
      metricas.ramPromedio = metricas.ramPromedio ? Math.round((metricas.ramPromedio * rondas + ram) / (rondas + 1)) : ram;
      metricas.ramMax = Math.max(metricas.ramMax || 0, ram);
      metricas.rondas = (rondas || 0) + 1;
      
      expediente.validacion.metricas = metricas;
      await expediente.save();
      console.log(`📊 Métricas actualizadas - CPU: ${cpu}%, RAM: ${ram}%`);
    } catch (error) {
      console.error('Error obteniendo métricas del sistema:', error.message);
    }
  }
  
  async obtenerEstadoValidacion(expedienteId) {
    const expediente = await Expediente.findById(expedienteId).select('validacion');
    return expediente?.validacion || {};
  }
}

// Clase auxiliar SSH
class SSHInstalador {
  constructor(servidor) {
    this.servidor = servidor;
    this.client = null;
  }
  
  async conectar() {
    return new Promise((resolve, reject) => {
      this.client = new Client();
      this.client.on('ready', () => {
        console.log(`✅ SSH conectado a ${this.servidor.ip}`);
        resolve();
      });
      this.client.on('error', (err) => reject(err));
      this.client.connect({
        host: this.servidor.ip,
        port: this.servidor.puerto || 22,
        username: this.servidor.usuario || 'root',
        password: this.servidor.password,
        readyTimeout: 30000
      });
    });
  }
  
  async configurarSudoSinPassword() {
    console.log('Configuring passwordless sudo check...');
    if (this.servidor.usuario === 'root') {
      console.log('Root user detected, sudo setup not required');
      return true;
    }
    
    const usuario = this.servidor.usuario;
    try {
      const { code } = await this.ejecutarComando('sudo -n true 2>&1');
      if (code === 0) {
        console.log('Passwordless sudo already configured');
        return true;
      }
    } catch (error) {
      // continue to explicit error below
    }

    throw new Error(
      `Passwordless sudo is not configured for '${usuario}'. Run backend/scripts/setup-ubuntu-robot.sh on the Ubuntu VM.`
    );
  }
  
  async ejecutarComando(comando, timeout = 60000) {
    return new Promise((resolve, reject) => {
      let cmd = comando;
      if (this.servidor.usuario !== 'root') {
        cmd = `sudo -n ${comando}`;
      }
      
      const timer = setTimeout(() => reject(new Error(`Timeout: ${comando}`)), timeout);
      
      this.client.exec(cmd, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          reject(err);
          return;
        }
        
        let stdout = '', stderr = '';
        stream.on('data', (data) => { stdout += data.toString(); });
        stream.stderr.on('data', (data) => { stderr += data.toString(); });
        stream.on('close', (code) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, code });
        });
      });
    });
  }
  
  async subirScript(ruta, contenido, permisos) {
    const tempFile = `/tmp/script_${Date.now()}.sh`;
    const contenidoEscapado = contenido.replace(/'/g, "'\\''");
    
    await this.ejecutarComando(`echo '${contenidoEscapado}' > ${tempFile}`);
    await this.ejecutarComando(`mkdir -p $(dirname ${ruta})`);
    await this.ejecutarComando(`mv ${tempFile} ${ruta}`);
    await this.ejecutarComando(`chmod ${permisos} ${ruta}`);
  }
  
  async cerrar() {
    if (this.client) this.client.end();
  }
}

module.exports = ValidacionService;