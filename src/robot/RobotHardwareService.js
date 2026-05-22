// backend/src/robot/RobotHardwareService.js
const SimulacionHardware = require('./models/SimulacionHardware');
const MetricaHardware = require('./models/MetricaHardware');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
const Expediente = require('../expediente/models/Expediente');
const Cliente = require('../expediente/models/Cliente');
const { conectarSSH, ejecutarComandoSSH } = require('./utils/sshHelpers');
const { construirComandoInstalacion, actualizarRepositorios } = require('./utils/installHelpers');
const { registrarLog, obtenerLogs } = require('./utils/logHelpers');

class RobotHardwareService {
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
    let cliente = await Cliente.findOne({ nombre: 'Cliente Simulación Hardware' });
    if (!cliente) {
      cliente = await Cliente.create({
        nombre: 'Cliente Simulación Hardware',
        email: 'simulacion-hardware@centinela.local',
        plan: 'basico',
        activo: true,
        origen: 'simulacion',
        descripcion: 'Cliente para simulaciones de Hardware del ORÁCULO'
      });
      console.log('✅ [HARDWARE] Cliente Simulación Hardware creado');
    }
    return cliente;
  }

  // ============ CONEXIÓN SSH ============
  
  conectarSSH(simulacionId, servidor) {
    return conectarSSH(simulacionId, servidor, this.conexionesSSH, this.enviarLog.bind(this), 'HARDWARE');
  }

  ejecutarComandoSSH(ssh, comando) {
    return ejecutarComandoSSH(ssh, comando);
  }

  // ============ OBTENCIÓN DE MÉTRICAS DE HARDWARE ============
  
  async obtenerMetricasHardware(ssh) {
    const metricas = {};
    
    try {
      // Temperatura CPU (lm-sensors)
      const tempCPU = await this.ejecutarComandoSSH(ssh, `sensors 2>/dev/null | grep -E "Core 0|Package id" | awk '{print $3}' | cut -d'+' -f2 | cut -d'.' -f1 | head -1 || echo "45"`);
      metricas.tempCPU = parseInt(tempCPU) || 45;
      
      // Temperatura disco (hddtemp o smartctl)
      const tempDisco = await this.ejecutarComandoSSH(ssh, `smartctl -A /dev/sda 2>/dev/null | grep -E "Temperature" | awk '{print $10}' | head -1 || echo "40"`);
      metricas.tempDisco = parseInt(tempDisco) || 40;
      
      // Velocidad ventiladores
      const fanRPM = await this.ejecutarComandoSSH(ssh, `sensors 2>/dev/null | grep -i fan | awk '{print $2}' | head -1 || echo "2000"`);
      metricas.fanRPM = parseInt(fanRPM) || 2000;
      
      // Errores SMART
      const smartErrors = await this.ejecutarComandoSSH(ssh, `smartctl -H /dev/sda 2>/dev/null | grep -E "SMART overall-health" | awk '{print $6}' || echo "PASSED"`);
      metricas.erroresSMART = smartErrors !== 'PASSED' ? 1 : 0;
      
      // Throttling (si existe información)
      const throttling = await this.ejecutarComandoSSH(ssh, `cat /sys/devices/system/cpu/intel_pstate/no_turbo 2>/dev/null || echo "0"`);
      metricas.throttlingActivo = throttling.trim() === '1';
      
      // Uso de CPU, RAM, Disco (métricas base)
      const cpu = await this.ejecutarComandoSSH(ssh, `top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`);
      const ram = await this.ejecutarComandoSSH(ssh, `free -m | awk 'NR==2{printf "%.0f", $3/$2*100}'`);
      const disco = await this.ejecutarComandoSSH(ssh, `df -h / | awk 'NR==2{print $5}' | cut -d'%' -f1`);
      
      metricas.usoCPU = parseFloat(cpu) || 0;
      metricas.usoRAM = parseFloat(ram) || 0;
      metricas.usoDisco = parseFloat(disco) || 0;
      
      // Consumo energético estimado (basado en uso)
      metricas.consumoWatts = Math.round((metricas.usoCPU / 100) * 65) + Math.round((metricas.usoRAM / 100) * 15);
      
    } catch (error) {
      console.error('Error obteniendo métricas de hardware:', error.message);
      metricas.tempCPU = 45;
      metricas.tempDisco = 40;
      metricas.fanRPM = 2000;
      metricas.erroresSMART = 0;
      metricas.throttlingActivo = false;
      metricas.usoCPU = 0;
      metricas.usoRAM = 0;
      metricas.usoDisco = 0;
      metricas.consumoWatts = 50;
    }
    
    return metricas;
  }
  
  // ============ INSTALACIÓN DE HERRAMIENTAS ============
  
  async instalarHerramientasHardware(ssh) {
    this.enviarLog(ssh.simulacionId, `🔧 Instalando herramientas de monitorización...`, 'info');
    
    try {
      await actualizarRepositorios(ssh, this.ejecutarComandoSSH.bind(this), ssh.simulacionId, this.enviarLog.bind(this));
      await this.ejecutarComandoSSH(
        ssh,
        construirComandoInstalacion(['lm-sensors', 'hddtemp', 'smartmontools', 'sysstat'])
      );
      await this.ejecutarComandoSSH(ssh, 'sensors-detect --auto 2>/dev/null || true');
    } catch (error) {
      console.log(`⚠️ Error instalando herramientas hardware: ${error.message}`);
    }
    
    this.enviarLog(ssh.simulacionId, `✅ Herramientas de hardware instaladas`, 'exito');
  }

  // ============ SIMULACIÓN DE ESTRÉS ============
  
  async aplicarEstrésCPU(ssh, intensidad) {
    const niveles = {
      baja: 1,
      media: 2,
      alta: 4,
      extrema: 6
    };
    
    const cores = niveles[intensidad] || 2;
    this.enviarLog(ssh.simulacionId, `🔥 Aplicando estrés CPU (${cores} cores)`, 'error');
    
    const comando = `stress-ng --cpu ${cores} --timeout 60s --quiet > /dev/null 2>&1 &`;
    await this.ejecutarComandoSSH(ssh, comando);
    
    return cores;
  }
  
  async aplicarEstrésRAM(ssh, intensidad) {
    const niveles = {
      baja: 256,
      media: 512,
      alta: 1024,
      extrema: 2048
    };
    
    const mb = niveles[intensidad] || 512;
    this.enviarLog(ssh.simulacionId, `💾 Aplicando estrés RAM (${mb} MB)`, 'error');
    
    const comando = `stress-ng --vm 1 --vm-bytes ${mb}M --timeout 60s --quiet > /dev/null 2>&1 &`;
    await this.ejecutarComandoSSH(ssh, comando);
    
    return mb;
  }
  
  async aplicarEstrésDisco(ssh, intensidad) {
    const niveles = {
      baja: 1,
      media: 2,
      alta: 4,
      extrema: 8
    };
    
    const workers = niveles[intensidad] || 2;
    this.enviarLog(ssh.simulacionId, `💿 Aplicando estrés Disco (${workers} workers)`, 'error');
    
    const comando = `stress-ng --hdd ${workers} --timeout 60s --quiet > /dev/null 2>&1 &`;
    await this.ejecutarComandoSSH(ssh, comando);
    
    return workers;
  }
  
  async simularTemperatura(ssh, intensidad) {
    // Simular aumento de temperatura (lm-sensors no se puede modificar fácilmente)
    // Así que generamos un log para que el ORÁCULO lo detecte
    const tempSimulada = {
      baja: 75,
      media: 85,
      alta: 95,
      extrema: 105
    };
    
    const temp = tempSimulada[intensidad] || 85;
    this.enviarLog(ssh.simulacionId, `🌡️ Simulando temperatura extrema: ${temp}°C`, 'error');
    
    // Crear entrada en syslog simulando overheating
    await this.ejecutarComandoSSH(ssh, `logger "Temperature above threshold: CPU ${temp}°C"`);
    
    return temp;
  }
  
  async detenerEstrés(ssh) {
    this.enviarLog(ssh.simulacionId, `🛑 Deteniendo procesos de estrés`, 'info');
    await this.ejecutarComandoSSH(ssh, `pkill stress-ng 2>/dev/null || true`);
  }

  // ============ PARÁMETROS POR CICLO ============
  
  getCicloSegunProgreso(simulacion) {
    const inicio = new Date(simulacion.estadisticas.inicio);
    const transcurrido = (Date.now() - inicio) / 1000;
    const duracionTotal = simulacion.configuracion.duracionTotal || 3600;
    const porcentaje = (transcurrido / duracionTotal) * 100;
    
    if (porcentaje < 60) return 'normal';
    if (porcentaje < 70) return 'estres_cpu';
    if (porcentaje < 80) return 'estres_ram';
    if (porcentaje < 90) return 'temperatura';
    return 'reposo';
  }
  
  getParametrosPorCiclo(ciclo, intensidad) {
    const parametros = {
      normal: { tipo: null, descripcion: 'Monitorización normal' },
      estres_cpu: { tipo: 'cpu', descripcion: 'Estrés de CPU' },
      estres_ram: { tipo: 'ram', descripcion: 'Estrés de memoria' },
      estres_disco: { tipo: 'disco', descripcion: 'Estrés de disco' },
      temperatura: { tipo: 'temperatura', descripcion: 'Temperatura extrema' },
      reposo: { tipo: null, descripcion: 'Reposo - enfriamiento' }
    };
    
    return parametros[ciclo] || parametros.normal;
  }
  
  generarFallo(tiposPermitidos, intensidad) {
    const factoresIntensidad = { baja: 0.1, media: 0.25, alta: 0.4, extrema: 0.6 };
    const prob = factoresIntensidad[intensidad] || 0.25;
    
    if (Math.random() > prob) return null;
    
    const tipo = tiposPermitidos[Math.floor(Math.random() * tiposPermitidos.length)];
    return { tipo };
  }
  
  async inyectarFalloReal(ssh, tipoFallo, intensidad) {
    this.enviarLog(ssh.simulacionId, `🎯 Inyectando fallo hardware: ${tipoFallo}`, 'error');
    
    try {
      switch(tipoFallo) {
        case 'sobrecalentamiento':
          await this.simularTemperatura(ssh, intensidad);
          break;
          
        case 'fallo_disco':
          await this.ejecutarComandoSSH(ssh, `logger "SMART error detected on /dev/sda"`);
          break;
          
        case 'memoria_defectuosa':
          await this.ejecutarComandoSSH(ssh, `logger "Memory parity error at address 0x7f8a3c"`);
          break;
          
        case 'throttling':
          // Simular throttling escribiendo en syslog
          await this.ejecutarComandoSSH(ssh, `logger "CPU throttling activated due to thermal stress"`);
          break;
          
        case 'ventilador':
          await this.ejecutarComandoSSH(ssh, `logger "Fan failure detected on CPU fan"`);
          break;
      }
    } catch (error) {
      console.error('Error inyectando fallo hardware:', error.message);
    }
  }
  
  aplicarFalloAMetricas(metricas, tipoFallo) {
    switch(tipoFallo) {
      case 'sobrecalentamiento':
        metricas.tempCPU = Math.min(110, metricas.tempCPU + 25);
        metricas.tempDisco = Math.min(90, metricas.tempDisco + 15);
        metricas.throttlingActivo = true;
        break;
      case 'fallo_disco':
        metricas.erroresSMART = (metricas.erroresSMART || 0) + 1;
        metricas.usoDisco = 0;
        break;
      case 'memoria_defectuosa':
        metricas.usoRAM = 0;
        metricas.consumoWatts = metricas.consumoWatts * 0.5;
        break;
      case 'throttling':
        metricas.throttlingActivo = true;
        metricas.usoCPU = Math.min(100, metricas.usoCPU * 0.5);
        break;
      case 'ventilador':
        metricas.fanRPM = Math.max(0, metricas.fanRPM - 1500);
        metricas.tempCPU = Math.min(110, metricas.tempCPU + 10);
        break;
    }
  }

  // ============ REGISTRO DE LOGS ============
  
  enviarLog(simulacionId, mensaje, tipo = 'info') {
    return registrarLog(simulacionId, mensaje, tipo, this.logsSimulacion, this.sseStreams, 'HARDWARE');
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
        tipo: 'hardware',
        valor: metrica.metricas.tempCPU,
        timestamp: metrica.timestamp,
        origen: 'simulacion',
        detalles: {
          tempCPU: metrica.metricas.tempCPU,
          tempDisco: metrica.metricas.tempDisco,
          fanRPM: metrica.metricas.fanRPM,
          erroresSMART: metrica.metricas.erroresSMART,
          throttlingActivo: metrica.metricas.throttlingActivo,
          consumoWatts: metrica.metricas.consumoWatts,
          usoCPU: metrica.metricas.usoCPU,
          usoRAM: metrica.metricas.usoRAM,
          usoDisco: metrica.metricas.usoDisco,
          pruebaActiva: metrica.pruebaActiva
        }
      });
      
    } catch (error) {
      console.error('Error registrando métrica de hardware:', error.message);
    }
  }

  // ============ INICIAR SIMULACIÓN ============
  
  async iniciarSimulacion(configuracion) {
    console.log('🌡️ [HARDWARE] Iniciando simulación de Hardware...');
    
    const clienteSimulacion = await this.obtenerClienteSimulacion();
    
    const expediente = await Expediente.create({
      nombre: `Simulación Hardware-${configuracion.servidor.ip}`,
      clienteId: clienteSimulacion._id,
      origen: 'simulacion',
      servidor: {
        ip: configuracion.servidor.ip,
        puerto: configuracion.servidor.puerto || 22,
        usuario: configuracion.servidor.usuario,
        password: configuracion.servidor.password
      }
    });
    
    this.enviarLog(expediente._id.toString(), `🌡️ Iniciando simulación de Hardware`, 'info');
    this.enviarLog(expediente._id.toString(), `📡 Servidor: ${configuracion.servidor.ip}`, 'info');
    this.enviarLog(expediente._id.toString(), `⏱️ Duración: ${configuracion.duracion / 60} minutos`, 'info');
    this.enviarLog(expediente._id.toString(), `💪 Intensidad: ${configuracion.intensidad}`, 'info');
    
    let ssh;
    try {
      ssh = await this.conectarSSH(expediente._id.toString(), configuracion.servidor);
    } catch (error) {
      this.enviarLog(expediente._id.toString(), `❌ No se pudo conectar al servidor: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
    
    ssh.simulacionId = expediente._id.toString();
    
    await this.instalarHerramientasHardware(ssh);
    
    const simulacion = await SimulacionHardware.create({
      nombre: `Simulación Hardware-${new Date().toISOString()}`,
      activa: true,
      servidor: configuracion.servidor,
      expedienteId: expediente._id,
      configuracion: {
        duracionTotal: configuracion.duracion || 3600,
        intensidad: configuracion.intensidad || 'media',
        componentes: {
          cpu: configuracion.cpu !== false,
          memoria: configuracion.memoria !== false,
          disco: configuracion.disco !== false,
          temperatura: configuracion.temperatura !== false
        },
        fallos: {
          activados: configuracion.fallos?.activados !== false,
          probabilidad: configuracion.fallos?.probabilidad || 0.25
        }
      },
      estado: 'ejecutando',
      estadisticas: {
        inicio: new Date(),
        metricasGeneradas: 0,
        alertasHardware: 0
      }
    });
    
    this.simulacionesActivas.set(simulacion._id.toString(), {
      config: simulacion,
      expediente,
      ssh
    });
    
    this.enviarLog(expediente._id.toString(), `🚀 Simulación de Hardware iniciada`, 'exito');
    
    this.iniciarCiclo(simulacion._id.toString());
    
    return { success: true, simulacionId: simulacion._id };
  }
  
  iniciarCiclo(simulacionId) {
    const intervalId = setInterval(async () => {
      await this.ejecutarCiclo(simulacionId);
    }, 30000);
    
    this.intervalos.set(simulacionId, intervalId);
    this.enviarLog(simulacionId, `🔄 Ciclo de pruebas iniciado (cada 30 seg)`, 'info');
  }
  
  async ejecutarCiclo(simulacionId) {
    const simulacionMem = this.simulacionesActivas.get(simulacionId);
    if (!simulacionMem || simulacionMem.config.estado !== 'ejecutando') return;
    
    const simulacion = simulacionMem.config;
    const ssh = simulacionMem.ssh;
    const config = simulacion.configuracion;
    
    const inicio = new Date(simulacion.estadisticas.inicio);
    if (Date.now() - inicio > config.duracionTotal * 1000) {
      await this.detenerSimulacion(simulacionId, 'completado');
      return;
    }
    
    const ciclo = this.getCicloSegunProgreso(simulacion);
    const params = this.getParametrosPorCiclo(ciclo, config.intensidad);
    
    this.enviarLog(simulacionId, `📊 Ciclo: ${params.descripcion}`, 'info');
    
    // Aplicar estrés según ciclo
    if (ciclo === 'estres_cpu' && config.componentes.cpu) {
      await this.aplicarEstrésCPU(ssh, config.intensidad);
    } else if (ciclo === 'estres_ram' && config.componentes.memoria) {
      await this.aplicarEstrésRAM(ssh, config.intensidad);
    } else if (ciclo === 'estres_disco' && config.componentes.disco) {
      await this.aplicarEstrésDisco(ssh, config.intensidad);
    } else if (ciclo === 'temperatura' && config.componentes.temperatura) {
      await this.simularTemperatura(ssh, config.intensidad);
    } else if (ciclo === 'reposo') {
      await this.detenerEstrés(ssh);
    }
    
    // Esperar un momento para que el estrés tenga efecto
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Medir métricas
    const metricasReales = await this.obtenerMetricasHardware(ssh);
    
    let falloInjectado = null;
    
    if (config.fallos.activados) {
      falloInjectado = this.generarFallo(['sobrecalentamiento', 'fallo_disco', 'memoria_defectuosa', 'throttling', 'ventilador'], config.intensidad);
      if (falloInjectado) {
        this.aplicarFalloAMetricas(metricasReales, falloInjectado.tipo);
        await this.inyectarFalloReal(ssh, falloInjectado.tipo, config.intensidad);
        simulacion.estadisticas.fallosInyectados = (simulacion.estadisticas.fallosInyectados || 0) + 1;
        
        if (falloInjectado.tipo === 'sobrecalentamiento' || falloInjectado.tipo === 'fallo_disco') {
          simulacion.estadisticas.alertasHardware++;
        }
        await simulacion.save();
        
        await EventoAuditoria.create({
          tipo: 'fallo_hardware_injectado',
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
        
        this.enviarLog(simulacionId, `🎯 Fallo hardware inyectado: ${falloInjectado.tipo}`, 'error');
      }
    }
    
    const metrica = await MetricaHardware.create({
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
    
    await this.registrarMetricaEnSistema(metrica, simulacion.expedienteId);
    
    if (this.contadorMetricas % 10 === 0) {
      this.enviarLog(simulacionId, `📊 ${this.contadorMetricas} métricas generadas`, 'info');
    }
    
    // Mostrar resumen
    this.enviarLog(simulacionId, `🌡️ Temp CPU: ${metricasReales.tempCPU}°C | Temp DISCO: ${metricasReales.tempDisco}°C`, 'info');
    this.enviarLog(simulacionId, `💨 Fan: ${metricasReales.fanRPM} RPM | 🔥 Throttling: ${metricasReales.throttlingActivo ? 'SÍ' : 'NO'}`, 'info');
    this.enviarLog(simulacionId, `⚡ Consumo: ${metricasReales.consumoWatts}W | 💾 SMART errors: ${metricasReales.erroresSMART}`, 'info');
  }
  
  async pausarSimulacion(simulacionId) {
    const simulacion = await SimulacionHardware.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    simulacion.estado = 'pausado';
    await simulacion.save();
    
    const intervalId = this.intervalos.get(simulacionId);
    if (intervalId) clearInterval(intervalId);
    
    const ssh = this.conexionesSSH.get(simulacionId);
    if (ssh) {
      await this.detenerEstrés(ssh);
    }
    
    await EventoAuditoria.create({
      tipo: 'simulacion_hardware_pausada',
      modulo: 'robot',
      usuario: 'sistema',
      detalles: { simulacionId },
      fecha: new Date()
    });
    
    this.enviarLog(simulacionId, `⏸️ Simulación pausada`, 'info');
    
    return { success: true };
  }
  
  async reanudarSimulacion(simulacionId) {
    const simulacion = await SimulacionHardware.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    simulacion.estado = 'ejecutando';
    await simulacion.save();
    
    this.iniciarCiclo(simulacionId);
    
    await EventoAuditoria.create({
      tipo: 'simulacion_hardware_reanudada',
      modulo: 'robot',
      usuario: 'sistema',
      detalles: { simulacionId },
      fecha: new Date()
    });
    
    this.enviarLog(simulacionId, `▶️ Simulación reanudada`, 'info');
    
    return { success: true };
  }
  
  async detenerSimulacion(simulacionId, estado = 'detenido') {
    const simulacion = await SimulacionHardware.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    const ssh = this.conexionesSSH.get(simulacionId);
    if (ssh) {
      await this.detenerEstrés(ssh);
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
      tipo: `simulacion_hardware_${estado}`,
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
  
  async listarSimulaciones() {
    const activas = await SimulacionHardware.find({ estado: 'ejecutando' }).sort({ createdAt: -1 });
    const historial = await SimulacionHardware.find({ estado: { $ne: 'ejecutando' } }).sort({ createdAt: -1 }).limit(50);
    
    return { activas, historial };
  }
  
  async obtenerDetalle(simulacionId) {
    const simulacion = await SimulacionHardware.findById(simulacionId);
    if (!simulacion) return null;
    
    const metricas = await MetricaHardware.find({ simulacionId }).sort({ timestamp: -1 }).limit(100);
    const logs = obtenerLogs(simulacionId, this.logsSimulacion);
    
    return { simulacion, metricas, logs };
  }
  
  async obtenerEstadisticas() {
    const total = await SimulacionHardware.countDocuments();
    const activas = await SimulacionHardware.countDocuments({ estado: 'ejecutando' });
    const completadas = await SimulacionHardware.countDocuments({ estado: 'completado' });
    
    return {
      total,
      activas,
      completadas,
      totalMetricasGeneradas: this.contadorMetricas
    };
  }
}

module.exports = RobotHardwareService;