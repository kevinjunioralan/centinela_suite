// backend/src/robot/RobotSimulacionService.js
const { v4: uuidv4 } = require('uuid');
const { Client } = require('ssh2');
const SimulacionConfig = require('./models/SimulacionConfig');
const MetricaSimulacion = require('./models/MetricaSimulacion');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
const Expediente = require('../expediente/models/Expediente');
const Cliente = require('../expediente/models/Cliente');
const { SCRIPTS_CARGA } = require('./scripts/cargaReal');

class RobotSimulacionService {
  constructor() {
    this.simulacionesActivas = new Map();
    this.intervalos = new Map();
    this.contadorMetricas = 0;
    this.conexionesSSH = new Map();
  }

  // ============ CLIENTE DE SIMULACIÓN PERMANENTE ============
  
  async obtenerClienteSimulacion() {
    let clienteSimulacion = await Cliente.findOne({ 
      nombre: 'Cliente Simulación 24/7'
    });
    
    if (!clienteSimulacion) {
      clienteSimulacion = await Cliente.create({
        nombre: 'Cliente Simulación 24/7',
        nif: 'SIM-000000',
        email: 'simulacion24-7@centinela.local',
        telefono: '000000000',
        plan: 'basico',
        activo: true,
        origen: 'simulacion',
        descripcion: 'Cliente automático para el Robot de Simulación 24/7. NO ELIMINAR - Contiene datos de entrenamiento del ORÁCULO.'
      });
      console.log('✅ [SIMULACIÓN] Cliente Simulación 24/7 creado permanentemente');
    }
    
    return clienteSimulacion;
  }

  // ============ CONEXIÓN SSH ============
  
  conectarSSH(simulacionId, servidor) {
    return new Promise((resolve, reject) => {
      const ssh = new Client();
      
      ssh.on('ready', () => {
        console.log(`🔌 [SIMULACIÓN] SSH conectado a ${servidor.ip}`);
        this.conexionesSSH.set(simulacionId, ssh);
        resolve(ssh);
      });
      
      ssh.on('error', (err) => {
        console.error(`❌ [SIMULACIÓN] Error SSH: ${err.message}`);
        reject(err);
      });
      
      ssh.connect({
        host: servidor.ip,
        port: servidor.puerto || 22,
        username: servidor.usuario,
        password: servidor.password,
        readyTimeout: 30000
      });
    });
  }
  
  async ejecutarComandoSSH(ssh, comando) {
    return new Promise((resolve, reject) => {
      ssh.exec(comando, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        
        let output = '';
        let errorOutput = '';
        
        stream.on('data', (data) => {
          output += data.toString();
        });
        
        stream.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        stream.on('close', (code) => {
          if (code !== 0 && errorOutput) {
            reject(new Error(errorOutput));
          } else {
            resolve(output.trim());
          }
        });
      });
    });
  }
  
  async instalarHerramientas(simulacionId, pack) {
    const simulacionMem = this.simulacionesActivas.get(simulacionId);
    if (!simulacionMem) return;
    
    const ssh = this.conexionesSSH.get(simulacionId);
    if (!ssh) return;
    
    const scriptPack = SCRIPTS_CARGA[pack];
    if (!scriptPack || !scriptPack.instalarHerramientas) return;
    
    console.log(`🔧 [SIMULACIÓN] Instalando herramientas para ${pack}...`);
    
    for (const comando of scriptPack.instalarHerramientas) {
      try {
        const resultado = await this.ejecutarComandoSSH(ssh, comando);
        if (resultado && resultado.includes('no instalado')) {
          console.log(`⚠️ [SIMULACIÓN] ${resultado}`);
        }
      } catch (error) {
        console.log(`⚠️ [SIMULACIÓN] Error instalando: ${error.message}`);
      }
    }
    
    console.log(`✅ [SIMULACIÓN] Herramientas instaladas para ${pack}`);
  }
  
  async ejecutarCargaReal(simulacionId, ciclo, pack) {
    const simulacionMem = this.simulacionesActivas.get(simulacionId);
    if (!simulacionMem) return;
    
    const ssh = this.conexionesSSH.get(simulacionId);
    if (!ssh) return;
    
    const scriptPack = SCRIPTS_CARGA[pack];
    if (!scriptPack) return;
    
    const comandos = scriptPack.cargas[ciclo] || scriptPack.cargas.trabajo_normal;
    
    for (const comando of comandos) {
      try {
        await this.ejecutarComandoSSH(ssh, comando);
      } catch (error) {
        // Ignorar errores en los comandos de carga
      }
    }
    
    console.log(`⚡ [SIMULACIÓN] Carga ${ciclo} ejecutada en ${pack}`);
  }
  
  async medirMetricasReales(simulacionId, pack) {
    const simulacionMem = this.simulacionesActivas.get(simulacionId);
    if (!simulacionMem) return null;
    
    const ssh = this.conexionesSSH.get(simulacionId);
    if (!ssh) return null;
    
    const scriptPack = SCRIPTS_CARGA[pack];
    if (!scriptPack) return null;
    
    try {
      const cpu = await this.ejecutarComandoSSH(ssh, scriptPack.metricas.cpu);
      const ram = await this.ejecutarComandoSSH(ssh, scriptPack.metricas.ram);
      const disco = await this.ejecutarComandoSSH(ssh, scriptPack.metricas.disco);
      
      return {
        cpu: parseFloat(cpu) || 0,
        ram: parseFloat(ram) || 0,
        disco: parseFloat(disco) || 0
      };
    } catch (error) {
      console.error('Error midiendo métricas reales:', error.message);
      return null;
    }
  }

  async inyectarFalloReal(simulacionId, tipoFallo, pack) {
    const ssh = this.conexionesSSH.get(simulacionId);
    if (!ssh) return;
    
    const comandosFallo = {
      cpu_alta: 'stress-ng --cpu 2 --timeout 30s --quiet > /dev/null 2>&1 &',
      memoria_alta: 'stress-ng --vm 1 --timeout 30s --quiet > /dev/null 2>&1 &',
      disco_lleno: 'dd if=/dev/zero of=/tmp/testfile bs=1M count=50 2>/dev/null &',
      caida_servicio: {
        pack_web: 'systemctl stop nginx 2>/dev/null || true',
        pack_correo: 'systemctl stop postfix 2>/dev/null || true',
        pack_dominio: 'systemctl stop bind9 2>/dev/null || true'
      }
    };
    
    let comando = comandosFallo[tipoFallo];
    
    if (tipoFallo === 'caida_servicio' && typeof comando === 'object') {
      comando = comando[pack] || comando.pack_web;
    }
    
    if (comando) {
      try {
        await this.ejecutarComandoSSH(ssh, comando);
        console.log(`💥 [SIMULACIÓN] Fallo real inyectado: ${tipoFallo}`);
        
        setTimeout(async () => {
          await this.recuperarFalloReal(simulacionId, tipoFallo, pack);
        }, 30000);
      } catch (error) {
        console.log(`⚠️ [SIMULACIÓN] No se pudo inyectar fallo real: ${error.message}`);
      }
    }
  }
  
  async recuperarFalloReal(simulacionId, tipoFallo, pack) {
    const ssh = this.conexionesSSH.get(simulacionId);
    if (!ssh) return;
    
    const comandosRecuperacion = {
      cpu_alta: 'pkill stress-ng 2>/dev/null || true',
      memoria_alta: 'pkill stress-ng 2>/dev/null || true',
      disco_lleno: 'rm -f /tmp/testfile 2>/dev/null || true',
      caida_servicio: {
        pack_web: 'systemctl start nginx 2>/dev/null || true',
        pack_correo: 'systemctl start postfix 2>/dev/null || true',
        pack_dominio: 'systemctl start bind9 2>/dev/null || true'
      }
    };
    
    let comando = comandosRecuperacion[tipoFallo];
    
    if (tipoFallo === 'caida_servicio' && typeof comando === 'object') {
      comando = comando[pack] || comando.pack_web;
    }
    
    if (comando) {
      try {
        await this.ejecutarComandoSSH(ssh, comando);
        console.log(`🔄 [SIMULACIÓN] Fallo real recuperado: ${tipoFallo}`);
      } catch (error) {
        console.log(`⚠️ [SIMULACIÓN] No se pudo recuperar fallo: ${error.message}`);
      }
    }
  }

  // ============ INICIAR SIMULACIÓN ============
  
  async iniciarSimulacion(configuracion) {
    console.log('🤖 [SIMULACIÓN] Iniciando nueva simulación...');
    
    const clienteSimulacion = await this.obtenerClienteSimulacion();
    
    let expediente = null;
    if (configuracion.expedienteId) {
      expediente = await Expediente.findById(configuracion.expedienteId);
    } else if (configuracion.servidor?.ip) {
      expediente = await Expediente.findOne({ 
        'servidor.ip': configuracion.servidor.ip,
        clienteId: clienteSimulacion._id
      });
    }
    
    if (!expediente && configuracion.servidor) {
      expediente = await Expediente.create({
        nombre: `Simulación-${configuracion.pack}-${Date.now()}`,
        clienteId: clienteSimulacion._id,
        origen: 'simulacion',
        servidor: {
          ip: configuracion.servidor.ip,
          puerto: configuracion.servidor.puerto || 22,
          usuario: configuracion.servidor.usuario,
          password: configuracion.servidor.password
        },
        instalacion: {
          estado: 'completado',
          packSeleccionado: configuracion.pack,
          resumen: { scoreFinal: 100 }
        }
      });
      console.log(`🤖 [SIMULACIÓN] Expediente creado: ${expediente._id}`);
    }
    
    // Conectar SSH al servidor
    try {
      const ssh = await this.conectarSSH(expediente._id.toString(), configuracion.servidor);
      console.log(`✅ [SIMULACIÓN] Conexión SSH establecida con ${configuracion.servidor.ip}`);
      
      await this.instalarHerramientas(expediente._id.toString(), configuracion.pack);
      
    } catch (error) {
      console.error(`❌ [SIMULACIÓN] Error de conexión SSH: ${error.message}`);
      return { success: false, error: `No se pudo conectar al servidor: ${error.message}` };
    }
    
    const simulacion = await SimulacionConfig.create({
      nombre: `Simulación-${new Date().toISOString()}`,
      activa: true,
      servidor: configuracion.servidor,
      expedienteId: expediente._id,
      pack: configuracion.pack,
      configuracion: {
        duracionTotal: configuracion.duracion || 86400,
        intensidad: configuracion.intensidad || 'media',
        cicloCompleto: configuracion.duracion ? true : false,
        fallos: {
          activados: configuracion.fallos?.activados !== false,
          probabilidad: configuracion.fallos?.probabilidad || 0.3,
          tiposPermitidos: configuracion.fallos?.tiposPermitidos || ['cpu_alta', 'memoria_alta', 'disco_lleno']
        }
      },
      estado: 'ejecutando',
      estadisticas: {
        inicio: new Date(),
        ciclosCompletados: 0,
        fallosInyectados: 0,
        fallosDetectados: 0,
        metricasGeneradas: 0
      }
    });
    
    this.simulacionesActivas.set(simulacion._id.toString(), {
      config: simulacion,
      expediente,
      cicloActual: 'trabajo_normal',
      ultimaMetrica: null,
      contadorCiclo: 0
    });
    
    await EventoAuditoria.create({
      tipo: 'inicio_simulacion',
      modulo: 'robot',
      usuario: 'sistema',
      detalles: {
        simulacionId: simulacion._id,
        servidor: configuracion.servidor.ip,
        pack: configuracion.pack,
        intensidad: configuracion.intensidad,
        duracion: configuracion.duracion
      },
      fecha: new Date()
    });
    
    console.log(`🤖 [SIMULACIÓN] Simulación iniciada: ${simulacion._id}`);
    
    this.iniciarCicloSimulacion(simulacion._id.toString());
    
    return { success: true, simulacionId: simulacion._id, simulacion };
  }
  
  // ============ CICLO DE SIMULACIÓN ============
  
  iniciarCicloSimulacion(simulacionId) {
    const simulacionMem = this.simulacionesActivas.get(simulacionId);
    if (!simulacionMem) return;
    
    const intervalId = setInterval(async () => {
      await this.ejecutarCiclo(simulacionId);
    }, 60000);
    
    this.intervalos.set(simulacionId, intervalId);
    console.log(`🤖 [SIMULACIÓN] Ciclo iniciado para ${simulacionId}`);
  }
  
  async ejecutarCiclo(simulacionId) {
    const simulacionMem = this.simulacionesActivas.get(simulacionId);
    if (!simulacionMem || simulacionMem.config.estado !== 'ejecutando') return;
    
    const simulacion = simulacionMem.config;
    const config = simulacion.configuracion;
    const pack = simulacion.pack;
    
    if (config.duracionTotal > 0) {
      const inicio = new Date(simulacion.estadisticas.inicio);
      const transcurrido = (Date.now() - inicio) / 1000;
      if (transcurrido >= config.duracionTotal) {
        await this.detenerSimulacion(simulacionId, 'completado');
        return;
      }
    }
    
    const ciclo = this.determinarCiclo(simulacion);
    simulacionMem.cicloActual = ciclo;
    simulacionMem.contadorCiclo++;
    
    await this.ejecutarCargaReal(simulacionId, ciclo, pack);
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    let metricasReales = await this.medirMetricasReales(simulacionId, pack);
    
    let metricas = metricasReales || this.generarMetricas(ciclo, config.intensidad, pack);
    
    let falloInjectado = null;
    if (config.fallos.activados && Math.random() < config.fallos.probabilidad) {
      falloInjectado = this.generarFallo(config.fallos.tiposPermitidos, ciclo);
      if (falloInjectado) {
        this.aplicarFalloAMetricas(metricas, falloInjectado.tipo);
        simulacion.estadisticas.fallosInyectados++;
        await simulacion.save();
        
        await this.inyectarFalloReal(simulacionId, falloInjectado.tipo, pack);
        
        await EventoAuditoria.create({
          tipo: 'fallo_simulado_injectado',
          modulo: 'robot',
          usuario: 'sistema',
          detalles: {
            simulacionId,
            tipo: falloInjectado.tipo,
            ciclo,
            metricas
          },
          fecha: new Date()
        });
        
        console.log(`🎯 [SIMULACIÓN] Fallo inyectado: ${falloInjectado.tipo} en ciclo ${ciclo}`);
      }
    }
    
    const metrica = await MetricaSimulacion.create({
      simulacionId,
      expedienteId: simulacion.expedienteId,
      metricas,
      ciclo,
      falloInjectado: falloInjectado ? {
        activo: true,
        tipo: falloInjectado.tipo,
        momento: new Date(),
        simulado: true
      } : { activo: false },
      timestamp: new Date()
    });
    
    simulacion.estadisticas.metricasGeneradas++;
    await simulacion.save();
    
    this.contadorMetricas++;
    
    if (this.contadorMetricas % 10 === 0) {
      console.log(`🤖 [SIMULACIÓN] Métricas generadas: ${this.contadorMetricas}`);
    }
    
    await this.registrarMetricaEnSistema(metrica, simulacion.expedienteId);
  }
  
  determinarCiclo(simulacion) {
    const inicio = new Date(simulacion.estadisticas.inicio);
    const transcurrido = (Date.now() - inicio) / 1000;
    const duracionTotal = simulacion.configuracion.duracionTotal || 86400;
    const porcentaje = (transcurrido / duracionTotal) * 100;
    
    if (porcentaje < 60) return 'trabajo_normal';
    if (porcentaje < 80) return 'carga_progresiva';
    if (porcentaje < 90) return 'pico_maximo';
    return 'reposo';
  }
  
  generarMetricas(ciclo, intensidad, pack) {
    const rangosPorPack = {
      pack_web: {
        trabajo_normal: { cpu: [30, 60], ram: [40, 70], disco: [20, 50] },
        carga_progresiva: { cpu: [60, 85], ram: [65, 85], disco: [40, 70] },
        pico_maximo: { cpu: [85, 98], ram: [80, 95], disco: [60, 85] },
        reposo: { cpu: [5, 20], ram: [10, 30], disco: [5, 15] }
      },
      pack_correo: {
        trabajo_normal: { cpu: [40, 70], ram: [50, 75], disco: [30, 60] },
        carga_progresiva: { cpu: [70, 90], ram: [70, 90], disco: [50, 80] },
        pico_maximo: { cpu: [90, 99], ram: [85, 98], disco: [70, 95] },
        reposo: { cpu: [10, 30], ram: [15, 35], disco: [10, 25] }
      },
      pack_dominio: {
        trabajo_normal: { cpu: [20, 50], ram: [30, 60], disco: [10, 30] },
        carga_progresiva: { cpu: [50, 80], ram: [55, 80], disco: [30, 60] },
        pico_maximo: { cpu: [80, 95], ram: [75, 90], disco: [50, 75] },
        reposo: { cpu: [5, 15], ram: [10, 25], disco: [5, 15] }
      },
      pack_cortafuegos: {
        trabajo_normal: { cpu: [50, 80], ram: [40, 65], disco: [20, 40] },
        carga_progresiva: { cpu: [75, 95], ram: [60, 85], disco: [35, 65] },
        pico_maximo: { cpu: [90, 100], ram: [80, 95], disco: [55, 85] },
        reposo: { cpu: [10, 30], ram: [15, 35], disco: [10, 20] }
      },
      pack_monitoreo: {
        trabajo_normal: { cpu: [25, 55], ram: [35, 65], disco: [15, 35] },
        carga_progresiva: { cpu: [55, 85], ram: [60, 85], disco: [35, 65] },
        pico_maximo: { cpu: [85, 98], ram: [80, 95], disco: [60, 85] },
        reposo: { cpu: [5, 20], ram: [10, 30], disco: [5, 15] }
      }
    };
    
    const rangos = rangosPorPack[pack] || rangosPorPack.pack_web;
    const rango = rangos[ciclo];
    
    const factorIntensidad = {
      baja: 0.6,
      media: 1.0,
      alta: 1.4,
      extrema: 1.8
    }[intensidad] || 1.0;
    
    const randomEntre = (min, max) => min + Math.random() * (max - min);
    
    return {
      cpu: Math.min(100, Math.max(0, randomEntre(rango.cpu[0], rango.cpu[1]) * factorIntensidad)),
      ram: Math.min(100, Math.max(0, randomEntre(rango.ram[0], rango.ram[1]) * factorIntensidad)),
      disco: Math.min(100, Math.max(0, randomEntre(rango.disco[0], rango.disco[1]) * factorIntensidad)),
      red: 0,
      temp: 30 + Math.random() * 40
    };
  }
  
  aplicarFalloAMetricas(metricas, tipoFallo) {
    switch (tipoFallo) {
      case 'cpu_alta':
        metricas.cpu = Math.min(100, metricas.cpu + 30);
        break;
      case 'memoria_alta':
        metricas.ram = Math.min(100, metricas.ram + 25);
        break;
      case 'disco_lleno':
        metricas.disco = Math.min(100, metricas.disco + 35);
        break;
      case 'caida_servicio':
        metricas.cpu = Math.min(100, metricas.cpu + 20);
        metricas.ram = Math.min(100, metricas.ram + 15);
        break;
    }
  }
  
  generarFallo(tiposPermitidos, ciclo) {
    const probabilidadPorCiclo = {
      trabajo_normal: 0.15,
      carga_progresiva: 0.25,
      pico_maximo: 0.4,
      reposo: 0.05
    };
    
    if (Math.random() > probabilidadPorCiclo[ciclo]) return null;
    
    const tipo = tiposPermitidos[Math.floor(Math.random() * tiposPermitidos.length)];
    return { tipo };
  }
  
  async registrarMetricaEnSistema(metrica, expedienteId) {
    if (!expedienteId) return;
    
    try {
      const Metrica = require('../expediente/models/Metrica');
      const Expediente = require('../expediente/models/Expediente');
      
      const expediente = await Expediente.findById(expedienteId);
      if (!expediente) return;
      
      await Metrica.create({
        expedienteId,
        clienteId: expediente.clienteId,
        tipo: 'cpu',
        valor: metrica.metricas.cpu,
        timestamp: metrica.timestamp,
        origen: 'simulacion'
      });
      
      await Metrica.create({
        expedienteId,
        clienteId: expediente.clienteId,
        tipo: 'ram',
        valor: metrica.metricas.ram,
        timestamp: metrica.timestamp,
        origen: 'simulacion'
      });
      
      await Metrica.create({
        expedienteId,
        clienteId: expediente.clienteId,
        tipo: 'disco',
        valor: metrica.metricas.disco,
        timestamp: metrica.timestamp,
        origen: 'simulacion'
      });
      
    } catch (error) {
      console.error('Error registrando métrica en sistema:', error.message);
    }
  }
  
  // ============ CONTROL ============
  
  async pausarSimulacion(simulacionId) {
    const simulacion = await SimulacionConfig.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    simulacion.estado = 'pausado';
    await simulacion.save();
    
    const intervalId = this.intervalos.get(simulacionId);
    if (intervalId) clearInterval(intervalId);
    
    await EventoAuditoria.create({
      tipo: 'simulacion_pausada',
      modulo: 'robot',
      usuario: 'sistema',
      detalles: { simulacionId },
      fecha: new Date()
    });
    
    console.log(`⏸️ [SIMULACIÓN] Pausada: ${simulacionId}`);
    
    return { success: true };
  }
  
  async reanudarSimulacion(simulacionId) {
    const simulacion = await SimulacionConfig.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    simulacion.estado = 'ejecutando';
    await simulacion.save();
    
    this.iniciarCicloSimulacion(simulacionId);
    
    await EventoAuditoria.create({
      tipo: 'simulacion_reanudada',
      modulo: 'robot',
      usuario: 'sistema',
      detalles: { simulacionId },
      fecha: new Date()
    });
    
    console.log(`▶️ [SIMULACIÓN] Reanudada: ${simulacionId}`);
    
    return { success: true };
  }
  
  async detenerSimulacion(simulacionId, estado = 'detenido') {
    const simulacion = await SimulacionConfig.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    simulacion.estado = estado;
    simulacion.estadisticas.fin = new Date();
    await simulacion.save();
    
    const intervalId = this.intervalos.get(simulacionId);
    if (intervalId) clearInterval(intervalId);
    
    this.simulacionesActivas.delete(simulacionId);
    this.intervalos.delete(simulacionId);
    
    const ssh = this.conexionesSSH.get(simulacionId);
    if (ssh) {
      ssh.end();
      this.conexionesSSH.delete(simulacionId);
    }
    
    await EventoAuditoria.create({
      tipo: `simulacion_${estado}`,
      modulo: 'robot',
      usuario: 'sistema',
      detalles: { 
        simulacionId, 
        estadisticas: simulacion.estadisticas,
        metricasGeneradas: this.contadorMetricas
      },
      fecha: new Date()
    });
    
    console.log(`⏹️ [SIMULACIÓN] Detenida (${estado}): ${simulacionId}`);
    console.log(`📊 [SIMULACIÓN] Los datos de aprendizaje se han conservado para el ORÁCULO`);
    
    return { success: true };
  }
  
  // ============ CONSULTAS ============
  
  async listarSimulaciones() {
    const activas = await SimulacionConfig.find({ 
      estado: { $in: ['ejecutando', 'pausado'] } 
    }).sort({ createdAt: -1 });
    
    const historial = await SimulacionConfig.find({ 
      estado: { $in: ['completado', 'detenido', 'error'] } 
    }).sort({ createdAt: -1 }).limit(50);
    
    return { activas, historial };
  }
  
  async obtenerDetalle(simulacionId) {
    const simulacion = await SimulacionConfig.findById(simulacionId);
    if (!simulacion) return null;
    
    const metricas = await MetricaSimulacion.find({ simulacionId })
      .sort({ timestamp: -1 })
      .limit(100);
    
    const resumen = {
      totalMetricas: await MetricaSimulacion.countDocuments({ simulacionId }),
      fallosInyectados: await MetricaSimulacion.countDocuments({ 
        simulacionId, 
        'falloInjectado.activo': true 
      }),
      fallosDetectados: await MetricaSimulacion.countDocuments({ 
        simulacionId, 
        'falloInjectado.activo': true,
        oraculoDetecto: true 
      })
    };
    
    return { simulacion, metricas, resumen };
  }
  
  async obtenerEstadisticas() {
    const total = await SimulacionConfig.countDocuments();
    const completadas = await SimulacionConfig.countDocuments({ estado: 'completado' });
    const activas = await SimulacionConfig.countDocuments({ estado: 'ejecutando' });
    
    const metricasTotales = await MetricaSimulacion.aggregate([
      { $match: { 'falloInjectado.activo': true } },
      { $group: {
          _id: '$falloInjectado.tipo',
          count: { $sum: 1 },
          detectados: { $sum: { $cond: ['$oraculoDetecto', 1, 0] } }
        }
      }
    ]);
    
    const precisionGeneral = await MetricaSimulacion.aggregate([
      { $match: { 'falloInjectado.activo': true } },
      { $group: {
          _id: null,
          total: { $sum: 1 },
          detectados: { $sum: { $cond: ['$oraculoDetecto', 1, 0] } }
        }
      }
    ]);
    
    return {
      totalSimulaciones: total,
      completadas,
      activas,
      precisionPorFallo: metricasTotales,
      precisionGeneral: precisionGeneral[0] 
        ? (precisionGeneral[0].detectados / precisionGeneral[0].total * 100).toFixed(1) + '%'
        : '0%',
      totalMetricasGeneradas: this.contadorMetricas
    };
  }

  // ✅ NUEVO MÉTODO - DENTRO DE LA CLASE
  getSimulacionesActivas() {
    return this.simulacionesActivas;
  }

}

module.exports = RobotSimulacionService;