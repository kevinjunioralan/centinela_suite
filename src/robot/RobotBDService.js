// backend/src/robot/RobotBDService.js
const SimulacionBD = require('./models/SimulacionBD');
const MetricaBD = require('./models/MetricaBD');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
const Expediente = require('../expediente/models/Expediente');
const Cliente = require('../expediente/models/Cliente');
const { conectarSSH, ejecutarComandoSSH } = require('./utils/sshHelpers');
const { construirComandoInstalacion, actualizarRepositorios } = require('./utils/installHelpers');
const { registrarLog, obtenerLogs } = require('./utils/logHelpers');

class RobotBDService {
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
    let cliente = await Cliente.findOne({ nombre: 'Cliente Simulación Base Datos' });
    if (!cliente) {
      cliente = await Cliente.create({
        nombre: 'Cliente Simulación Base Datos',
        email: 'simulacion-bd@centinela.local',
        plan: 'basico',
        activo: true,
        origen: 'simulacion',
        descripcion: 'Cliente para simulaciones de Base de Datos del ORÁCULO'
      });
      console.log('✅ [BD] Cliente Simulación Base Datos creado');
    }
    return cliente;
  }

  // ============ CONEXIÓN SSH ============
  
  conectarSSH(simulacionId, servidor) {
    return conectarSSH(simulacionId, servidor, this.conexionesSSH, this.enviarLog.bind(this), 'BD');
  }

  ejecutarComandoSSH(ssh, comando) {
    return ejecutarComandoSSH(ssh, comando);
  }

  // ============ COMANDOS POR TIPO DE BD ============
  
  getComandosPorTipo(tipoBD, baseDatos = 'testdb') {
    const comandos = {
      postgresql: {
        instalar: ['postgresql', 'postgresql-contrib'],
        verificar: 'systemctl is-active postgresql',
        crearBD: `sudo -u postgres psql -c "CREATE DATABASE ${baseDatos}" 2>/dev/null || true`,
        crearTabla: `sudo -u postgres psql -d ${baseDatos} -c "CREATE TABLE IF NOT EXISTS test_table (id SERIAL PRIMARY KEY, data TEXT, created_at TIMESTAMP DEFAULT NOW())"`,
        consultaSimple: `sudo -u postgres psql -d ${baseDatos} -c "SELECT COUNT(*) FROM test_table"`,
        consultaCompleja: `sudo -u postgres psql -d ${baseDatos} -c "SELECT * FROM test_table WHERE data LIKE '%test%' ORDER BY created_at"`,
        consultaMasiva: `sudo -u postgres psql -d ${baseDatos} -c "INSERT INTO test_table (data) SELECT generate_series(1,1000), 'test_data_' || generate_series"`,
        metricas: {
          conexiones: `sudo -u postgres psql -t -c "SELECT count(*) FROM pg_stat_activity"`,
          tamanio: `sudo -u postgres psql -t -c "SELECT pg_database_size('${baseDatos}')/1024/1024"`,
          consultasPorSegundo: `sudo -u postgres psql -t -c "SELECT (SELECT sum(xact_commit+xact_rollback) FROM pg_stat_database WHERE datname='${baseDatos}')/60"`,
          tiempoRespuesta: `echo "SELECT 1" | time sudo -u postgres psql -d ${baseDatos} 2>&1 | grep real | awk '{print $2}' | sed 's/[^0-9.]//g'`
        },
        fallos: {
          queryLenta: `sudo -u postgres psql -d ${baseDatos} -c "SELECT pg_sleep(5), * FROM test_table, test_table"`,
          deadlock: `sudo -u postgres psql -d ${baseDatos} -c "BEGIN; LOCK TABLE test_table IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(10); COMMIT" &`,
          poolAgotado: `for i in {1..200}; do sudo -u postgres psql -d ${baseDatos} -c "SELECT pg_sleep(60)" & done`,
          tablaCorrupta: `sudo -u postgres psql -d ${baseDatos} -c "DROP TABLE test_table CASCADE"`
        },
        recuperacion: {
          queryLenta: `pkill -f "SELECT pg_sleep" 2>/dev/null || true`,
          deadlock: `pkill -f "LOCK TABLE" 2>/dev/null || true`,
          poolAgotado: `pkill -f "SELECT pg_sleep" 2>/dev/null || true`,
          tablaCorrupta: `sudo -u postgres psql -d ${baseDatos} -c "CREATE TABLE test_table (id SERIAL PRIMARY KEY, data TEXT)"`
        }
      },
      mysql: {
        instalar: ['mysql-server'],
        verificar: 'systemctl is-active mysql',
        crearBD: `mysql -e "CREATE DATABASE IF NOT EXISTS ${baseDatos}"`,
        crearTabla: `mysql -D ${baseDatos} -e "CREATE TABLE IF NOT EXISTS test_table (id INT AUTO_INCREMENT PRIMARY KEY, data TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"`,
        consultaSimple: `mysql -D ${baseDatos} -e "SELECT COUNT(*) FROM test_table"`,
        consultaCompleja: `mysql -D ${baseDatos} -e "SELECT * FROM test_table WHERE data LIKE '%test%' ORDER BY created_at"`,
        metricas: {
          conexiones: `mysql -e "SHOW STATUS LIKE 'Threads_connected'" | awk 'NR==2{print $2}'`,
          tamanio: `mysql -e "SELECT SUM(data_length+index_length)/1024/1024 FROM information_schema.tables WHERE table_schema='${baseDatos}'"`
        }
      },
      mongodb: {
        instalar: ['mongodb'],
        verificar: 'systemctl is-active mongodb',
        crearBD: `mongo ${baseDatos} --eval "db.createCollection('test_collection')"`,
        consultaSimple: `mongo ${baseDatos} --eval "db.test_collection.count()"`,
        metricas: {
          conexiones: `mongo --eval "db.serverStatus().connections.current"`
        }
      }
    };
    
    return comandos[tipoBD] || comandos.postgresql;
  }

  // ============ INSTALACIÓN Y VERIFICACIÓN ============
  
  async instalarBaseDatos(ssh, tipoBD) {
    this.enviarLog(ssh.simulacionId, `🔧 Instalando ${tipoBD}...`, 'info');
    
    const comandos = this.getComandosPorTipo(tipoBD);
    
    try {
      await actualizarRepositorios(ssh, this.ejecutarComandoSSH.bind(this), ssh.simulacionId, this.enviarLog.bind(this));
      await this.ejecutarComandoSSH(ssh, construirComandoInstalacion(comandos.instalar));
      this.enviarLog(ssh.simulacionId, `✅ ${tipoBD} instalado correctamente`, 'exito');
      return true;
    } catch (error) {
      this.enviarLog(ssh.simulacionId, `❌ Error instalando ${tipoBD}: ${error.message}`, 'error');
      return false;
    }
  }
  
  async verificarBaseDatos(ssh, tipoBD) {
    const comandos = this.getComandosPorTipo(tipoBD);
    
    try {
      const resultado = await this.ejecutarComandoSSH(ssh, comandos.verificar);
      const activo = resultado.includes('active');
      this.enviarLog(ssh.simulacionId, `📊 ${tipoBD}: ${activo ? 'activo ✅' : 'inactivo ❌'}`, activo ? 'exito' : 'error');
      return activo;
    } catch (error) {
      this.enviarLog(ssh.simulacionId, `❌ Error verificando ${tipoBD}: ${error.message}`, 'error');
      return false;
    }
  }
  
  async prepararBaseDatos(ssh, tipoBD, baseDatos) {
    const comandos = this.getComandosPorTipo(tipoBD, baseDatos);
    
    this.enviarLog(ssh.simulacionId, `🔧 Preparando base de datos ${baseDatos}...`, 'info');
    
    try {
      await this.ejecutarComandoSSH(ssh, comandos.crearBD);
      await this.ejecutarComandoSSH(ssh, comandos.crearTabla);
      this.enviarLog(ssh.simulacionId, `✅ Base de datos ${baseDatos} preparada`, 'exito');
      return true;
    } catch (error) {
      this.enviarLog(ssh.simulacionId, `❌ Error preparando BD: ${error.message}`, 'error');
      return false;
    }
  }

  // ============ CARGAS POR CICLO ============
  
  async ejecutarCarga(ssh, tipoBD, ciclo, baseDatos) {
    const comandos = this.getComandosPorTipo(tipoBD, baseDatos);
    
    switch(ciclo) {
      case 'consultas_simples':
        this.enviarLog(ssh.simulacionId, `📊 Ejecutando consultas simples`, 'info');
        for (let i = 0; i < 10; i++) {
          await this.ejecutarComandoSSH(ssh, comandos.consultaSimple);
        }
        break;
        
      case 'consultas_complejas':
        this.enviarLog(ssh.simulacionId, `📈 Ejecutando consultas complejas`, 'info');
        for (let i = 0; i < 5; i++) {
          await this.ejecutarComandoSSH(ssh, comandos.consultaCompleja);
        }
        break;
        
      case 'consultas_masivas':
        this.enviarLog(ssh.simulacionId, `🚀 Ejecutando consultas masivas`, 'info');
        await this.ejecutarComandoSSH(ssh, comandos.consultaMasiva);
        break;
        
      case 'transacciones':
        this.enviarLog(ssh.simulacionId, `🔄 Ejecutando transacciones`, 'info');
        for (let i = 0; i < 20; i++) {
          await this.ejecutarComandoSSH(ssh, `sudo -u postgres psql -d ${baseDatos} -c "BEGIN; INSERT INTO test_table (data) VALUES ('test'); COMMIT"`);
        }
        break;
        
      case 'backup':
        this.enviarLog(ssh.simulacionId, `💾 Ejecutando backup`, 'info');
        const inicio = Date.now();
        await this.ejecutarComandoSSH(ssh, `sudo -u postgres pg_dump ${baseDatos} > /tmp/backup.sql`);
        const tiempoBackup = (Date.now() - inicio) / 1000;
        this.enviarLog(ssh.simulacionId, `✅ Backup completado en ${tiempoBackup}s`, 'exito');
        return tiempoBackup;
        
      case 'reposo':
        this.enviarLog(ssh.simulacionId, `💤 Modo reposo`, 'info');
        break;
    }
    
    return null;
  }
  
  // ============ MEDICIÓN DE MÉTRICAS ============
  
  async medirMetricasBD(ssh, tipoBD, baseDatos) {
    const comandos = this.getComandosPorTipo(tipoBD, baseDatos);
    const metricas = {};
    
    try {
      // Medir tiempo de respuesta
      const inicioRespuesta = Date.now();
      await this.ejecutarComandoSSH(ssh, comandos.consultaSimple);
      metricas.tiempoRespuesta = Date.now() - inicioRespuesta;
      
      // Medir conexiones activas
      const conexiones = await this.ejecutarComandoSSH(ssh, comandos.metricas.conexiones);
      metricas.conexionesActivas = parseInt(conexiones) || 0;
      
      // Medir tamaño de BD
      const tamanio = await this.ejecutarComandoSSH(ssh, comandos.metricas.tamanio);
      metricas.tamanioBD = parseFloat(tamanio) || 0;
      
      // Medir uso de CPU y RAM
      const cpu = await this.ejecutarComandoSSH(ssh, `top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`);
      const ram = await this.ejecutarComandoSSH(ssh, `free -m | awk 'NR==2{printf "%.0f", $3/$2*100}'`);
      metricas.usoCPU = parseFloat(cpu) || 0;
      metricas.usoRAM = parseFloat(ram) || 0;
      
    } catch (error) {
      console.error('Error midiendo métricas de BD:', error.message);
      metricas.tiempoRespuesta = 0;
      metricas.conexionesActivas = 0;
      metricas.tamanioBD = 0;
    }
    
    return metricas;
  }
  
  // ============ PARÁMETROS POR CICLO ============
  
  getCicloSegunProgreso(simulacion) {
    const inicio = new Date(simulacion.estadisticas.inicio);
    const transcurrido = (Date.now() - inicio) / 1000;
    const duracionTotal = simulacion.configuracion.duracionTotal || 3600;
    const porcentaje = (transcurrido / duracionTotal) * 100;
    
    if (porcentaje < 60) return 'consultas_simples';
    if (porcentaje < 70) return 'consultas_complejas';
    if (porcentaje < 80) return 'consultas_masivas';
    if (porcentaje < 85) return 'transacciones';
    if (porcentaje < 90) return 'backup';
    return 'reposo';
  }
  
  generarFallo(tiposPermitidos, intensidad) {
    const factoresIntensidad = { baja: 0.1, media: 0.25, alta: 0.4, extrema: 0.6 };
    const prob = factoresIntensidad[intensidad] || 0.25;
    
    if (Math.random() > prob) return null;
    
    const tipo = tiposPermitidos[Math.floor(Math.random() * tiposPermitidos.length)];
    return { tipo };
  }
  
  async inyectarFalloReal(ssh, tipoFallo, tipoBD, baseDatos) {
    const comandos = this.getComandosPorTipo(tipoBD, baseDatos);
    
    this.enviarLog(ssh.simulacionId, `🎯 Inyectando fallo: ${tipoFallo}`, 'error');
    
    try {
      switch(tipoFallo) {
        case 'query_lenta':
          await this.ejecutarComandoSSH(ssh, comandos.fallos.queryLenta);
          setTimeout(async () => {
            await this.ejecutarComandoSSH(ssh, comandos.recuperacion.queryLenta);
            this.enviarLog(ssh.simulacionId, `🔄 Fallo recuperado: ${tipoFallo}`, 'exito');
          }, 15000);
          break;
          
        case 'deadlock':
          await this.ejecutarComandoSSH(ssh, comandos.fallos.deadlock);
          setTimeout(async () => {
            await this.ejecutarComandoSSH(ssh, comandos.recuperacion.deadlock);
            this.enviarLog(ssh.simulacionId, `🔄 Fallo recuperado: ${tipoFallo}`, 'exito');
          }, 20000);
          break;
          
        case 'pool_agotado':
          await this.ejecutarComandoSSH(ssh, comandos.fallos.poolAgotado);
          setTimeout(async () => {
            await this.ejecutarComandoSSH(ssh, comandos.recuperacion.poolAgotado);
            this.enviarLog(ssh.simulacionId, `🔄 Fallo recuperado: ${tipoFallo}`, 'exito');
          }, 30000);
          break;
          
        case 'tabla_corrupta':
          await this.ejecutarComandoSSH(ssh, comandos.fallos.tablaCorrupta);
          setTimeout(async () => {
            await this.ejecutarComandoSSH(ssh, comandos.recuperacion.tablaCorrupta);
            this.enviarLog(ssh.simulacionId, `🔄 Fallo recuperado: ${tipoFallo}`, 'exito');
          }, 10000);
          break;
      }
    } catch (error) {
      console.error('Error inyectando fallo:', error.message);
    }
  }
  
  aplicarFalloAMetricas(metricas, tipoFallo) {
    switch(tipoFallo) {
      case 'query_lenta':
        metricas.tiempoRespuesta = Math.min(30000, metricas.tiempoRespuesta * 10);
        break;
      case 'deadlock':
        metricas.conexionesActivas = 0;
        metricas.tiempoRespuesta = 5000;
        break;
      case 'pool_agotado':
        metricas.conexionesActivas = 100;
        break;
      case 'tabla_corrupta':
        metricas.tiempoRespuesta = 0;
        break;
    }
  }

  // ============ REGISTRO DE LOGS ============
  
  enviarLog(simulacionId, mensaje, tipo = 'info') {
    return registrarLog(simulacionId, mensaje, tipo, this.logsSimulacion, this.sseStreams, 'BD');
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
        tipo: 'bd',
        valor: metrica.metricas.tiempoRespuesta,
        timestamp: metrica.timestamp,
        origen: 'simulacion',
        detalles: {
          tiempoRespuesta: metrica.metricas.tiempoRespuesta,
          conexionesActivas: metrica.metricas.conexionesActivas,
          tamanioBD: metrica.metricas.tamanioBD,
          usoCPU: metrica.metricas.usoCPU,
          usoRAM: metrica.metricas.usoRAM,
          pruebaActiva: metrica.pruebaActiva
        }
      });
      
    } catch (error) {
      console.error('Error registrando métrica de BD:', error.message);
    }
  }

  // ============ INICIAR SIMULACIÓN ============
  
  async iniciarSimulacion(configuracion) {
    console.log('💾 [BD] Iniciando simulación de Base de Datos...');
    
    const clienteSimulacion = await this.obtenerClienteSimulacion();
    const tipoBD = configuracion.tipoBD || 'postgresql';
    const baseDatos = configuracion.baseDatos || 'testdb_' + Date.now();
    
    // Crear expediente
    const expediente = await Expediente.create({
      nombre: `Simulación BD-${configuracion.servidor.ip}`,
      clienteId: clienteSimulacion._id,
      origen: 'simulacion',
      servidor: {
        ip: configuracion.servidor.ip,
        puerto: configuracion.servidor.puerto || 22,
        usuario: configuracion.servidor.usuario,
        password: configuracion.servidor.password
      }
    });
    
    this.enviarLog(expediente._id.toString(), `💾 Iniciando simulación de Base de Datos`, 'info');
    this.enviarLog(expediente._id.toString(), `🗄️ Tipo: ${tipoBD}`, 'info');
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
    
    // Verificar/instalar base de datos
    let bdActiva = await this.verificarBaseDatos(ssh, tipoBD);
    
    if (!bdActiva) {
      this.enviarLog(expediente._id.toString(), `⚠️ Base de datos no encontrada, instalando...`, 'info');
      await this.instalarBaseDatos(ssh, tipoBD);
      bdActiva = await this.verificarBaseDatos(ssh, tipoBD);
    }
    
    if (!bdActiva) {
      this.enviarLog(expediente._id.toString(), `❌ No se pudo instalar/verificar la base de datos`, 'error');
      return { success: false, error: 'Base de datos no disponible' };
    }
    
    // Preparar base de datos de prueba
    await this.prepararBaseDatos(ssh, tipoBD, baseDatos);
    
    // Crear simulación
    const simulacion = await SimulacionBD.create({
      nombre: `Simulación BD-${new Date().toISOString()}`,
      activa: true,
      servidor: configuracion.servidor,
      expedienteId: expediente._id,
      configuracion: {
        duracionTotal: configuracion.duracion || 3600,
        intensidad: configuracion.intensidad || 'media',
        tipoBD,
        fallos: {
          activados: configuracion.fallos?.activados !== false,
          probabilidad: configuracion.fallos?.probabilidad || 0.25,
          tiposPermitidos: configuracion.fallos?.tiposPermitidos || ['query_lenta', 'deadlock', 'pool_agotado']
        },
        baseDatos
      },
      estado: 'ejecutando',
      estadisticas: {
        inicio: new Date(),
        metricasGeneradas: 0,
        consultasRealizadas: 0
      }
    });
    
    this.simulacionesActivas.set(simulacion._id.toString(), {
      config: simulacion,
      expediente,
      ssh,
      tipoBD,
      baseDatos
    });
    
    this.enviarLog(expediente._id.toString(), `🚀 Simulación de Base de Datos iniciada`, 'exito');
    
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
    const tipoBD = simulacionMem.tipoBD;
    const baseDatos = simulacionMem.baseDatos;
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
    
    // Ejecutar carga según ciclo
    let tiempoBackup = null;
    if (ciclo !== 'reposo') {
      tiempoBackup = await this.ejecutarCarga(ssh, tipoBD, ciclo, baseDatos);
    }
    
    // Medir métricas
    const metricasReales = await this.medirMetricasBD(ssh, tipoBD, baseDatos);
    
    if (tiempoBackup) {
      metricasReales.tiempoBackup = tiempoBackup;
    }
    
    let falloInjectado = null;
    
    // Decidir si inyectar fallo
    if (config.fallos.activados) {
      falloInjectado = this.generarFallo(config.fallos.tiposPermitidos, config.intensidad);
      if (falloInjectado) {
        this.aplicarFalloAMetricas(metricasReales, falloInjectado.tipo);
        await this.inyectarFalloReal(ssh, falloInjectado.tipo, tipoBD, baseDatos);
        simulacion.estadisticas.fallosInyectados++;
        await simulacion.save();
        
        await EventoAuditoria.create({
          tipo: 'fallo_bd_injectado',
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
    const metrica = await MetricaBD.create({
      simulacionId,
      expedienteId: simulacion.expedienteId,
      metricas: metricasReales,
      pruebaActiva: ciclo,
      falloInjectado: falloInjectado || null,
      timestamp: new Date()
    });
    
    simulacion.estadisticas.metricasGeneradas++;
    simulacion.estadisticas.consultasRealizadas = (simulacion.estadisticas.consultasRealizadas || 0) + 1;
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
    const simulacion = await SimulacionBD.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    simulacion.estado = 'pausado';
    await simulacion.save();
    
    const intervalId = this.intervalos.get(simulacionId);
    if (intervalId) clearInterval(intervalId);
    
    await EventoAuditoria.create({
      tipo: 'simulacion_bd_pausada',
      modulo: 'robot',
      usuario: 'sistema',
      detalles: { simulacionId },
      fecha: new Date()
    });
    
    this.enviarLog(simulacionId, `⏸️ Simulación pausada`, 'info');
    
    return { success: true };
  }
  
  async reanudarSimulacion(simulacionId) {
    const simulacion = await SimulacionBD.findById(simulacionId);
    if (!simulacion) return { success: false, error: 'Simulación no encontrada' };
    
    simulacion.estado = 'ejecutando';
    await simulacion.save();
    
    this.iniciarCiclo(simulacionId);
    
    await EventoAuditoria.create({
      tipo: 'simulacion_bd_reanudada',
      modulo: 'robot',
      usuario: 'sistema',
      detalles: { simulacionId },
      fecha: new Date()
    });
    
    this.enviarLog(simulacionId, `▶️ Simulación reanudada`, 'info');
    
    return { success: true };
  }
  
  async detenerSimulacion(simulacionId, estado = 'detenido') {
    const simulacion = await SimulacionBD.findById(simulacionId);
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
      tipo: `simulacion_bd_${estado}`,
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
    const activas = await SimulacionBD.find({ estado: 'ejecutando' }).sort({ createdAt: -1 });
    const historial = await SimulacionBD.find({ estado: { $ne: 'ejecutando' } }).sort({ createdAt: -1 }).limit(50);
    
    return { activas, historial };
  }
  
  async obtenerDetalle(simulacionId) {
    const simulacion = await SimulacionBD.findById(simulacionId);
    if (!simulacion) return null;
    
    const metricas = await MetricaBD.find({ simulacionId }).sort({ timestamp: -1 }).limit(100);
    const logs = obtenerLogs(simulacionId, this.logsSimulacion);
    
    return { simulacion, metricas, logs };
  }
  
  async obtenerEstadisticas() {
    const total = await SimulacionBD.countDocuments();
    const activas = await SimulacionBD.countDocuments({ estado: 'ejecutando' });
    const completadas = await SimulacionBD.countDocuments({ estado: 'completado' });
    
    const totalMetricas = await MetricaBD.countDocuments();
    const fallosInyectados = await SimulacionBD.aggregate([
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

module.exports = RobotBDService;