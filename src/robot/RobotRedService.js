// backend/src/robot/RobotRedService.js
const SimulacionRed = require('./models/SimulacionRed');
const MetricaRed = require('./models/MetricaRed');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
const Expediente = require('../expediente/models/Expediente');
const Cliente = require('../expediente/models/Cliente');
const { conectarSSH, ejecutarComandoSSH } = require('./utils/sshHelpers');
const { construirComandoInstalacion, actualizarRepositorios } = require('./utils/installHelpers');
const { registrarLog, obtenerLogs } = require('./utils/logHelpers');

class RobotRedService {
  constructor() {
    this.simulacionesActivas = new Map();
    this.intervalos = new Map();
    this.conexionesSSH = new Map();
    this.logsSimulacion = new Map();
    this.sseStreams = new Map();
    this.contadorMetricas = 0;
  }

  // ============ CLIENTE DE SIMULACIÓN ============
  
  async obtenerClienteSimulacion() {
    let cliente = await Cliente.findOne({ nombre: 'Cliente Simulación Red' });
    if (!cliente) {
      cliente = await Cliente.create({
        nombre: 'Cliente Simulación Red',
        email: 'simulacion-red@centinela.local',
        plan: 'basico',
        activo: true,
        origen: 'simulacion',
        descripcion: 'Cliente para simulaciones de red del ORÁCULO'
      });
      console.log('✅ [RED] Cliente Simulación Red creado');
    }
    return cliente;
  }

  // ============ CONEXIÓN SSH ============
  
  conectarSSH(simulacionId, servidor) {
    return conectarSSH(simulacionId, servidor, this.conexionesSSH, this.enviarLog.bind(this), 'RED');
  }

  ejecutarComandoSSH(ssh, comando) {
    return ejecutarComandoSSH(ssh, comando);
  }

  // ============ COMANDOS DE RED (tc = traffic control) ============
  
  async aplicarConfiguracionRed(ssh, tipo, valor = null) {
    const comandos = {
      limpiar: 'tc qdisc del dev eth0 root 2>/dev/null || true',
      latencia: `tc qdisc add dev eth0 root netem delay ${valor}ms`,
      perdida: `tc qdisc add dev eth0 root netem loss ${valor}%`,
      anchoBanda: `tc qdisc add dev eth0 root tbf rate ${valor}mbit burst 32kbit latency 400ms`,
      congestion: `tc qdisc add dev eth0 root netem delay 100ms 20ms distribution normal loss 5%`,
      caida: 'ip link set eth0 down'
    };
    
    // Limpiar configuración anterior
    await this.ejecutarComandoSSH(ssh, comandos.limpiar);
    
    if (tipo !== 'limpiar' && tipo !== 'caida') {
      await this.ejecutarComandoSSH(ssh, comandos[tipo]);
      this.enviarLog(ssh.simulacionId, `🔧 Aplicado: ${tipo} ${valor ? `= ${valor}` : ''}`, 'info');
    } else if (tipo === 'caida') {
      await this.ejecutarComandoSSH(ssh, comandos.caida);
      this.enviarLog(ssh.simulacionId, `💀 Simulando caída de red`, 'error');
      // Recuperar después de 10 segundos
      setTimeout(async () => {
        await this.ejecutarComandoSSH(ssh, 'ip link set eth0 up');
        this.enviarLog(ssh.simulacionId, `🔄 Red recuperada`, 'exito');
      }, 10000);
    }
  }
  
  // ============ MEDICIÓN DE MÉTRICAS ============
  
  async medirMetricasRed(ssh, simulacionId) {
    const metricas = {};
    
    try {
      // Medir latencia (ping a google)
      const pingResult = await this.ejecutarComandoSSH(ssh, 
        'ping -c 5 8.8.8.8 2>/dev/null | tail -1 | awk -F"/" "{print $5}" || echo "0"'
      );
      metricas.latencia = parseFloat(pingResult) || 0;
      
      // Medir pérdida de paquetes
      const lossResult = await this.ejecutarComandoSSH(ssh,
        'ping -c 20 8.8.8.8 2>/dev/null | grep "packet loss" | awk "{print $6}" | cut -d"%" -f1 || echo "0"'
      );
      metricas.perdida = parseFloat(lossResult) || 0;
      
      // Medir conexiones activas
      const conexionesResult = await this.ejecutarComandoSSH(ssh,
        'ss -tun | grep ESTAB | wc -l'
      );
      metricas.conexiones = parseInt(conexionesResult) || 0;
      
      // Medir jitter (desviación estándar de latencia)
      const jitterResult = await this.ejecutarComandoSSH(ssh,
        'ping -c 10 8.8.8.8 2>/dev/null | grep "time=" | sed "s/.*time=\\([0-9.]*\\) ms/\\1/" | awk "{sum+=$1; sumsq+=$1*$1} END {if(NR>0) print sqrt(sumsq/NR - (sum/NR)*(sum/NR))}" || echo "0"'
      );
      metricas.jitter = parseFloat(jitterResult) || 0;
      
      // Medir ancho de banda (si iperf está instalado)
      try {
        const bwResult = await this.ejecutarComandoSSH(ssh,
          'iperf3 -c localhost -t 3 2>/dev/null | grep sender | awk "{print $7}" || echo "0"'
        );
        metricas.anchoBanda = parseFloat(bwResult) || 0;
      } catch {
        metricas.anchoBanda = 0;
      }
      
    } catch (error) {
      console.error('Error midiendo métricas de red:', error.message);
      metricas.latencia = 0;
      metricas.perdida = 0;
      metricas.conexiones = 0;
      metricas.jitter = 0;
      metricas.anchoBanda = 0;
    }
    
    return metricas;
  }
  
  // ============ CICLOS SEGÚN INTENSIDAD ============
  
  getParametrosPorCiclo(ciclo, intensidad) {
    const factores = {
      baja: { mult: 0.5, probFallo: 0.1 },
      media: { mult: 1.0, probFallo: 0.25 },
      alta: { mult: 1.5, probFallo: 0.4 },
      extrema: { mult: 2.0, probFallo: 0.6 }
    };
    
    const factor = factores[intensidad] || factores.media;
    
    const parametrosBase = {
      trabajo_normal: { latencia: 10, perdida: 0, anchoBanda: 100 },
      carga_progresiva: { latencia: 50, perdida: 2, anchoBanda: 50 },
      pico_maximo: { latencia: 150, perdida: 10, anchoBanda: 10 },
      reposo: { latencia: 0, perdida: 0, anchoBanda: 100 }
    };
    
    const base = parametrosBase[ciclo];
    
    return {
      latencia: Math.min(500, base.latencia * factor.mult),
      perdida: Math.min(30, base.perdida * factor.mult),
      anchoBanda: Math.max(1, base.anchoBanda / factor.mult),
      probFallo: factor.probFallo
    };
  }
  
  determinarCiclo(simulacion) {
    const inicio = new Date(simulacion.estadisticas.inicio);
    const transcurrido = (Date.now() - inicio) / 1000;
    const duracionTotal = simulacion.configuracion.duracionTotal || 3600;
    const porcentaje = (transcurrido / duracionTotal) * 100;
    
    if (porcentaje < 60) return 'trabajo_normal';
    if (porcentaje < 80) return 'carga_progresiva';
    if (porcentaje < 90) return 'pico_maximo';
    return 'reposo';
  }
  
  generarFallo(tiposPermitidos, ciclo, intensidad) {
    const probabilidadPorCiclo = {
      trabajo_normal: 0.1,
      carga_progresiva: 0.2,
      pico_maximo: 0.35,
      reposo: 0.05
    };
    
    const factoresIntensidad = {
      baja: 0.5,
      media: 1.0,
      alta: 1.5,
      extrema: 2.0
    };
    
    // Validación defensiva: si tiposPermitidos no existe o está vacío, usar defaults
    if (!tiposPermitidos || !Array.isArray(tiposPermitidos) || tiposPermitidos.length === 0) {
      tiposPermitidos = ['latencia_alta', 'perdida_paquetes', 'ancho_banda_reducido'];
    }
    
    const prob = probabilidadPorCiclo[ciclo] * (factoresIntensidad[intensidad] || 1.0);
    
    if (Math.random() > prob) return null;
    
    const tipo = tiposPermitidos[Math.floor(Math.random() * tiposPermitidos.length)];
    
    return { tipo };
  }
  
  async inyectarFalloReal(ssh, tipoFallo, parametros) {
    switch (tipoFallo) {
      case 'latencia_alta':
        await this.aplicarConfiguracionRed(ssh, 'latencia', 500);
        setTimeout(() => this.aplicarConfiguracionRed(ssh, 'limpiar'), 30000);
        break;
      case 'perdida_alta':
        await this.aplicarConfiguracionRed(ssh, 'perdida', 30);
        setTimeout(() => this.aplicarConfiguracionRed(ssh, 'limpiar'), 30000);
        break;
      case 'caida_red':
        await this.aplicarConfiguracionRed(ssh, 'caida');
        break;
      case 'congestion':
        await this.aplicarConfiguracionRed(ssh, 'congestion');
        setTimeout(() => this.aplicarConfiguracionRed(ssh, 'limpiar'), 30000);
        break;
    }
  }
  
  aplicarFalloAMetricas(metricas, tipoFallo) {
    switch (tipoFallo) {
      case 'latencia_alta':
        metricas.latencia = Math.min(1000, metricas.latencia + 400);
        break;
      case 'perdida_alta':
        metricas.perdida = Math.min(50, metricas.perdida + 25);
        break;
      case 'caida_red':
        metricas.latencia = 0;
        metricas.perdida = 100;
        metricas.conexiones = 0;
        break;
      case 'congestion':
        metricas.latencia = metricas.latencia * 3;
        metricas.perdida = metricas.perdida + 10;
        metricas.anchoBanda = metricas.anchoBanda * 0.3;
        break;
    }
  }

  // ============ REGISTRO DE LOGS ============
  
  enviarLog(simulacionId, mensaje, tipo = 'info') {
    return registrarLog(simulacionId, mensaje, tipo, this.logsSimulacion, this.sseStreams, 'RED');
  }
  
  async registrarMetricaEnSistema(metrica, expedienteId) {
    if (!expedienteId) return;
    
    try {
      const Metrica = require('../expediente/models/Metrica');
      const expediente = await Expediente.findById(expedienteId);
      if (!expediente) return;
      
      await Metrica.create({
        expedienteId,
        clienteId: expediente.clienteId,
        tipo: 'red',
        valor: metrica.metricas.latencia,
        timestamp: metrica.timestamp,
        origen: 'simulacion',
        detalles: {
          latencia: metrica.metricas.latencia,
          perdida: metrica.metricas.perdida,
          jitter: metrica.metricas.jitter,
          conexiones: metrica.metricas.conexiones,
          anchoBanda: metrica.metricas.anchoBanda,
          pruebaActiva: metrica.pruebaActiva,
          falloInjectado: metrica.falloInjectado?.tipo
        }
      });
      
    } catch (error) {
      console.error('Error registrando métrica de red:', error.message);
    }
  }

  // ============ INICIAR SIMULACIÓN ============
  
  async iniciarSimulacion(configuracion) {
    console.log('🌐 [RED] Iniciando simulación de red...');
    
    const clienteSimulacion = await this.obtenerClienteSimulacion();
    
    // Crear expediente
    const expediente = await Expediente.create({
      nombre: `Simulación Red-${configuracion.servidor.ip}`,
      clienteId: clienteSimulacion._id,
      origen: 'simulacion',
      servidor: {
        ip: configuracion.servidor.ip,
        puerto: configuracion.servidor.puerto || 22,
        usuario: configuracion.servidor.usuario,
        password: configuracion.servidor.password
      }
    });
    
    this.enviarLog(expediente._id.toString(), `🌐 Iniciando simulación de red`, 'info');
    this.enviarLog(expediente._id.toString(), `📡 Servidor: ${configuracion.servidor.ip}`, 'info');
    this.enviarLog(expediente._id.toString(), `⏱️ Duración: ${configuracion.duracion / 60} minutos`, 'info');
    this.enviarLog(expediente._id.toString(), `💪 Intensidad: ${configuracion.intensidad}`, 'info');
    
    // Conectar SSH
    let ssh;
    try {
      ssh = await this.conectarSSH(expediente._id.toString(), configuracion.servidor);
    } catch (error) {
      this.enviarLog(expediente._id.toString(), `❌ No se pudo conectar al servidor: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
    
    // Verificar herramientas necesarias
    this.enviarLog(expediente._id.toString(), `🔧 Verificando herramientas...`, 'info');
    
    // Instalar herramientas de forma consistente si faltan
    try {
      await actualizarRepositorios(ssh, this.ejecutarComandoSSH.bind(this), expediente._id.toString(), this.enviarLog.bind(this));
      await this.ejecutarComandoSSH(
        ssh,
        construirComandoInstalacion(['iputils-ping', 'iproute2', 'iperf3'])
      );
      this.enviarLog(expediente._id.toString(), `✅ Herramientas verificadas e instaladas`, 'exito');
    } catch (error) {
      this.enviarLog(expediente._id.toString(), `⚠️ Herramientas de red incompletas: ${error.message}`, 'error');
    }
    
    // Crear simulación
    const simulacion = await SimulacionRed.create({
      nombre: `Simulación Red-${new Date().toISOString()}`,
      activa: true,
      servidor: configuracion.servidor,
      expedienteId: expediente._id,
      configuracion: {
        duracionTotal: configuracion.duracion || 3600,
        intensidad: configuracion.intensidad || 'media',
        pruebas: configuracion.pruebas || {
          latencia: true,
          perdida: true,
          anchoBanda: true,
          congestion: true
        },
        fallos: {
          activados: configuracion.fallos?.activados !== false,
          probabilidad: configuracion.fallos?.probabilidad || 0.25,
          tiposPermitidos: configuracion.fallos?.tiposPermitidos || ['latencia_alta', 'perdida_alta', 'caida_red', 'congestion']
        }
      },
      estado: 'ejecutando',
      estadisticas: {
        inicio: new Date(),
        metricasGeneradas: 0,
        fallosInyectados: 0
      }
    });
    
    this.simulacionesActivas.set(simulacion._id.toString(), {
      config: simulacion,
      expediente,
      ssh
    });
    
    this.enviarLog(expediente._id.toString(), `🚀 Simulación de red iniciada`, 'exito');
    
    this.iniciarCiclo(simulacion._id.toString());
    
    return { success: true, simulacionId: simulacion._id };
  }
  
  iniciarCiclo(simulacionId) {
    const intervalId = setInterval(async () => {
      await this.ejecutarCiclo(simulacionId);
    }, 30000); // Cada 30 segundos
    
    this.intervalos.set(simulacionId, intervalId);
    this.enviarLog(simulacionId, `🔄 Ciclo de pruebas iniciado (cada 30 seg)`, 'info');
  }
  
  async ejecutarCiclo(simulacionId) {
    const simulacionMem = this.simulacionesActivas.get(simulacionId);
    if (!simulacionMem || simulacionMem.config.estado !== 'ejecutando') return;
    
    const simulacion = simulacionMem.config;
    const ssh = simulacionMem.ssh;
    const config = simulacion.configuracion;
    
    // Verificar si terminó
    const inicio = new Date(simulacion.estadisticas.inicio);
    if (Date.now() - inicio > config.duracionTotal * 1000) {
      await this.detenerSimulacion(simulacionId, 'completado');
      return;
    }
    
    // Determinar ciclo actual
    const ciclo = this.determinarCiclo(simulacion);
    const params = this.getParametrosPorCiclo(ciclo, config.intensidad);
    
    this.enviarLog(simulacionId, `📊 Ciclo: ${ciclo} | Latencia: ${params.latencia}ms | Pérdida: ${params.perdida}%`, 'info');
    
    // Aplicar configuración de red según el ciclo
    if (ciclo !== 'reposo') {
      await this.aplicarConfiguracionRed(ssh, 'latencia', params.latencia);
      await this.aplicarConfiguracionRed(ssh, 'perdida', params.perdida);
    } else {
      await this.aplicarConfiguracionRed(ssh, 'limpiar');
    }
    
    // Esperar a que la configuración tenga efecto
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Medir métricas reales
    const metricasReales = await this.medirMetricasRed(ssh, simulacionId);
    
    let falloInjectado = null;
    
    // Decidir si inyectar fallo
    if (config.fallos.activados && Math.random() < params.probFallo) {
      falloInjectado = this.generarFallo(config.fallos.tiposPermitidos, ciclo, config.intensidad);
      if (falloInjectado) {
        this.aplicarFalloAMetricas(metricasReales, falloInjectado.tipo);
        await this.inyectarFalloReal(ssh, falloInjectado.tipo, params);
        simulacion.estadisticas.fallosInyectados++;
        await simulacion.save();
        
        await EventoAuditoria.create({
          tipo: 'fallo_red_injectado',
          modulo: 'robot',
          usuario: 'sistema',
          detalles: {
            simulacionId,
            tipo: falloInjectado.tipo,
            ciclo,
            metricas: metricasReales
          },
          fecha: new Date()
        });
        
        this.enviarLog(simulacionId, `🎯 Fallo inyectado: ${falloInjectado.tipo}`, 'error');
      }
    }
    
    // Guardar métrica
    const metrica = await MetricaRed.create({
      simulacionId,
      expedienteId: simulacion.expedienteId,
      metricas: metricasReales,
      pruebaActiva: ciclo,
      falloInjectado: falloInjectado || null,
      timestamp: new Date()
    });
    
    simulacion.estadisticas.metricasGeneradas++;
    await simulacion.save();
    
    this.contadorMetricas++;
    
    // Registrar en el sistema para el ORÁCULO
    await this.registrarMetricaEnSistema(metrica, simulacion.expedienteId);
    
    if (this.contadorMetricas % 10 === 0) {
      this.enviarLog(simulacionId, `📊 ${this.contadorMetricas} métricas generadas`, 'info');
    }
  }
  
  // ============ CONTROL ============
  
  async pausarSimulacion(simulacionId) {
    const simulacion = await SimulacionRed.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    simulacion.estado = 'pausado';
    await simulacion.save();
    
    const intervalId = this.intervalos.get(simulacionId);
    if (intervalId) clearInterval(intervalId);
    
    await EventoAuditoria.create({
      tipo: 'simulacion_red_pausada',
      modulo: 'robot',
      usuario: 'sistema',
      detalles: { simulacionId },
      fecha: new Date()
    });
    
    this.enviarLog(simulacionId, `⏸️ Simulación pausada`, 'info');
    
    return { success: true };
  }
  
  async reanudarSimulacion(simulacionId) {
    const simulacion = await SimulacionRed.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    simulacion.estado = 'ejecutando';
    await simulacion.save();
    
    this.iniciarCiclo(simulacionId);
    
    await EventoAuditoria.create({
      tipo: 'simulacion_red_reanudada',
      modulo: 'robot',
      usuario: 'sistema',
      detalles: { simulacionId },
      fecha: new Date()
    });
    
    this.enviarLog(simulacionId, `▶️ Simulación reanudada`, 'info');
    
    return { success: true };
  }
  
  async detenerSimulacion(simulacionId, estado = 'detenido') {
    const simulacion = await SimulacionRed.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    const ssh = this.conexionesSSH.get(simulacionId);
    if (ssh) {
      await this.aplicarConfiguracionRed(ssh, 'limpiar');
      ssh.end();
    }
    
    simulacion.estado = estado;
    simulacion.estadisticas.fin = new Date();
    await simulacion.save();
    
    const intervalId = this.intervalos.get(simulacionId);
    if (intervalId) clearInterval(intervalId);
    
    this.simulacionesActivas.delete(simulacionId);
    this.intervalos.delete(simulacionId);
    this.conexionesSSH.delete(simulacionId);
    
    await EventoAuditoria.create({
      tipo: `simulacion_red_${estado}`,
      modulo: 'robot',
      usuario: 'sistema',
      detalles: {
        simulacionId,
        estadisticas: simulacion.estadisticas,
        metricasGeneradas: this.contadorMetricas
      },
      fecha: new Date()
    });
    
    this.enviarLog(simulacionId, `⏹️ Simulación ${estado}`, 'exito');
    
    return { success: true };
  }
  
  // ============ CONSULTAS ============
  
  async listarSimulaciones() {
    const activas = await SimulacionRed.find({ estado: 'ejecutando' }).sort({ createdAt: -1 });
    const historial = await SimulacionRed.find({ estado: { $ne: 'ejecutando' } }).sort({ createdAt: -1 }).limit(50);
    
    return { activas, historial };
  }
  
  async obtenerDetalle(simulacionId) {
    const simulacion = await SimulacionRed.findById(simulacionId);
    if (!simulacion) return null;
    
    const metricas = await MetricaRed.find({ simulacionId }).sort({ timestamp: -1 }).limit(100);
    const logs = obtenerLogs(simulacionId, this.logsSimulacion);
    
    return { simulacion, metricas, logs };
  }
  
  async obtenerEstadisticas() {
    const total = await SimulacionRed.countDocuments();
    const activas = await SimulacionRed.countDocuments({ estado: 'ejecutando' });
    const completadas = await SimulacionRed.countDocuments({ estado: 'completado' });
    
    const totalMetricas = await MetricaRed.countDocuments();
    const fallosInyectados = await SimulacionRed.aggregate([
      { $group: { _id: null, total: { $sum: '$estadisticas.fallosInyectados' } } }
    ]);
    
    return {
      total,
      activas,
      completadas,
      totalMetricas,
      totalFallos: fallosInyectados[0]?.total || 0,
      totalMetricasGeneradas: this.contadorMetricas
    };
  }
}

module.exports = RobotRedService;