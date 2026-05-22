// backend/src/robot/RobotContenedoresService.js
const SimulacionContenedores = require('./models/SimulacionContenedores');
const MetricaContenedores = require('./models/MetricaContenedores');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
const Expediente = require('../expediente/models/Expediente');
const Cliente = require('../expediente/models/Cliente');
const { conectarSSH, ejecutarComandoSSH } = require('./utils/sshHelpers');
const { construirComandoInstalacion, actualizarRepositorios } = require('./utils/installHelpers');
const { registrarLog, obtenerLogs } = require('./utils/logHelpers');

class RobotContenedoresService {
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
    let cliente = await Cliente.findOne({ nombre: 'Cliente Simulación Contenedores' });
    if (!cliente) {
      cliente = await Cliente.create({
        nombre: 'Cliente Simulación Contenedores',
        email: 'simulacion-contenedores@centinela.local',
        plan: 'basico',
        activo: true,
        origen: 'simulacion',
        descripcion: 'Cliente para simulaciones de Contenedores del ORÁCULO'
      });
      console.log('✅ [CONTENEDORES] Cliente Simulación Contenedores creado');
    }
    return cliente;
  }

  // ============ CONEXIÓN SSH ============
  
  conectarSSH(simulacionId, servidor) {
    return conectarSSH(simulacionId, servidor, this.conexionesSSH, this.enviarLog.bind(this), 'CONTENEDORES');
  }

  ejecutarComandoSSH(ssh, comando) {
    return ejecutarComandoSSH(ssh, comando);
  }

  // ============ COMANDOS DE CONTENEDORES ============
  
  getRuntimeCommands(runtime) {
    return {
      instalar: runtime === 'docker' 
        ? ['docker.io']
        : ['podman'],
      version: `${runtime} --version`,
      pull: `${runtime} pull ${runtime === 'docker' ? 'nginx:alpine' : 'docker.io/library/nginx:alpine'}`,
      run: (nombre, imagen, puertos = '', recursos = '') => 
        `${runtime} run -d --name ${nombre} ${recursos} ${puertos} ${imagen}`,
      stop: `${runtime} stop`,
      rm: `${runtime} rm`,
      ps: `${runtime} ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"`,
      stats: `${runtime} stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemPerc}}\t{{.MemUsage}}"`,
      images: `${runtime} images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"`,
      volumes: `${runtime} volume ls -q | wc -l`,
      logs: (nombre) => `${runtime} logs ${nombre} --tail 20`
    };
  }
  
  async instalarRuntime(ssh, runtime) {
    this.enviarLog(ssh.simulacionId, `🔧 Instalando ${runtime}...`, 'info');
    
    const cmd = this.getRuntimeCommands(runtime).instalar;
    
    try {
      await actualizarRepositorios(ssh, this.ejecutarComandoSSH.bind(this), ssh.simulacionId, this.enviarLog.bind(this));
      await this.ejecutarComandoSSH(ssh, construirComandoInstalacion(cmd));
      if (runtime === 'docker') {
        await this.ejecutarComandoSSH(ssh, 'systemctl enable docker && systemctl start docker');
      }
      const version = await this.ejecutarComandoSSH(ssh, this.getRuntimeCommands(runtime).version);
      this.enviarLog(ssh.simulacionId, `✅ ${runtime} instalado: ${version}`, 'exito');
      return true;
    } catch (error) {
      this.enviarLog(ssh.simulacionId, `❌ Error instalando ${runtime}: ${error.message}`, 'error');
      return false;
    }
  }
  
  async verificarRuntime(ssh, runtime) {
    try {
      const version = await this.ejecutarComandoSSH(ssh, this.getRuntimeCommands(runtime).version);
      return version.length > 0;
    } catch {
      return false;
    }
  }
  
  async desplegarContenedor(ssh, runtime, nombre, imagen, puertos = '', recursos = '') {
    const cmds = this.getRuntimeCommands(runtime);
    
    // Pull imagen si es necesario
    await this.ejecutarComandoSSH(ssh, cmds.pull);
    
    // Ejecutar contenedor
    const comando = cmds.run(nombre, imagen, puertos, recursos);
    const resultado = await this.ejecutarComandoSSH(ssh, comando);
    
    this.enviarLog(ssh.simulacionId, `🐳 Contenedor ${nombre} desplegado`, 'exito');
    
    return resultado;
  }
  
  async limpiarContenedores(ssh, runtime) {
    const cmds = this.getRuntimeCommands(runtime);
    const psCmd = runtime === 'docker' ? 'docker ps -aq' : 'podman ps -aq';
    
    // Detener todos los contenedores
    await this.ejecutarComandoSSH(ssh, `${cmds.stop} $(${psCmd}) 2>/dev/null || true`);
    // Eliminar todos los contenedores
    await this.ejecutarComandoSSH(ssh, `${cmds.rm} $(${psCmd}) 2>/dev/null || true`);
    
    this.enviarLog(ssh.simulacionId, `🧹 Contenedores limpiados`, 'info');
  }
  
  async obtenerMetricasContenedores(ssh, runtime) {
    const metricas = {};
    const cmds = this.getRuntimeCommands(runtime);
    
    try {
      // Listar contenedores
      const ps = await this.ejecutarComandoSSH(ssh, cmds.ps);
      const lineas = ps.split('\n').filter(l => l.trim() && !l.includes('NAMES'));
      
      metricas.contenedoresTotales = lineas.length;
      metricas.contenedoresRunning = lineas.filter(l => l.includes('Up')).length;
      metricas.contenedoresStopped = lineas.filter(l => l.includes('Exited')).length;
      metricas.contenedoresFailed = lineas.filter(l => l.includes('Created') && !l.includes('Up')).length;
      
      // Obtener estadísticas de recursos
      try {
        const stats = await this.ejecutarComandoSSH(ssh, cmds.stats);
        const statsLines = stats.split('\n').filter(l => l.trim() && !l.includes('NAME'));
        
        let totalCPU = 0, totalRAM = 0;
        let maxCPU = 0, maxCPUName = '';
        
        for (const line of statsLines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 3) {
            const cpu = parseFloat(parts[1].replace('%', '')) || 0;
            const ram = parseFloat(parts[2].replace('%', '')) || 0;
            totalCPU += cpu;
            totalRAM += ram;
            if (cpu > maxCPU) {
              maxCPU = cpu;
              maxCPUName = parts[0];
            }
          }
        }
        
        metricas.usoCPU = Math.min(100, totalCPU);
        metricas.usoRAM = Math.min(100, totalRAM);
        metricas.contenedorMasCargado = maxCPUName;
      } catch (e) {
        metricas.usoCPU = 0;
        metricas.usoRAM = 0;
      }
      
      // Contar imágenes locales
      const images = await this.ejecutarComandoSSH(ssh, cmds.images);
      metricas.imagenesLocal = images.split('\n').filter(l => l.trim() && !l.includes('REPOSITORY')).length;
      
      // Contar volúmenes
      const volumes = await this.ejecutarComandoSSH(ssh, cmds.volumes);
      metricas.volumenesUsados = parseInt(volumes) || 0;
      
    } catch (error) {
      console.error('Error obteniendo métricas de contenedores:', error.message);
    }
    
    return metricas;
  }

  // ============ PARÁMETROS POR CICLO ============
  
  getCicloSegunProgreso(simulacion) {
    const inicio = new Date(simulacion.estadisticas.inicio);
    const transcurrido = (Date.now() - inicio) / 1000;
    const duracionTotal = simulacion.configuracion.duracionTotal || 3600;
    const porcentaje = (transcurrido / duracionTotal) * 100;
    
    if (porcentaje < 60) return 'despliegue';
    if (porcentaje < 80) return 'escalamiento';
    if (porcentaje < 90) return 'carga_maxima';
    return 'limpieza';
  }
  
  getNumeroContenedoresPorCiclo(ciclo, intensidad) {
    const factores = {
      baja: { despliegue: 2, escalamiento: 5, carga_maxima: 10 },
      media: { despliegue: 3, escalamiento: 8, carga_maxima: 15 },
      alta: { despliegue: 5, escalamiento: 12, carga_maxima: 25 },
      extrema: { despliegue: 8, escalamiento: 20, carga_maxima: 40 }
    };
    
    const factor = factores[intensidad] || factores.media;
    return factor[ciclo] || 2;
  }
  
  async ejecutarDespliegues(ssh, runtime, ciclo, intensidad, config) {
    const numContenedores = this.getNumeroContenedoresPorCiclo(ciclo, intensidad);
    const inicioDespliegue = Date.now();
    
    this.enviarLog(ssh.simulacionId, `🐳 Desplegando ${numContenedores} contenedores...`, 'info');
    
    const contenedores = [];
    const imagenes = ['nginx:alpine', 'redis:alpine', 'alpine:latest'];
    
    for (let i = 1; i <= numContenedores; i++) {
      const nombre = `test-${ciclo}-${i}`;
      const imagen = imagenes[i % imagenes.length];
      
      try {
        await this.desplegarContenedor(ssh, runtime, nombre, imagen);
        contenedores.push({ nombre, imagen, estado: 'running' });
      } catch (error) {
        this.enviarLog(ssh.simulacionId, `❌ Error desplegando ${nombre}: ${error.message}`, 'error');
        contenedores.push({ nombre, imagen, estado: 'failed' });
      }
    }
    
    const tiempoDespliegue = (Date.now() - inicioDespliegue) / 1000;
    this.enviarLog(ssh.simulacionId, `✅ Despliegue completado en ${tiempoDespliegue}s`, 'exito');
    
    return { contenedores, tiempoDespliegue, total: numContenedores };
  }
  
  generarFallo(tiposPermitidos, intensidad) {
    const factoresIntensidad = { baja: 0.1, media: 0.25, alta: 0.4, extrema: 0.6 };
    const prob = factoresIntensidad[intensidad] || 0.25;
    
    if (Math.random() > prob) return null;
    
    const tipo = tiposPermitidos[Math.floor(Math.random() * tiposPermitidos.length)];
    return { tipo };
  }
  
  async inyectarFalloReal(ssh, runtime, tipoFallo) {
    const cmds = this.getRuntimeCommands(runtime);
    
    this.enviarLog(ssh.simulacionId, `🎯 Inyectando fallo: ${tipoFallo}`, 'error');
    
    try {
      switch(tipoFallo) {
        case 'no_arranca':
          // Crear contenedor con imagen que no existe
          await this.ejecutarComandoSSH(ssh, `${cmds.run('fail-container', 'imagen-inexistente:latest')} 2>/dev/null || true`);
          break;
          
        case 'recursos_limitados':
          // Limitar recursos de un contenedor existente
          await this.ejecutarComandoSSH(ssh, `${cmds.run('limit-container', 'nginx:alpine', '', '--memory="50m" --cpus="0.1"')}`);
          break;
          
        case 'caida_red':
          // Desconectar red del contenedor (si existe)
          await this.ejecutarComandoSSH(ssh, `${runtime} network disconnect bridge $(docker ps -q | head -1) 2>/dev/null || true`);
          setTimeout(() => {
            this.ejecutarComandoSSH(ssh, `${runtime} network connect bridge $(docker ps -q | head -1) 2>/dev/null || true`);
          }, 15000);
          break;
          
        case 'imagen_corrupta':
          // Intentar corromper una imagen (simulado)
          await this.ejecutarComandoSSH(ssh, `${cmds.rm} fail-image 2>/dev/null || true`);
          break;
          
        case 'puerto_conflicto':
          // Crear contenedor con puerto ya usado
          await this.ejecutarComandoSSH(ssh, `${cmds.run('conflict-container', 'nginx:alpine', '-p 80:80')} 2>/dev/null || true`);
          await this.ejecutarComandoSSH(ssh, `${cmds.run('conflict-container2', 'nginx:alpine', '-p 80:80')} 2>/dev/null || true`);
          break;
      }
    } catch (error) {
      console.error('Error inyectando fallo:', error.message);
    }
  }
  
  aplicarFalloAMetricas(metricas, tipoFallo) {
    switch(tipoFallo) {
      case 'no_arranca':
        metricas.contenedoresFailed = (metricas.contenedoresFailed || 0) + 1;
        break;
      case 'recursos_limitados':
        metricas.usoCPU = Math.min(100, (metricas.usoCPU || 0) + 20);
        metricas.usoRAM = Math.min(100, (metricas.usoRAM || 0) + 30);
        break;
      case 'puerto_conflicto':
        metricas.contenedoresFailed = (metricas.contenedoresFailed || 0) + 1;
        break;
    }
  }

  // ============ REGISTRO DE LOGS ============
  
  enviarLog(simulacionId, mensaje, tipo = 'info') {
    return registrarLog(simulacionId, mensaje, tipo, this.logsSimulacion, this.sseStreams, 'CONTENEDORES');
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
        tipo: 'contenedor',
        valor: metrica.metricas.contenedoresTotales,
        timestamp: metrica.timestamp,
        origen: 'simulacion',
        detalles: {
          contenedoresTotales: metrica.metricas.contenedoresTotales,
          contenedoresRunning: metrica.metricas.contenedoresRunning,
          contenedoresFailed: metrica.metricas.contenedoresFailed,
          usoCPU: metrica.metricas.usoCPU,
          usoRAM: metrica.metricas.usoRAM,
          tiempoDespliegue: metrica.metricas.tiempoDespliegue,
          contenedorMasCargado: metrica.metricas.contenedorMasCargado,
          pruebaActiva: metrica.pruebaActiva
        }
      });
      
    } catch (error) {
      console.error('Error registrando métrica de contenedores:', error.message);
    }
  }

  // ============ INICIAR SIMULACIÓN ============
  
  async iniciarSimulacion(configuracion) {
    console.log('📦 [CONTENEDORES] Iniciando simulación de Contenedores...');
    
    const clienteSimulacion = await this.obtenerClienteSimulacion();
    const runtime = configuracion.runtime || 'docker';
    
    // Crear expediente
    const expediente = await Expediente.create({
      nombre: `Simulación Contenedores-${configuracion.servidor.ip}`,
      clienteId: clienteSimulacion._id,
      origen: 'simulacion',
      servidor: {
        ip: configuracion.servidor.ip,
        puerto: configuracion.servidor.puerto || 22,
        usuario: configuracion.servidor.usuario,
        password: configuracion.servidor.password
      }
    });
    
    this.enviarLog(expediente._id.toString(), `📦 Iniciando simulación de Contenedores`, 'info');
    this.enviarLog(expediente._id.toString(), `🐳 Runtime: ${runtime}`, 'info');
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
    
    // Verificar/instalar runtime
    let runtimeActivo = await this.verificarRuntime(ssh, runtime);
    
    if (!runtimeActivo) {
      this.enviarLog(expediente._id.toString(), `⚠️ ${runtime} no encontrado, instalando...`, 'info');
      await this.instalarRuntime(ssh, runtime);
      runtimeActivo = await this.verificarRuntime(ssh, runtime);
    }
    
    if (!runtimeActivo) {
      this.enviarLog(expediente._id.toString(), `❌ No se pudo instalar/verificar ${runtime}`, 'error');
      return { success: false, error: `${runtime} no disponible` };
    }
    
    // Crear simulación
    const simulacion = await SimulacionContenedores.create({
      nombre: `Simulación Contenedores-${new Date().toISOString()}`,
      activa: true,
      servidor: configuracion.servidor,
      expedienteId: expediente._id,
      configuracion: {
        duracionTotal: configuracion.duracion || 3600,
        intensidad: configuracion.intensidad || 'media',
        runtime,
        contenedores: {
          nginx: true,
          redis: configuracion.redis || false,
          postgres: configuracion.postgres || false,
          nodejs: configuracion.nodejs || false
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
        contenedoresDesplegados: 0
      }
    });
    
    this.simulacionesActivas.set(simulacion._id.toString(), {
      config: simulacion,
      expediente,
      ssh,
      runtime
    });
    
    this.enviarLog(expediente._id.toString(), `🚀 Simulación de Contenedores iniciada`, 'exito');
    
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
    const runtime = simulacionMem.runtime;
    const config = simulacion.configuracion;
    
    // Verificar si terminó
    const inicio = new Date(simulacion.estadisticas.inicio);
    if (Date.now() - inicio > config.duracionTotal * 1000) {
      await this.detenerSimulacion(simulacionId, 'completado');
      return;
    }
    
    // Determinar ciclo actual
    const ciclo = this.getCicloSegunProgreso(simulacion);
    this.enviarLog(simulacionId, `📊 Ciclo: ${ciclo}`, 'info');
    
    let tiempoDespliegue = 0;
    let contenedoresCreados = 0;
    
    // Ejecutar despliegues según ciclo
    if (ciclo !== 'limpieza') {
      const resultado = await this.ejecutarDespliegues(ssh, runtime, ciclo, config.intensidad, config.contenedores);
      tiempoDespliegue = resultado.tiempoDespliegue;
      contenedoresCreados = resultado.total;
      
      simulacion.estadisticas.contenedoresDespliegados += contenedoresCreados;
      await simulacion.save();
    } else {
      await this.limpiarContenedores(ssh, runtime);
    }
    
    // Medir métricas
    const metricasReales = await this.obtenerMetricasContenedores(ssh, runtime);
    metricasReales.tiempoDespliegue = tiempoDespliegue;
    
    let falloInjectado = null;
    
    // Decidir si inyectar fallo
    if (config.fallos.activados) {
      falloInjectado = this.generarFallo(['no_arranca', 'recursos_limitados', 'puerto_conflicto'], config.intensidad);
      if (falloInjectado) {
        this.aplicarFalloAMetricas(metricasReales, falloInjectado.tipo);
        await this.inyectarFalloReal(ssh, runtime, falloInjectado.tipo);
        simulacion.estadisticas.fallosInyectados = (simulacion.estadisticas.fallosInyectados || 0) + 1;
        await simulacion.save();
        
        await EventoAuditoria.create({
          tipo: 'fallo_contenedor_injectado',
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
    const metrica = await MetricaContenedores.create({
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
    
    // Mostrar resumen
    this.enviarLog(simulacionId, `📈 Contenedores: ${metricasReales.contenedoresRunning}/${metricasReales.contenedoresTotales} running`, 'info');
    this.enviarLog(simulacionId, `💻 CPU: ${metricasReales.usoCPU?.toFixed(1)}% | RAM: ${metricasReales.usoRAM?.toFixed(1)}%`, 'info');
  }
  
  // ============ CONTROL ============
  
  async pausarSimulacion(simulacionId) {
    const simulacion = await SimulacionContenedores.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    simulacion.estado = 'pausado';
    await simulacion.save();
    
    const intervalId = this.intervalos.get(simulacionId);
    if (intervalId) clearInterval(intervalId);
    
    await EventoAuditoria.create({
      tipo: 'simulacion_contenedores_pausada',
      modulo: 'robot',
      usuario: 'sistema',
      detalles: { simulacionId },
      fecha: new Date()
    });
    
    this.enviarLog(simulacionId, `⏸️ Simulación pausada`, 'info');
    
    return { success: true };
  }
  
  async reanudarSimulacion(simulacionId) {
    const simulacion = await SimulacionContenedores.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    simulacion.estado = 'ejecutando';
    await simulacion.save();
    
    this.iniciarCiclo(simulacionId);
    
    await EventoAuditoria.create({
      tipo: 'simulacion_contenedores_reanudada',
      modulo: 'robot',
      usuario: 'sistema',
      detalles: { simulacionId },
      fecha: new Date()
    });
    
    this.enviarLog(simulacionId, `▶️ Simulación reanudada`, 'info');
    
    return { success: true };
  }
  
  async detenerSimulacion(simulacionId, estado = 'detenido') {
    const simulacion = await SimulacionContenedores.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    const ssh = this.conexionesSSH.get(simulacionId);
    if (ssh) {
      await this.limpiarContenedores(ssh, simulacion.configuracion.runtime);
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
      tipo: `simulacion_contenedores_${estado}`,
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
    const activas = await SimulacionContenedores.find({ estado: 'ejecutando' }).sort({ createdAt: -1 });
    const historial = await SimulacionContenedores.find({ estado: { $ne: 'ejecutando' } }).sort({ createdAt: -1 }).limit(50);
    
    return { activas, historial };
  }
  
  async obtenerDetalle(simulacionId) {
    const simulacion = await SimulacionContenedores.findById(simulacionId);
    if (!simulacion) return null;
    
    const metricas = await MetricaContenedores.find({ simulacionId }).sort({ timestamp: -1 }).limit(100);
    const logs = obtenerLogs(simulacionId, this.logsSimulacion);
    
    return { simulacion, metricas, logs };
  }
  
  async obtenerEstadisticas() {
    const total = await SimulacionContenedores.countDocuments();
    const activas = await SimulacionContenedores.countDocuments({ estado: 'ejecutando' });
    const completadas = await SimulacionContenedores.countDocuments({ estado: 'completado' });
    
    return {
      total,
      activas,
      completadas,
      totalMetricasGeneradas: this.contadorMetricas
    };
  }
}

module.exports = RobotContenedoresService;