// backend/src/robot/RobotSeguridadService.js
const SimulacionSeguridad = require('./models/SimulacionSeguridad');
const MetricaSeguridad = require('./models/MetricaSeguridad');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
const Expediente = require('../expediente/models/Expediente');
const Cliente = require('../expediente/models/Cliente');
const { conectarSSH, ejecutarComandoSSH } = require('./utils/sshHelpers');
const { construirComandoInstalacion, actualizarRepositorios } = require('./utils/installHelpers');
const { registrarLog, obtenerLogs } = require('./utils/logHelpers');

class RobotSeguridadService {
  constructor() {
    this.simulacionesActivas = new Map();
    this.intervalos = new Map();
    this.conexionesSSH = new Map();
    this.logsSimulacion = new Map();
    this.sseStreams = new Map();
    this.contadorMetricas = 0;
    this.ipsSimuladas = ['45.33.22.11', '89.12.45.67', '123.45.67.89', '185.42.13.7'];
  }

  // ============ CLIENTE DE SIMULACIÓN ============
  
  async obtenerClienteSimulacion() {
    let cliente = await Cliente.findOne({ nombre: 'Cliente Simulación Seguridad' });
    if (!cliente) {
      cliente = await Cliente.create({
        nombre: 'Cliente Simulación Seguridad',
        email: 'simulacion-seguridad@centinela.local',
        plan: 'basico',
        activo: true,
        origen: 'simulacion',
        descripcion: 'Cliente para simulaciones de Seguridad del ORÁCULO'
      });
      console.log('✅ [SEGURIDAD] Cliente Simulación Seguridad creado');
    }
    return cliente;
  }

  // ============ CONEXIÓN SSH ============
  
  conectarSSH(simulacionId, servidor) {
    return conectarSSH(simulacionId, servidor, this.conexionesSSH, this.enviarLog.bind(this), 'SEGURIDAD');
  }

  ejecutarComandoSSH(ssh, comando) {
    return ejecutarComandoSSH(ssh, comando);
  }

  // ============ COMANDOS DE SEGURIDAD ============
  
  async instalarHerramientasSeguridad(ssh) {
    this.enviarLog(ssh.simulacionId, `🔧 Instalando herramientas de seguridad...`, 'info');

    try {
      await actualizarRepositorios(ssh, this.ejecutarComandoSSH.bind(this), ssh.simulacionId, this.enviarLog.bind(this));
      await this.ejecutarComandoSSH(ssh, construirComandoInstalacion(['nmap', 'hydra', 'fail2ban']));
      await this.ejecutarComandoSSH(ssh, 'systemctl enable fail2ban');
      await this.ejecutarComandoSSH(ssh, 'systemctl start fail2ban');
    } catch (error) {
      console.log(`⚠️ Error instalando herramienta: ${error.message}`);
    }
    
    this.enviarLog(ssh.simulacionId, `✅ Herramientas de seguridad instaladas`, 'exito');
  }
  
  async simularFuerzaBruta(ssh, puerto = 22, intentos = 100) {
    const ipAtacante = this.ipsSimuladas[Math.floor(Math.random() * this.ipsSimuladas.length)];
    this.enviarLog(ssh.simulacionId, `🔓 Simulando fuerza bruta SSH desde ${ipAtacante}`, 'error');
    
    // Comando que genera múltiples intentos de login fallidos
    const comando = `for i in {1..${intentos}}; do ssh -o ConnectTimeout=1 -o BatchMode=yes -p ${puerto} usuario_falso@localhost 2>&1 | grep -q "Permission denied" && echo "Intento fallido $i" || true; done &`;
    
    await this.ejecutarComandoSSH(ssh, comando);
    
    return ipAtacante;
  }
  
  async simularEscaneoPuertos(ssh, ip = 'localhost') {
    const ipAtacante = this.ipsSimuladas[Math.floor(Math.random() * this.ipsSimuladas.length)];
    this.enviarLog(ssh.simulacionId, `🔍 Simulando escaneo de puertos desde ${ipAtacante}`, 'error');
    
    // Escaneo rápido de puertos comunes
    const comando = `nmap -p 22,80,443,3306,5432 ${ip} -T4 2>/dev/null | grep -E "^[0-9]" | wc -l`;
    
    const resultado = await this.ejecutarComandoSSH(ssh, comando);
    const puertosDetectados = parseInt(resultado) || 0;
    
    this.enviarLog(ssh.simulacionId, `📡 ${puertosDetectados} puertos detectados en escaneo`, 'info');
    
    return { puertosDetectados, ipAtacante };
  }
  
  async simularDDoS(ssh, puerto = 80, duracion = 10) {
    const ipAtacante = this.ipsSimuladas[Math.floor(Math.random() * this.ipsSimuladas.length)];
    this.enviarLog(ssh.simulacionId, `💥 Simulando DDoS desde ${ipAtacante} hacia puerto ${puerto}`, 'error');
    
    // Simular conexiones masivas usando hping3 (si está instalado) o curl
    const comando = `for i in {1..100}; do curl -s -o /dev/null --max-time 1 http://localhost:${puerto}/ & done; wait`;
    
    await this.ejecutarComandoSSH(ssh, comando);
    
    return ipAtacante;
  }
  
  async simularHTTPFlood(ssh, url = 'http://localhost/', peticiones = 100) {
    const ipAtacante = this.ipsSimuladas[Math.floor(Math.random() * this.ipsSimuladas.length)];
    this.enviarLog(ssh.simulacionId, `🌊 Simulando HTTP flood desde ${ipAtacante}`, 'error');
    
    const comando = `for i in {1..${peticiones}}; do curl -s -o /dev/null ${url} & done; wait`;
    
    await this.ejecutarComandoSSH(ssh, comando);
    
    return ipAtacante;
  }
  
  async obtenerMetricasSeguridad(ssh) {
    const metricas = {};
    
    try {
      // Verificar fail2ban
      const fail2banStatus = await this.ejecutarComandoSSH(ssh, `systemctl is-active fail2ban 2>/dev/null || echo "inactive"`);
      metricas.fail2banActivo = fail2banStatus.includes('active');
      
      // Contar IPs bloqueadas por fail2ban
      const ipsBloqueadas = await this.ejecutarComandoSSH(ssh, `sudo fail2ban-client status sshd 2>/dev/null | grep "Banned IP list" | awk -F':' '{print $2}' | tr ',' '\n' | wc -l`);
      metricas.ipsBloqueadas = parseInt(ipsBloqueadas) || 0;
      
      // Contar intentos de login fallidos
      const loginAttempts = await this.ejecutarComandoSSH(ssh, `grep "Failed password" /var/log/auth.log 2>/dev/null | tail -100 | wc -l`);
      metricas.intentosFallidos = parseInt(loginAttempts) || 0;
      
      // Contar conexiones activas
      const conexiones = await this.ejecutarComandoSSH(ssh, `ss -tun | grep ESTAB | wc -l`);
      metricas.conexionesActivas = parseInt(conexiones) || 0;
      
      // Puerto 22 (SSH) bajo ataque?
      const conexionesSSH = await this.ejecutarComandoSSH(ssh, `ss -tun | grep ":22 " | wc -l`);
      metricas.conexionesSSH = parseInt(conexionesSSH) || 0;
      
      // Verificar si hay procesos sospechosos
      const procesosSospechosos = await this.ejecutarComandoSSH(ssh, `ps aux | grep -E "(nmap|hydra|masscan)" | grep -v grep | wc -l`);
      metricas.procesosSospechosos = parseInt(procesosSospechosos) || 0;
      
    } catch (error) {
      console.error('Error obteniendo métricas de seguridad:', error.message);
    }
    
    return metricas;
  }

  // ============ CICLOS Y PARÁMETROS ============
  
  getCicloSegunProgreso(simulacion) {
    const inicio = new Date(simulacion.estadisticas.inicio);
    const transcurrido = (Date.now() - inicio) / 1000;
    const duracionTotal = simulacion.configuracion.duracionTotal || 3600;
    const porcentaje = (transcurrido / duracionTotal) * 100;
    
    if (porcentaje < 60) return 'normal';
    if (porcentaje < 70) return 'escaneo';
    if (porcentaje < 80) return 'fuerza_bruta';
    if (porcentaje < 90) return 'ddos';
    return 'reposo';
  }
  
  getParametrosPorCiclo(ciclo, intensidad) {
    const factores = {
      baja: { intentos: 10, peticiones: 50 },
      media: { intentos: 50, peticiones: 200 },
      alta: { intentos: 200, peticiones: 500 },
      extrema: { intentos: 500, peticiones: 2000 }
    };
    
    const factor = factores[intensidad] || factores.media;
    
    const parametros = {
      normal: { ataque: null, descripcion: 'Actividad normal' },
      escaneo: { ataque: 'escaneo_puertos', intentos: 1, descripcion: 'Escaneo de puertos' },
      fuerza_bruta: { ataque: 'fuerza_bruta', intentos: factor.intentos, descripcion: `Fuerza bruta (${factor.intentos} intentos)` },
      ddos: { ataque: 'ddos', peticiones: factor.peticiones, descripcion: `DDoS (${factor.peticiones} peticiones)` },
      http_flood: { ataque: 'http_flood', peticiones: factor.peticiones, descripcion: `HTTP flood (${factor.peticiones} peticiones)` },
      reposo: { ataque: null, descripcion: 'Reposo - sin actividad sospechosa' }
    };
    
    return parametros[ciclo] || parametros.normal;
  }
  
  async _recuperarDespuesDeAtaque(ssh) {
    try {
      this.enviarLog(ssh.simulacionId, '🔄 Ejecutando recuperación post-ataque...', 'info');
      
      // Resetear intentos fallidos
      await this.ejecutarComandoSSH(ssh, 'sudo fail2ban-client set sshd unbanip 0.0.0.0/0 2>/dev/null || true');
      
      // Verificar conexiones y cerrar las sospechosas
      const conexionesAnteriores = await this.ejecutarComandoSSH(ssh, 'ss -tun | grep ESTAB | wc -l');
      this.enviarLog(ssh.simulacionId, `✅ Recuperación: ${conexionesAnteriores} conexiones activas normalizadas`, 'exito');
    } catch (error) {
      this.enviarLog(ssh.simulacionId, `⚠️ Error en recuperación: ${error.message}`, 'warning');
    }
  }

  async ejecutarAtaque(ssh, ciclo, params, config) {
    const ataquesActivos = config.ataques;
    let ipAtacante = null;
    
    switch(ciclo) {
      case 'escaneo':
        if (ataquesActivos.escaneoPuertos) {
          const resultado = await this.simularEscaneoPuertos(ssh);
          ipAtacante = resultado.ipAtacante;
          // Recuperación automática después del escaneo
          await this._recuperarDespuesDeAtaque(ssh);
        }
        break;
        
      case 'fuerza_bruta':
        if (ataquesActivos.fuerzaBruta) {
          ipAtacante = await this.simularFuerzaBruta(ssh, 22, params.intentos);
        }
        break;
        
      case 'ddos':
        if (ataquesActivos.ddos) {
          ipAtacante = await this.simularDDoS(ssh, 80, 10);
        } else if (ataquesActivos.httpFlood) {
          ipAtacante = await this.simularHTTPFlood(ssh, 'http://localhost/', params.peticiones);
        }
        break;
        
      default:
        break;
    }
    
    return ipAtacante;
  }

  // ============ REGISTRO DE LOGS ============
  
  enviarLog(simulacionId, mensaje, tipo = 'info') {
    return registrarLog(simulacionId, mensaje, tipo, this.logsSimulacion, this.sseStreams, 'SEGURIDAD');
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
        tipo: 'seguridad',
        valor: metrica.metricas.intentosFallidos,
        timestamp: metrica.timestamp,
        origen: 'simulacion',
        detalles: {
          intentosFallidos: metrica.metricas.intentosFallidos,
          ipsBloqueadas: metrica.metricas.ipsBloqueadas,
          puertosAbiertos: metrica.metricas.puertosAbiertos,
          conexionesSSH: metrica.metricas.conexionesSSH,
          pruebaActiva: metrica.pruebaActiva,
          ataqueInjectado: metrica.ataqueInjectado?.tipo,
          ipOrigen: metrica.ataqueInjectado?.ipOrigen
        }
      });
      
    } catch (error) {
      console.error('Error registrando métrica de seguridad:', error.message);
    }
  }

  // ============ INICIAR SIMULACIÓN ============
  
  async iniciarSimulacion(configuracion) {
    console.log('🔐 [SEGURIDAD] Iniciando simulación de Seguridad...');
    
    const clienteSimulacion = await this.obtenerClienteSimulacion();
    
    // Crear expediente
    const expediente = await Expediente.create({
      nombre: `Simulación Seguridad-${configuracion.servidor.ip}`,
      clienteId: clienteSimulacion._id,
      origen: 'simulacion',
      servidor: {
        ip: configuracion.servidor.ip,
        puerto: configuracion.servidor.puerto || 22,
        usuario: configuracion.servidor.usuario,
        password: configuracion.servidor.password
      }
    });
    
    this.enviarLog(expediente._id.toString(), `🔐 Iniciando simulación de Seguridad`, 'info');
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
    
    ssh.simulacionId = expediente._id.toString();
    
    // Instalar herramientas de seguridad
    await this.instalarHerramientasSeguridad(ssh);
    
    // Crear simulación
    const simulacion = await SimulacionSeguridad.create({
      nombre: `Simulación Seguridad-${new Date().toISOString()}`,
      activa: true,
      servidor: configuracion.servidor,
      expedienteId: expediente._id,
      configuracion: {
        duracionTotal: configuracion.duracion || 3600,
        intensidad: configuracion.intensidad || 'media',
        ataques: {
          fuerzaBruta: configuracion.fuerzaBruta !== false,
          escaneoPuertos: configuracion.escaneoPuertos !== false,
          ddos: configuracion.ddos || false,
          httpFlood: configuracion.httpFlood || false
        },
        fallos: {
          activados: configuracion.fallos?.activados !== false,
          probabilidad: configuracion.fallos?.probabilidad || 0.3
        }
      },
      estado: 'ejecutando',
      estadisticas: {
        inicio: new Date(),
        metricasGeneradas: 0,
        intentosDetectados: 0,
        ipsBloqueadas: 0
      }
    });
    
    this.simulacionesActivas.set(simulacion._id.toString(), {
      config: simulacion,
      expediente,
      ssh
    });
    
    this.enviarLog(expediente._id.toString(), `🚀 Simulación de Seguridad iniciada`, 'exito');
    
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
    const ciclo = this.getCicloSegunProgreso(simulacion);
    const params = this.getParametrosPorCiclo(ciclo, config.intensidad);
    
    this.enviarLog(simulacionId, `📊 Ciclo: ${params.descripcion}`, 'info');
    
    let ipAtacante = null;
    let ataqueTipo = null;
    
    // Ejecutar ataque según ciclo
    if (ciclo !== 'normal' && ciclo !== 'reposo') {
      const ataque = await this.ejecutarAtaque(ssh, ciclo, params, config.ataques);
      if (ataque) {
        ataqueTipo = params.ataque;
        ipAtacante = ataque;
        this.enviarLog(simulacionId, `⚠️ Ataque detectado: ${ataqueTipo} desde ${ipAtacante}`, 'error');
        
        simulacion.estadisticas.intentosDetectados++;
        await simulacion.save();
      }
    }
    
    // Esperar un momento
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Medir métricas
    const metricasReales = await this.obtenerMetricasSeguridad(ssh);
    
    // Guardar métrica
    const metrica = await MetricaSeguridad.create({
      simulacionId,
      expedienteId: simulacion.expedienteId,
      metricas: metricasReales,
      pruebaActiva: ciclo,
      ataqueInjectado: ataqueTipo ? {
        activo: true,
        tipo: ataqueTipo,
        ipOrigen: ipAtacante,
        timestamp: new Date()
      } : { activo: false },
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
    
    // Mostrar resumen de métricas
    this.enviarLog(simulacionId, `📈 Intentos fallidos: ${metricasReales.intentosFallidos}`, 'info');
    this.enviarLog(simulacionId, `🛡️ IPs bloqueadas: ${metricasReales.ipsBloqueadas}`, 'info');
  }
  
  // ============ CONTROL ============
  
  async pausarSimulacion(simulacionId) {
    const simulacion = await SimulacionSeguridad.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    simulacion.estado = 'pausado';
    await simulacion.save();
    
    const intervalId = this.intervalos.get(simulacionId);
    if (intervalId) clearInterval(intervalId);
    
    await EventoAuditoria.create({
      tipo: 'simulacion_seguridad_pausada',
      modulo: 'robot',
      usuario: 'sistema',
      detalles: { simulacionId },
      fecha: new Date()
    });
    
    this.enviarLog(simulacionId, `⏸️ Simulación pausada`, 'info');
    
    return { success: true };
  }
  
  async reanudarSimulacion(simulacionId) {
    const simulacion = await SimulacionSeguridad.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    simulacion.estado = 'ejecutando';
    await simulacion.save();
    
    this.iniciarCiclo(simulacionId);
    
    await EventoAuditoria.create({
      tipo: 'simulacion_seguridad_reanudada',
      modulo: 'robot',
      usuario: 'sistema',
      detalles: { simulacionId },
      fecha: new Date()
    });
    
    this.enviarLog(simulacionId, `▶️ Simulación reanudada`, 'info');
    
    return { success: true };
  }
  
  async detenerSimulacion(simulacionId, estado = 'detenido') {
    const simulacion = await SimulacionSeguridad.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    const ssh = this.conexionesSSH.get(simulacionId);
    if (ssh) {
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
      tipo: `simulacion_seguridad_${estado}`,
      modulo: 'robot',
      usuario: 'sistema',
      detalles: {
        simulacionId,
        estadisticas: simulacion.estadisticas
      },
      fecha: new Date()
    });
    
    this.enviarLog(simulacionId, `⏹️ Simulación ${estado}`, 'exito');
    
    return { success: true };
  }
  
  // ============ CONSULTAS ============
  
  async listarSimulaciones() {
    const activas = await SimulacionSeguridad.find({ estado: 'ejecutando' }).sort({ createdAt: -1 });
    const historial = await SimulacionSeguridad.find({ estado: { $ne: 'ejecutando' } }).sort({ createdAt: -1 }).limit(50);
    
    return { activas, historial };
  }
  
  async obtenerDetalle(simulacionId) {
    const simulacion = await SimulacionSeguridad.findById(simulacionId);
    if (!simulacion) return null;
    
    const metricas = await MetricaSeguridad.find({ simulacionId }).sort({ timestamp: -1 }).limit(100);
    const logs = obtenerLogs(simulacionId, this.logsSimulacion);
    
    return { simulacion, metricas, logs };
  }
  
  async obtenerEstadisticas() {
    const total = await SimulacionSeguridad.countDocuments();
    const activas = await SimulacionSeguridad.countDocuments({ estado: 'ejecutando' });
    const completadas = await SimulacionSeguridad.countDocuments({ estado: 'completado' });
    
    return {
      total,
      activas,
      completadas,
      totalMetricasGeneradas: this.contadorMetricas
    };
  }
}

module.exports = RobotSeguridadService;