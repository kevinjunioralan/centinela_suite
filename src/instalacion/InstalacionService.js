const Expediente = require('../expediente/models/Expediente');
const InstaladorSSH = require('./InstaladorSSH');
const AuditoriaService = require('../auditoria/AuditoriaService');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// ============ SERVICIO DE INSTALACIÓN ============

class InstalacionService {
  constructor() {
    this.auditoriaService = new AuditoriaService();
  }

  _estadosEnEjecucion() {
    return ['planificando', 'conectando', 'instalando', 'verificando'];
  }

  _mensajeEstadoEnCurso() {
    return 'Ya hay una instalacion en progreso para este expediente';
  }

  _generarCycleId() {
    return `cy-${Date.now()}-${uuidv4().split('-')[0]}`;
  }

  _prefijoCycle(cycleId) {
    return `[${cycleId}]`;
  }

  _agregarLogInstalacion(expediente, mensaje, nivel = 'info', cycleId = null) {
    expediente.instalacion.logs = expediente.instalacion.logs || [];
    expediente.instalacion.logs.push({
      nivel,
      mensaje: cycleId ? `${this._prefijoCycle(cycleId)} ${mensaje}` : mensaje,
      timestamp: new Date(),
      cycleId: cycleId || undefined
    });
  }

  _logBackendPaso(cycleId, accion, estado, ms) {
    const segundos = Math.max(1, Math.round((ms || 0) / 1000));
    console.log(`${this._prefijoCycle(cycleId)} ${accion}... ${estado} (${segundos}s)`);
  }

  async _registrarEventoAuditoriaInstalacion(tipo, expediente, cycleId, detalles = {}, usuario = 'sistema') {
    if (!expediente?._id) return;
    if (mongoose.connection.readyState !== 1) return;

    try {
      await this.auditoriaService.registrarEvento(tipo, usuario, {
        modulo: 'instalacion',
        expedienteId: expediente._id,
        detalles: {
          cycleId,
          pack: expediente.instalacion?.packSeleccionado || null,
          estado: expediente.instalacion?.estado || null,
          ...detalles
        }
      });
    } catch (error) {
      console.warn(`${this._prefijoCycle(cycleId)} No se pudo registrar auditoria (${tipo}): ${error.message}`);
    }
  }

  _clonarPlano(valor) {
    try {
      return JSON.parse(JSON.stringify(valor ?? {}));
    } catch {
      return {};
    }
  }

  _crearSnapshotConfiguracion(packId, config, cycleId) {
    if (!packId) return null;
    return {
      cycleId,
      packTipo: packId,
      fecha: new Date(),
      configuracion: this._clonarPlano(config)
    };
  }

  _registrarSnapshotConfiguracion(expediente, snapshot) {
    if (!snapshot || !expediente?.instalacion) return;

    expediente.instalacion.ultimaConfiguracionEjecutada = snapshot;
    expediente.instalacion.historialConfiguracion = expediente.instalacion.historialConfiguracion || [];
    expediente.instalacion.historialConfiguracion.push(snapshot);

    // Conserva los últimos 20 snapshots para trazabilidad sin crecer indefinidamente.
    if (expediente.instalacion.historialConfiguracion.length > 20) {
      expediente.instalacion.historialConfiguracion = expediente.instalacion.historialConfiguracion.slice(-20);
    }
  }

  _resumenConfiguracionPack(packId, config = {}) {
    if (!packId || !config || typeof config !== 'object') return null;

    if (packId === 'pack_web') {
      const dominio = config.dominio || config.general?.dominio;
      const puertoHttp = config.nginx?.puertoHttp;
      const db = config.postgresql?.baseDatosInicial;
      return `pack_web {dominio=${dominio || 'n/a'}, nginx.puertoHttp=${puertoHttp ?? 'n/a'}, postgresql.baseDatosInicial=${db || 'n/a'}}`;
    }

    if (packId === 'pack_dominio') {
      const dominio = config.general?.dominio;
      const inicio = config.dhcp?.rangoInicio;
      const fin = config.dhcp?.rangoFin;
      return `pack_dominio {general.dominio=${dominio || 'n/a'}, dhcp.rangoInicio=${inicio || 'n/a'}, dhcp.rangoFin=${fin || 'n/a'}}`;
    }

    if (packId === 'pack_cortafuegos') {
      const maxIntentos = config.fail2ban?.maxIntentos;
      const tiempoBan = config.fail2ban?.tiempoBan;
      return `pack_cortafuegos {fail2ban.maxIntentos=${maxIntentos ?? 'n/a'}, fail2ban.tiempoBan=${tiempoBan ?? 'n/a'}}`;
    }

    if (packId === 'pack_correo') {
      const dominio = config.general?.dominio;
      const smtp = config.postfix?.puerto;
      const imap = config.dovecot?.puertoImap;
      return `pack_correo {general.dominio=${dominio || 'n/a'}, postfix.puerto=${smtp ?? 'n/a'}, dovecot.puertoImap=${imap ?? 'n/a'}}`;
    }

    if (packId === 'pack_monitoreo') {
      const prom = config.prometheus?.puerto;
      const grafana = config.grafana?.puerto;
      return `pack_monitoreo {prometheus.puerto=${prom ?? 'n/a'}, grafana.puerto=${grafana ?? 'n/a'}}`;
    }

    return `${packId} {configuracion detectada}`;
  }

  async obtenerPendientes() {
    const pendientes = await Expediente.find({ 
      origen: 'instalacion',
      'instalacion.estado': { $in: ['pendiente', null] }
    });
    return { success: true, data: pendientes };
  }

  async validarServidorParaDemo(servidor, cycleId = null) {
    const instalador = new InstaladorSSH(servidor);
    const ciclo = cycleId || this._generarCycleId();
    try {
      await instalador.conectar();
      await instalador.verificarSudoNoInteractivo();
      await instalador.registrarEventoRobot(ciclo, 'preflight demo validado');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      await instalador.cerrar();
    }
  }

  async obtenerTodas() {
    const todas = await Expediente.find({ origen: 'instalacion' });
    return { success: true, data: todas };
  }

  async obtenerEstado(id) {
    const expediente = await Expediente.findById(id).select('-servidor.password');
    return { success: true, data: expediente };
  }

  // Devuelve solo los logs nuevos (a partir del índice `desde`) más estado y progreso.
  // El frontend hace poll con ?desde=N para evitar traer el expediente completo cada vez.
  async obtenerLogs(id, desde = 0) {
    const expediente = await Expediente.findById(id)
      .select('instalacion.logs instalacion.estado instalacion.progreso instalacion.resumen instalacion.ultimaConfiguracionEjecutada')
      .lean();

    if (!expediente) return { success: false, error: 'Expediente no encontrado' };

    const todosLogs = expediente.instalacion?.logs || [];
    const nuevos = todosLogs.slice(desde);

    return {
      success: true,
      data: {
        logs: nuevos,
        total: todosLogs.length,
        siguiente: todosLogs.length,          // valor para el próximo ?desde=
        estado: expediente.instalacion?.estado,
        progreso: expediente.instalacion?.progreso ?? 0,
        resumen: expediente.instalacion?.resumen ?? null,
        ultimaConfiguracionEjecutada: expediente.instalacion?.ultimaConfiguracionEjecutada ?? null
      }
    };
  }

  async obtenerEstadisticas() {
    const expedientes = await Expediente.find({ origen: 'instalacion' });
    return { 
      success: true, 
      data: { 
        total: expedientes.length,
        pendientes: expedientes.filter(e => e.instalacion?.estado === 'pendiente').length,
        enProgreso: expedientes.filter(e => e.instalacion?.estado === 'instalando').length,
        exitosas: expedientes.filter(e => e.instalacion?.estado === 'completado').length,
        fallos: expedientes.filter(e => e.instalacion?.estado === 'fallo').length
      }
    };
  }

  // ============ INICIAR INSTALACIÓN REAL ============
  async iniciarInstalacion(expedienteId, contexto = {}) {
    try {
      const cycleId = contexto.cycleId || this._generarCycleId();
      console.log(`${this._prefijoCycle(cycleId)} Installation cycle started for expediente ${expedienteId}`);

      const expediente = await Expediente.findById(expedienteId);
      if (!expediente) {
        return { success: false, error: 'Expediente no encontrado' };
      }

      if (expediente.origen !== 'instalacion') {
        return { success: false, error: `Este expediente no es de instalación` };
      }

      if (expediente.instalacion?.estado === 'completado') {
        return { success: false, error: 'Esta instalación ya fue completada' };
      }

      if (!expediente.instalacion) {
        expediente.instalacion = { estado: 'planificando', software: [], logs: [], progreso: 0 };
      }

      const expedienteBloqueado = await Expediente.findOneAndUpdate(
        {
          _id: expedienteId,
          origen: 'instalacion',
          'instalacion.estado': { $nin: [...this._estadosEnEjecucion(), 'completado'] }
        },
        {
          $set: {
            'instalacion.estado': 'planificando',
            'instalacion.cycleId': cycleId,
            'instalacion.fechaInicio': new Date(),
            estado: 'instalando'
          }
        },
        { new: true }
      );

      if (!expedienteBloqueado) {
        return { success: false, error: this._mensajeEstadoEnCurso() };
      }

      this._agregarLogInstalacion(expedienteBloqueado, 'Iniciando proceso de instalacion real', 'info', cycleId);
      await expedienteBloqueado.save();
      await this._registrarEventoAuditoriaInstalacion('inicio_instalacion', expedienteBloqueado, cycleId, {
        accion: 'inicio_instalacion',
        totalPaquetes: expedienteBloqueado.instalacion?.software?.length || 0
      });

      this._ejecutarInstalacionReal(expedienteId, { cycleId });

      return { success: true, message: 'Instalacion real iniciada', cycleId };
    } catch (error) {
      console.error('Error iniciando instalación:', error);
      return { success: false, error: error.message };
    }
  }

  // ============ REINTENTAR INSTALACIÓN FALLIDA ============
  async reintentar(expedienteId, contexto = {}) {
    try {
      const cycleId = contexto.cycleId || this._generarCycleId();
      const expediente = await Expediente.findById(expedienteId);
      if (!expediente) return { success: false, error: 'Expediente no encontrado' };

      const estadoActual = expediente.instalacion?.estado;
      if (!['fallo', 'rollback'].includes(estadoActual)) {
        return { success: false, error: `Estado '${estadoActual}' no permite reintentar` };
      }

      const expedienteBloqueado = await Expediente.findOneAndUpdate(
        {
          _id: expedienteId,
          origen: 'instalacion',
          'instalacion.estado': { $in: ['fallo', 'rollback'] }
        },
        {
          $set: {
            'instalacion.estado': 'planificando',
            'instalacion.cycleId': cycleId,
            'instalacion.progreso': 0,
            'instalacion.fechaInicio': new Date(),
            'instalacion.fechaFin': null,
            'instalacion.resumen': null,
            estado: 'instalando'
          }
        },
        { new: true }
      );

      if (!expedienteBloqueado) {
        return { success: false, error: this._mensajeEstadoEnCurso() };
      }

      // Resetear paquetes fallidos/rollback a pendiente; conservar los ya instalados
      if (expedienteBloqueado.instalacion?.software?.length) {
        for (const sw of expedienteBloqueado.instalacion.software) {
          if (['error', 'rollback'].includes(sw.estado)) {
            sw.estado = 'pendiente';
            sw.version = undefined;
            sw.tiempoInstalacion = undefined;
          }
        }
      }

      this._agregarLogInstalacion(expedienteBloqueado, `Reintentando instalacion desde estado ${estadoActual}`, 'info', cycleId);
      await expedienteBloqueado.save();
      await this._registrarEventoAuditoriaInstalacion('reanudar_instalacion', expedienteBloqueado, cycleId, {
        accion: 'reintento_instalacion',
        estadoPrevio: estadoActual
      });

      // Lanzar en background igual que iniciarInstalacion
      this._ejecutarInstalacionReal(expedienteId, { cycleId });

      return { success: true, message: 'Reintento iniciado', cycleId };
    } catch (error) {
      console.error('Error reintentando instalación:', error);
      return { success: false, error: error.message };
    }
  }

  // ============ LIMPIEZA DE SERVIDOR ============
  async limpiarServidor(expedienteId, servidor, contexto = {}) {
    let cycleId = contexto.cycleId || null;
    console.log(`${cycleId ? this._prefijoCycle(cycleId) : '[sin-cycle]'} Cleaning server for expediente ${expedienteId}`);
    
    let instalador = null;
    
    try {
      const expediente = await Expediente.findById(expedienteId);
      if (!expediente) {
        throw new Error('Expediente no encontrado');
      }

      cycleId = cycleId || expediente.instalacion?.cycleId || this._generarCycleId();

      const servidorObjetivo = servidor || expediente.servidor;
      if (!servidorObjetivo?.ip || !servidorObjetivo?.password) {
        throw new Error('No hay credenciales SSH para limpiar el servidor');
      }
      
      const paquetesInstalados = expediente.instalacion?.software
        ?.filter(s => s.estado === 'instalado')
        .map(s => s.nombre) || [];
      
      if (paquetesInstalados.length === 0) {
        console.log(`${this._prefijoCycle(cycleId)} Cleanup skipped: no packages to remove`);
        return { success: true, message: 'No había paquetes para limpiar', paquetesEliminados: 0 };
      }
      
      instalador = new InstaladorSSH(servidorObjetivo);
      await instalador.conectar();
      await instalador.registrarEventoRobot(cycleId, 'limpieza inicial');
      
      for (const paquete of paquetesInstalados) {
        await instalador.registrarEventoRobot(cycleId, `eliminacion de paquete ${paquete}`);
        await instalador.desinstalarPaquete(paquete);
      }
      
      await instalador.limpiarDependencias();
      await instalador.registrarEventoRobot(cycleId, 'limpieza final');
      await instalador.cerrar();
      
      console.log(`${this._prefijoCycle(cycleId)} Cleanup completed. Removed: ${paquetesInstalados.length}`);
      
      return { success: true, paquetesEliminados: paquetesInstalados.length };
      
    } catch (error) {
      console.error(`${cycleId ? this._prefijoCycle(cycleId) : '[sin-cycle]'} Cleanup error: ${error.message}`);
      if (instalador) await instalador.cerrar();
      return { success: false, error: error.message };
    }
  }

  // ============ VERIFICACIÓN DE SERVICIOS ============
  async verificarServicios(expedienteId, instalador, packId, software, contexto = {}) {
  const resultados = [];
  let score = 0;
  const cycleId = contexto.cycleId || this._generarCycleId();
  
  console.log(`${this._prefijoCycle(cycleId)} Verifying services for pack ${packId}`);
  
  // Mapeo de nombres de servicio reales (por si el nombre del paquete es diferente)
  const servicioMap = {
    // Pack Web
    'postgresql': 'postgresql',
    'redis': 'redis-server',
    'redis-server': 'redis-server',
    'nginx': 'nginx',
    'nodejs': 'nodejs',           // verificado por binario, no por servicio
    // Pack Dominio
    'bind9': 'bind9',
    'isc-dhcp-server': 'isc-dhcp-server',
    'samba': 'smbd',              // samba instala smbd como servicio
    'krb5-kdc': 'krb5-kdc',
    // Pack Cortafuegos
    'fail2ban': 'fail2ban',
    'nftables': 'nftables',
    'iptables-persistent': null,  // no tiene servicio systemd, sólo verificar dpkg
    // Pack Correo
    'postfix': 'postfix',
    'dovecot-core': 'dovecot',
    'dovecot-imapd': 'dovecot',   // comparte servicio dovecot
    'dovecot-pop3d': 'dovecot',   // comparte servicio dovecot
    'spamassassin': 'spamassassin',
    'clamav': 'clamav-daemon',
    'clamav-daemon': 'clamav-daemon',
    // Pack Monitoreo
    'prometheus': 'prometheus',
    'prometheus-node-exporter': 'prometheus-node-exporter',
    // Pack bases datos (demo legacy)
    'mariadb-server': 'mariadb',
  };

  // Paquetes que se verifican sólo por dpkg (sin systemd service)
  const sinServicio = new Set(['iptables-persistent', 'curl', 'git', 'htop', 'nmap', 'ufw']);

  const verificarPorDpkg = async (paquete) => {
    const { code } = await instalador.ejecutarComando(
      `dpkg -l ${paquete} 2>/dev/null | grep -E "^ii\\s+${paquete}" | head -1`
    );
    return code === 0;
  };

  const verificarServicioActivo = async (nombreServicio) => {
    const { stdout: status } = await instalador.ejecutarComandoPrivilegiado(
      `systemctl is-active ${nombreServicio} 2>/dev/null || echo "inactive"`
    );
    return status.trim().toLowerCase() === 'active';
  };
  
  try {
    for (const sw of software) {
      let resultado = false;
      let mensaje = '';
      const nombreServicio = servicioMap[sw.nombre] || sw.nombre;
      
      console.log(`   Verificando ${nombreServicio}...`);
      
      try {
        await instalador.registrarEventoRobot(cycleId, `verificacion de servicio ${nombreServicio}`);

        if (sw.nombre === 'nodejs') {
          const { code } = await instalador.ejecutarComando('command -v node >/dev/null 2>&1 || command -v nodejs >/dev/null 2>&1');
          resultado = code === 0;
          mensaje = resultado
            ? `✅ ${sw.nombre} disponible en PATH`
            : `❌ ${sw.nombre} no disponible en PATH`;
        } else if (sinServicio.has(sw.nombre) || servicioMap[sw.nombre] === null) {
          resultado = await verificarPorDpkg(sw.nombre);
          mensaje = resultado
            ? `✅ ${sw.nombre} instalado (dpkg)`
            : `❌ ${sw.nombre} no encontrado en dpkg`;
        } else {
          resultado = await verificarServicioActivo(nombreServicio);
          mensaje = resultado
            ? `✅ ${sw.nombre} activo`
            : `❌ ${sw.nombre} no está activo`;
        }
        
        if (resultado) {
          score++;
        }
        
        console.log(`${this._prefijoCycle(cycleId)} Verify ${sw.nombre}: ${resultado ? 'OK' : 'ERROR'}`);
        
      } catch (error) {
        console.log(`${this._prefijoCycle(cycleId)} Verify ${sw.nombre}: ERROR (${error.message})`);
        mensaje = `❌ ${sw.nombre}: error de verificación`;
        resultado = false;
      }
      
      resultados.push({
        nombre: sw.nombre,
        resultado,
        mensaje,
        timestamp: new Date()
      });
    }
    
    // Calcular score final
    const totalTests = resultados.length;
    const scoreFinal = totalTests > 0 ? Math.round((score / totalTests) * 100) : 0;
    
    console.log(`${this._prefijoCycle(cycleId)} Verification completed. Score: ${scoreFinal}% (${score}/${totalTests})`);
    
    return { tests: resultados, score: scoreFinal, completado: true };
    
  } catch (error) {
    console.error(`${this._prefijoCycle(cycleId)} Verification error: ${error.message}`);
    return { tests: resultados, score: 0, completado: false, error: error.message };
  }
}

  // ============ CAPTURAR MÉTRICAS REALES ============
  async capturarMetricasReales(instalador) {
    const metricas = [];
    
    try {
      const { stdout: cpu } = await instalador.ejecutarComando("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1");
      metricas.push({ tipo: 'cpu', valor: parseFloat(cpu) || 0, unidad: '%' });
    } catch (error) {
      metricas.push({ tipo: 'cpu', valor: 0, unidad: '%' });
    }
    
    try {
      const { stdout: ram } = await instalador.ejecutarComando("free | grep Mem | awk '{print ($3/$2) * 100}'");
      metricas.push({ tipo: 'ram', valor: parseFloat(ram) || 0, unidad: '%' });
    } catch (error) {
      metricas.push({ tipo: 'ram', valor: 0, unidad: '%' });
    }
    
    try {
      const { stdout: disco } = await instalador.ejecutarComando("df -h / | tail -1 | awk '{print $5}' | tr -d '%'");
      metricas.push({ tipo: 'disco', valor: parseFloat(disco) || 0, unidad: '%' });
    } catch (error) {
      metricas.push({ tipo: 'disco', valor: 0, unidad: '%' });
    }
    
    return metricas;
  }

  // ============ GUARDAR MÉTRICAS ============
  async guardarMetricas(expedienteId, clienteId, metricas) {
    const Metrica = require('../expediente/models/Metrica');
    
    for (const metrica of metricas) {
      await Metrica.create({
        expedienteId,
        clienteId,
        timestamp: new Date(),
        tipo: metrica.tipo,
        valor: metrica.valor,
        unidad: metrica.unidad || '%',
        origen: 'robot'
      });
    }
    
    console.log(`📊 Métricas guardadas: ${metricas.length}`);
  }

  // ============ GUARDAR ALERTAS ============
  async guardarAlertas(expedienteId, clienteId, alertas) {
    const Alerta = require('../expediente/models/Alerta');
    
    for (const alerta of alertas) {
      await Alerta.create({
        expedienteId,
        clienteId,
        timestamp: new Date(),
        tipo: alerta.tipo,
        mensaje: alerta.mensaje,
        origen: alerta.origen || 'robot',
        resuelta: false
      });
    }
    
    console.log(`⚠️ Alertas guardadas: ${alertas.length}`);
  }

  // ============ EJECUTAR INSTALACIÓN REAL ============
  async _ejecutarInstalacionReal(expedienteId, contexto = {}) {
    const expediente = await Expediente.findById(expedienteId);
    if (!expediente) return;

    const cycleId = contexto.cycleId || expediente.instalacion?.cycleId || this._generarCycleId();
    const packId = expediente.instalacion?.packSeleccionado;
    const software = expediente.instalacion?.software || [];
    const total = software.length;
    let completados = 0;
    let instalador = null;
    const paquetesInstalados = [];

    try {
      // 1. Conectar SSH
      expediente.instalacion.estado = 'conectando';
      expediente.instalacion.cycleId = cycleId;
      this._agregarLogInstalacion(expediente, `Conectando al servidor ${expediente.servidor?.ip}`, 'info', cycleId);
      await expediente.save();
      await this._registrarEventoAuditoriaInstalacion('paso_instalacion', expediente, cycleId, {
        paso: 'conectando_ssh',
        mensaje: `Conectando al servidor ${expediente.servidor?.ip}`
      });

      instalador = new InstaladorSSH(expediente.servidor);
      instalador.configuracionPack = expediente.configuracion?.valores || {};
      instalador.packSeleccionado = packId;

      const snapshotConfig = this._crearSnapshotConfiguracion(packId, instalador.configuracionPack, cycleId);
      this._registrarSnapshotConfiguracion(expediente, snapshotConfig);

      await instalador.conectar();
      await instalador.verificarSudoNoInteractivo();
      await instalador.registrarEventoRobot(cycleId, 'inicio de ciclo');

      const resumenConfig = this._resumenConfiguracionPack(packId, instalador.configuracionPack);
      if (resumenConfig) {
        this._agregarLogInstalacion(expediente, `Configuracion aplicada: ${resumenConfig}`, 'info', cycleId);
      }

      this._agregarLogInstalacion(expediente, `Conexion SSH establecida con ${expediente.servidor?.ip}`, 'info', cycleId);
      await expediente.save();
      await this._registrarEventoAuditoriaInstalacion('paso_instalacion', expediente, cycleId, {
        paso: 'ssh_conectado',
        mensaje: 'Conexion SSH establecida'
      });

      // 2. Verificar internet
      this._agregarLogInstalacion(expediente, 'Verificando conexion a internet', 'info', cycleId);
      await expediente.save();

      await instalador.verificarInternet();

      this._agregarLogInstalacion(expediente, 'Conexion a internet verificada', 'info', cycleId);
      await expediente.save();
      await this._registrarEventoAuditoriaInstalacion('paso_instalacion', expediente, cycleId, {
        paso: 'internet_ok',
        mensaje: 'Conexion a internet verificada'
      });

      // 3. Verificar espacio
      const espacioLibre = await instalador.verificarEspacio();
      this._agregarLogInstalacion(expediente, `Espacio disponible: ${espacioLibre}GB`, 'info', cycleId);
      await expediente.save();

      // 4. Actualizar repositorios
      this._agregarLogInstalacion(expediente, 'Actualizando repositorios', 'info', cycleId);
      await expediente.save();

      await instalador.actualizarRepositorios();

      this._agregarLogInstalacion(expediente, 'Repositorios actualizados', 'info', cycleId);
      await expediente.save();
      await this._registrarEventoAuditoriaInstalacion('paso_instalacion', expediente, cycleId, {
        paso: 'repositorios_actualizados'
      });

      // 5. Instalar cada paquete
      expediente.instalacion.estado = 'instalando';
      await expediente.save();

      for (let i = 0; i < software.length; i++) {
        const sw = software[i];
        
        sw.estado = 'instalando';
        const tiempoInicioPaquete = Date.now();
        this._agregarLogInstalacion(expediente, `Installing ${sw.nombre}`, 'info', cycleId);
        await expediente.save();
        await this._registrarEventoAuditoriaInstalacion('paso_instalacion', expediente, cycleId, {
          paso: 'instalando_paquete',
          paquete: sw.nombre
        });

        try {
          await instalador.registrarEventoRobot(cycleId, `instalacion de paquete ${sw.nombre}`);
          await instalador.instalarPaquete(sw.nombre);
          
          const verificado = await instalador.verificarInstalacion(sw.nombre);
          
          if (verificado) {
            sw.estado = 'instalado';
            sw.version = await instalador.obtenerVersion(sw.nombre);
            sw.tiempoInstalacion = Math.round((Date.now() - tiempoInicioPaquete) / 1000);
            this._agregarLogInstalacion(expediente, `Installing ${sw.nombre}... OK (${sw.tiempoInstalacion}s)`, 'info', cycleId);
            this._logBackendPaso(cycleId, `Installing ${sw.nombre}`, 'OK', Date.now() - tiempoInicioPaquete);
            completados++;
            paquetesInstalados.push(sw.nombre);
            await this._registrarEventoAuditoriaInstalacion('paso_instalacion', expediente, cycleId, {
              paso: 'paquete_instalado',
              paquete: sw.nombre,
              tiempoSegundos: sw.tiempoInstalacion
            });
          } else {
            throw new Error('No se pudo verificar la instalación');
          }
        } catch (error) {
          sw.estado = 'error';
          this._agregarLogInstalacion(expediente, `Installing ${sw.nombre}... ERROR (${error.message})`, 'error', cycleId);
          this._logBackendPaso(cycleId, `Installing ${sw.nombre}`, 'ERROR', Date.now() - tiempoInicioPaquete);
          await this._registrarEventoAuditoriaInstalacion('paso_instalacion', expediente, cycleId, {
            paso: 'error_paquete',
            paquete: sw.nombre,
            error: error.message
          });
          
          // Rollback
          if (paquetesInstalados.length > 0) {
            this._agregarLogInstalacion(expediente, `Rollback iniciado para ${paquetesInstalados.length} paquetes`, 'warn', cycleId);
            for (const pkg of paquetesInstalados.reverse()) {
              try {
                await instalador.registrarEventoRobot(cycleId, `eliminacion de paquete ${pkg}`);
                await instalador.desinstalarPaquete(pkg);
                const pkgSw = software.find(s => s.nombre === pkg);
                if (pkgSw) pkgSw.estado = 'rollback';
                this._agregarLogInstalacion(expediente, `Rollback removed ${pkg}`, 'info', cycleId);
              } catch (uninstallError) {
                this._agregarLogInstalacion(expediente, `Rollback failed for ${pkg}: ${uninstallError.message}`, 'error', cycleId);
              }
            }
          }
          break;
        }
        
        expediente.instalacion.progreso = Math.round((completados / total) * 100);
        await expediente.save();
      }

      const todosInstalados = software.every(sw => sw.estado === 'instalado');
      const exitososCount = software.filter(s => s.estado === 'instalado').length;
      const fallidosCount = software.filter(s => s.estado === 'error').length;

      if (todosInstalados) {
        // ============ VERIFICACIÓN REAL DE SERVICIOS ============
        expediente.instalacion.estado = 'verificando';
        await expediente.save();

        const verificacion = await this.verificarServicios(expedienteId, instalador, packId, software, { cycleId });
        
        expediente.instalacion.verificacion = verificacion;
        expediente.instalacion.estado = 'completado';
        expediente.instalacion.fechaFin = new Date();
        
        const tiempoTotalSegundos = expediente.instalacion.fechaFin && expediente.instalacion.fechaInicio 
          ? (expediente.instalacion.fechaFin - expediente.instalacion.fechaInicio) / 1000 : 0;
        
        expediente.instalacion.resumen = {
          exitoso: true,
          totalPaquetes: software.length,
          exitosos: exitososCount,
          fallidos: fallidosCount,
          scoreFinal: verificacion.score,
          tiempoTotalMinutos: Math.round(tiempoTotalSegundos / 60) || 0
        };
        
        this._agregarLogInstalacion(expediente, `Instalacion completada. Score: ${verificacion.score}%`, 'info', cycleId);

        // ============ CAPTURAR Y GUARDAR MÉTRICAS REALES ============
        const metricasReales = await this.capturarMetricasReales(instalador);
        await this.guardarMetricas(expedienteId, expediente.clienteId, metricasReales);
        
        // ============ GUARDAR ALERTAS ============
        const alertas = [];
        for (const test of verificacion.tests) {
          if (!test.resultado) {
            alertas.push({
              tipo: 'error',
              mensaje: test.mensaje,
              origen: 'verificacion'
            });
          }
        }
        if (alertas.length > 0) {
          await this.guardarAlertas(expedienteId, expediente.clienteId, alertas);
        }

        // Cambiar a mantenimiento
        expediente.origen = 'mantenimiento';
        expediente.estado = 'en_mantenimiento';
        expediente.mantenimiento = {
          fechaIngreso: new Date(),
          estadoCustodia: 'pendiente',
          ultimaConexion: null
        };

        await expediente.save();
        await this._registrarEventoAuditoriaInstalacion('fin_instalacion_exito', expediente, cycleId, {
          accion: 'instalacion_completada',
          score: verificacion.score,
          totalPaquetes: software.length,
          exitosos: exitososCount,
          fallidos: fallidosCount
        });
        
        console.log(`${this._prefijoCycle(cycleId)} Installation completed for ${expedienteId}. Score: ${verificacion.score}%`);

      } else {
        expediente.instalacion.estado = 'fallo';
        expediente.estado = 'pendiente';
        expediente.instalacion.fechaFin = new Date();
        this._agregarLogInstalacion(expediente, `Instalacion fallida. Exitos: ${exitososCount}, fallos: ${fallidosCount}`, 'error', cycleId);
        await expediente.save();
        await this._registrarEventoAuditoriaInstalacion('fin_instalacion_fallo', expediente, cycleId, {
          accion: 'instalacion_fallida',
          totalPaquetes: software.length,
          exitosos: exitososCount,
          fallidos: fallidosCount
        });
      }

    } catch (error) {
      console.error(`${this._prefijoCycle(cycleId)} Installation error: ${error.message}`);
      expediente.instalacion.estado = 'fallo';
      expediente.estado = 'pendiente';
      expediente.instalacion.fechaFin = new Date();
      this._agregarLogInstalacion(expediente, `Instalacion fallida: ${error.message}`, 'error', cycleId);
      await expediente.save();
      await this._registrarEventoAuditoriaInstalacion('fallo_instalacion', expediente, cycleId, {
        accion: 'error_instalacion',
        error: error.message
      });
    } finally {
      if (instalador) await instalador.cerrar();
    }
  }
}

module.exports = InstalacionService;