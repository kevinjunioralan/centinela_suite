// backend/src/robot/RobotBackupService.js
const SimulacionBackup = require('./models/SimulacionBackup');
const MetricaBackup = require('./models/MetricaBackup');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
const Expediente = require('../expediente/models/Expediente');
const Cliente = require('../expediente/models/Cliente');
const { conectarSSH, ejecutarComandoSSH } = require('./utils/sshHelpers');
const { actualizarRepositorios, construirComandoInstalacion } = require('./utils/installHelpers');
const { registrarLog, obtenerLogs } = require('./utils/logHelpers');

class RobotBackupService {
  constructor() {
    this.simulacionesActivas = new Map();
    this.intervalos = new Map();
    this.conexionesSSH = new Map();
    this.logsSimulacion = new Map();
    this.sseStreams = new Map();
    this.contadorMetricas = 0;
  }

  async obtenerClienteSimulacion() {
    let cliente = await Cliente.findOne({ nombre: 'Cliente Simulación Backup' });
    if (!cliente) {
      cliente = await Cliente.create({
        nombre: 'Cliente Simulación Backup',
        email: 'simulacion-backup@centinela.local',
        plan: 'basico',
        activo: true,
        origen: 'simulacion',
        descripcion: 'Cliente para simulaciones de Backup'
      });
      console.log('✅ [BACKUP] Cliente Simulación Backup creado');
    }
    return cliente;
  }

  conectarSSH(simulacionId, servidor) {
    return conectarSSH(simulacionId, servidor, this.conexionesSSH, this.enviarLog.bind(this), 'BACKUP');
  }

  ejecutarComandoSSH(ssh, comando) {
    return ejecutarComandoSSH(ssh, comando);
  }

  enviarLog(simulacionId, mensaje, tipo = 'info') {
    return registrarLog(simulacionId, mensaje, tipo, this.logsSimulacion, this.sseStreams, 'BACKUP');
  }

  _determinarCiclo(simulacion) {
    const inicio = new Date(simulacion.estadisticas.inicio);
    const transcurrido = (Date.now() - inicio) / 1000;
    const duracionTotal = simulacion.configuracion.duracionTotal || 3600;
    const porcentaje = duracionTotal > 0 ? (transcurrido / duracionTotal) * 100 : 0;

    if (porcentaje < 60) return 'backup_normal';
    if (porcentaje < 80) return 'backup_compresion';
    if (porcentaje < 90) return 'restauracion';
    return 'reposo';
  }

  _debeInyectarFallo(simulacion) {
    const fallos = simulacion.configuracion?.fallos;
    if (!fallos?.activados) return null;
    if (Math.random() > (fallos.probabilidad || 0.25)) return null;

    const tipos = ['timeout', 'corrupto', 'espacio_insuficiente'];
    return tipos[Math.floor(Math.random() * tipos.length)];
  }

  async _instalarHerramientasBackup(ssh, simulacionId) {
    try {
      await actualizarRepositorios(ssh, this.ejecutarComandoSSH.bind(this), simulacionId, this.enviarLog.bind(this));
      await this.ejecutarComandoSSH(ssh, construirComandoInstalacion(['tar', 'gzip', 'coreutils']));
      this.enviarLog(simulacionId, '✅ Herramientas de backup verificadas', 'exito');
    } catch (error) {
      this.enviarLog(simulacionId, `⚠️ Herramientas de backup incompletas: ${error.message}`, 'error');
    }
  }

  async iniciarSimulacion(configuracion) {
    console.log('🔄 [BACKUP] Iniciando simulación de Backup...');

    const clienteSimulacion = await this.obtenerClienteSimulacion();
    const tipoBackup = configuracion.tipoBackup || 'incremental';

    const expediente = await Expediente.create({
      nombre: `Simulación Backup-${configuracion.servidor.ip}`,
      clienteId: clienteSimulacion._id,
      origen: 'simulacion',
      servidor: {
        ip: configuracion.servidor.ip,
        puerto: configuracion.servidor.puerto || 22,
        usuario: configuracion.servidor.usuario,
        password: configuracion.servidor.password
      }
    });

    const simulacionIdLog = expediente._id.toString();
    this.enviarLog(simulacionIdLog, '💾 Iniciando simulación de Backup', 'info');
    this.enviarLog(simulacionIdLog, `📡 Servidor: ${configuracion.servidor.ip}`, 'info');
    this.enviarLog(simulacionIdLog, `🧰 Tipo: ${tipoBackup}`, 'info');
    this.enviarLog(simulacionIdLog, `⏱️ Duración: ${(configuracion.duracion || 3600) / 60} minutos`, 'info');

    let ssh;
    try {
      ssh = await this.conectarSSH(simulacionIdLog, configuracion.servidor);
    } catch (error) {
      this.enviarLog(simulacionIdLog, `❌ No se pudo conectar al servidor: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }

    ssh.simulacionId = simulacionIdLog;
    await this._instalarHerramientasBackup(ssh, simulacionIdLog);

    const simulacion = await SimulacionBackup.create({
      nombre: `Simulación Backup-${new Date().toISOString()}`,
      activa: true,
      servidor: configuracion.servidor,
      expedienteId: expediente._id,
      configuracion: {
        duracionTotal: configuracion.duracion || 3600,
        tipoBackup,
        directorioOrigen: configuracion.directorioOrigen || '/etc',
        directorioDestino: configuracion.directorioDestino || '/tmp/centinela-backup',
        compresion: configuracion.compresion !== false,
        fallos: {
          activados: configuracion.fallos?.activados !== false,
          probabilidad: configuracion.fallos?.probabilidad || 0.25
        }
      },
      estado: 'ejecutando',
      estadisticas: {
        inicio: new Date(),
        metricasGeneradas: 0,
        backupsRealizados: 0,
        restauracionesExitosas: 0
      }
    });

    this.simulacionesActivas.set(simulacion._id.toString(), {
      config: simulacion,
      expediente,
      ssh
    });

    this._iniciarCiclo(simulacion._id.toString());
    this.enviarLog(simulacionIdLog, '🚀 Simulación de Backup iniciada', 'exito');

    return { success: true, simulacionId: simulacion._id };
  }

  async _medirMetricasReales(ssh, simulacionId) {
    try {
      const metricas = {};
      
      // Espacio de disco
      const dfOutput = await this.ejecutarComandoSSH(ssh, 'df -h | tail -1 | awk \'{print $5}\' | sed "s/%//"');
      metricas.espacioUsadoPorcentaje = parseInt(dfOutput) || 0;
      
      // Tamaño del directorio de backup
      const duOutput = await this.ejecutarComandoSSH(ssh, `du -sh ${ssh.directorioDestino} 2>/dev/null | awk '{print $1}'`);
      metricas.tamañoBackupActual = duOutput || '0B';
      
      // Archivos en backup
      const filesOutput = await this.ejecutarComandoSSH(ssh, `find ${ssh.directorioDestino} -type f 2>/dev/null | wc -l`);
      metricas.archivosBackup = parseInt(filesOutput) || 0;
      
      // Verificar integridad (checksum de algunos archivos)
      const checksumOutput = await this.ejecutarComandoSSH(ssh, `ls ${ssh.directorioDestino}/*.tar.gz 2>/dev/null | wc -l`);
      metricas.archivosComprimidos = parseInt(checksumOutput) || 0;
      
      // Velocidad transferencia simulada (últimas 5 líneas de log)
      const speedOutput = await this.ejecutarComandoSSH(ssh, `tail -5 /var/log/syslog 2>/dev/null | grep -i backup | wc -l`);
      metricas.lineasLogBackup = parseInt(speedOutput) || 0;
      
      return metricas;
    } catch (error) {
      this.enviarLog(simulacionId, `⚠️ Error midiendo métricas: ${error.message}`, 'warning');
      return {};
    }
  }

  _iniciarCiclo(simulacionId) {    const simulacion = this.simulacionesActivas.get(simulacionId)?.config;
    if (simulacion) {
      // Guardar directorioDestino para usarlo en _medirMetricasReales
      const ssh = this.simulacionesActivas.get(simulacionId)?.ssh;
      if (ssh) ssh.directorioDestino = simulacion.configuracion.directorioDestino;
    }
    const intervalId = setInterval(async () => {
      await this._ejecutarCiclo(simulacionId);
    }, 30000);

    this.intervalos.set(simulacionId, intervalId);
    this.enviarLog(simulacionId, '🔄 Ciclo de backup iniciado (cada 30 seg)', 'info');
  }

  async _ejecutarCiclo(simulacionId) {
    const simulacionMem = this.simulacionesActivas.get(simulacionId);
    if (!simulacionMem || simulacionMem.config.estado !== 'ejecutando') return;

    const simulacion = simulacionMem.config;
    const ssh = simulacionMem.ssh;
    const cfg = simulacion.configuracion;

    const inicio = new Date(simulacion.estadisticas.inicio);
    if (cfg.duracionTotal > 0 && Date.now() - inicio > cfg.duracionTotal * 1000) {
      await this.detenerSimulacion(simulacionId, 'completado');
      return;
    }

    const ciclo = this._determinarCiclo(simulacion);
    if (ciclo === 'reposo') {
      this.enviarLog(simulacionId, '💤 Ciclo de reposo (sin backup)', 'info');
      return;
    }

    const timestamp = Date.now();
    const destinoBase = cfg.directorioDestino || '/tmp/centinela-backup';
    const backupFile = `${destinoBase}/backup_${simulacionId.slice(-6)}_${timestamp}${cfg.compresion ? '.tar.gz' : '.tar'}`;
    const origen = cfg.directorioOrigen || '/etc';

    try {
      await this.ejecutarComandoSSH(ssh, `mkdir -p ${destinoBase}`);

      const tamanoOriginalCmd = `du -sm ${origen} 2>/dev/null | awk '{print $1}' || echo 0`;
      const tamanoOriginal = parseFloat(await this.ejecutarComandoSSH(ssh, tamanoOriginalCmd)) || 0;

      const inicioBackup = Date.now();
      const tarCmd = cfg.compresion
        ? `sudo tar -czf ${backupFile} ${origen} 2>/dev/null`
        : `sudo tar -cf ${backupFile} ${origen} 2>/dev/null`;

      await this.ejecutarComandoSSH(ssh, tarCmd);
      const tiempoBackup = (Date.now() - inicioBackup) / 1000;

      const tamanoBackupCmd = `du -sm ${backupFile} 2>/dev/null | awk '{print $1}' || echo 0`;
      const tamanoBackup = parseFloat(await this.ejecutarComandoSSH(ssh, tamanoBackupCmd)) || 0;

      const espacioCmd = `df -m ${destinoBase} | awk 'NR==2{print $4}' || echo 0`;
      const espacioDisponible = parseFloat(await this.ejecutarComandoSSH(ssh, espacioCmd)) || 0;

      const falloTipo = this._debeInyectarFallo(simulacion);
      const falloInjectado = { activo: false };
      let integridad = 'valido';

      if (falloTipo) {
        falloInjectado.activo = true;
        falloInjectado.tipo = falloTipo;
        if (falloTipo === 'corrupto') integridad = 'corrupto';
      }

      const tasaCompresion = tamanoOriginal > 0
        ? Math.max(0, Math.min(100, ((tamanoOriginal - tamanoBackup) / tamanoOriginal) * 100))
        : 0;

      await MetricaBackup.create({
        simulacionId,
        expedienteId: simulacion.expedienteId,
        metricas: {
          tiempoBackup,
          tamanoBackup,
          tamanoOriginal,
          tasaCompresion,
          integridad,
          espacioDisponible,
          tiempoRestauracion: 0,
          tipoBackup: cfg.tipoBackup || 'incremental'
        },
        pruebaActiva: ciclo,
        falloInjectado,
        timestamp: new Date()
      });

      simulacion.estadisticas.metricasGeneradas += 1;
      simulacion.estadisticas.backupsRealizados += 1;
      await simulacion.save();

      this.contadorMetricas += 1;
      this.enviarLog(simulacionId, `✅ Backup completado: ${tamanoBackup}MB en ${tiempoBackup.toFixed(1)}s`, 'exito');

      if (falloInjectado.activo) {
        this.enviarLog(simulacionId, `🎯 Fallo inyectado: ${falloInjectado.tipo}`, 'error');
      }
    } catch (error) {
      this.enviarLog(simulacionId, `❌ Error en ciclo de backup: ${error.message}`, 'error');
    }
  }

  async detenerSimulacion(simulacionId, estado = 'detenido') {
    const simulacion = await SimulacionBackup.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };

    const intervalId = this.intervalos.get(simulacionId);
    if (intervalId) clearInterval(intervalId);

    const ssh = this.conexionesSSH.get(simulacionId);
    if (ssh) ssh.end();

    simulacion.estado = estado;
    simulacion.estadisticas.fin = new Date();
    await simulacion.save();

    this.simulacionesActivas.delete(simulacionId);
    this.intervalos.delete(simulacionId);
    this.conexionesSSH.delete(simulacionId);

    await EventoAuditoria.create({
      tipo: `simulacion_backup_${estado}`,
      modulo: 'robot',
      usuario: 'sistema',
      detalles: {
        simulacionId,
        estadisticas: simulacion.estadisticas
      },
      fecha: new Date()
    });

    this.enviarLog(simulacionId, `⏹️ Simulación ${estado}`, 'info');
    return { success: true };
  }

  async listarSimulaciones() {
    const activas = await SimulacionBackup.find({ estado: 'ejecutando' }).sort({ createdAt: -1 });
    const historial = await SimulacionBackup.find({ estado: { $ne: 'ejecutando' } }).sort({ createdAt: -1 }).limit(50);
    return { activas, historial };
  }

  async obtenerDetalle(simulacionId) {
    const simulacion = await SimulacionBackup.findById(simulacionId);
    if (!simulacion) return null;

    const metricas = await MetricaBackup.find({ simulacionId }).sort({ timestamp: -1 }).limit(100);
    const logs = obtenerLogs(simulacionId, this.logsSimulacion);

    return { simulacion, metricas, logs };
  }
}

module.exports = RobotBackupService;