const { v4: uuidv4 } = require('uuid');
const Cliente = require('../expediente/models/Cliente');
const Expediente = require('../expediente/models/Expediente');
const InstalacionService = require('../instalacion/InstalacionService');
const AuditoriaService = require('../auditoria/AuditoriaService');

class RobotDemoInstalacionService {
  constructor() {
    this.demosActivas = new Map();
    this.instalacionService = new InstalacionService();
    this.auditoriaService = new AuditoriaService();
    this.secuenciaDefault = ['pack_coreos', 'pack_seguridad', 'pack_bases_datos'];
    this.pollIntervalMs = Number(process.env.ROBOT_DEMO_POLL_MS || 3000);
    this.maxWaitMs = Number(process.env.ROBOT_DEMO_WAIT_MS || (30 * 60 * 1000));
  }

  async iniciarDemo(config = {}) {
    const servidor = config.servidor || {};
    if (!servidor.ip || !servidor.usuario || !servidor.password) {
      throw new Error('Debe indicar ip, usuario y password del servidor');
    }

    const demoId = uuidv4();
    const secuencia = Array.isArray(config.secuencia) && config.secuencia.length > 0
      ? config.secuencia
      : this.secuenciaDefault;

    const demo = {
      id: demoId,
      estado: 'ejecutando',
      detener: false,
      inicio: new Date(),
      fin: null,
      servidor,
      secuencia,
      pausasSegundos: Number(config.pausaSegundos || 6),
      ciclosObjetivo: Number(config.ciclosObjetivo || 0),
      ciclosCompletados: 0,
      packActual: null,
      resultados: [],
      logs: []
    };

    this.demosActivas.set(demoId, demo);
    this._agregarLog(demoId, 'Demo de instalacion iniciada', 'exito');
    this._agregarLog(demoId, `Servidor objetivo: ${servidor.ip}`, 'info');
    this._agregarLog(demoId, `Secuencia: ${secuencia.join(' -> ')}`, 'info');

    const preflight = await this.instalacionService.validarServidorParaDemo(servidor, `pre-${demoId.slice(0, 8)}`);
    if (!preflight.success) {
      demo.estado = 'error';
      demo.fin = new Date();
      this._agregarLog(demoId, `Preflight fallido: ${preflight.error}`, 'error');
      throw new Error(`Servidor no preparado para ejecucion autonoma: ${preflight.error}`);
    }
    this._agregarLog(demoId, 'Preflight de automatizacion validado (SSH + sudo -n)', 'exito');
    
    // 📝 Registrar en auditoría
    await this.auditoriaService.registrarEvento(
      'inicio_simulacion_robot',
      'robot-demo',
      {
        modulo: 'robot',
        detalles: {
          demoId,
          servidor: servidor.ip,
          packs: secuencia.length,
          mensaje: 'Inició demo de instalación automatizada'
        }
      }
    );

    this._ejecutarDemo(demoId).catch((error) => {
      this._agregarLog(demoId, `Error general de demo: ${error.message}`, 'error');
      const d = this.demosActivas.get(demoId);
      if (d) {
        d.estado = 'error';
        d.fin = new Date();
      }
    });

    return { demoId };
  }

  async _ejecutarDemo(demoId) {
    const demo = this.demosActivas.get(demoId);
    if (!demo) return;

    while (!demo.detener) {
      for (const packId of demo.secuencia) {
        if (demo.detener) break;

        const cycleId = `cy-${Date.now()}-${uuidv4().split('-')[0]}`;

        demo.packActual = packId;
        this._agregarLog(demoId, `[ROBOT][${cycleId}] Inicio ciclo ${demo.ciclosCompletados + 1} con ${packId}`, 'info');

        const resultado = await this._ejecutarCicloPack(demoId, packId, cycleId);
        demo.resultados.push(resultado);

        if (resultado.exitoso) {
          this._agregarLog(demoId, `Ciclo exitoso (${packId}) score ${resultado.score || 0}%`, 'exito');
        } else {
          this._agregarLog(demoId, `Ciclo con error (${packId}): ${resultado.error}`, 'error');
        }

        demo.ciclosCompletados += 1;

        if (demo.ciclosObjetivo > 0 && demo.ciclosCompletados >= demo.ciclosObjetivo) {
          demo.estado = 'completado';
          demo.fin = new Date();
          this._agregarLog(demoId, 'Ciclos objetivo completados', 'exito');
          return;
        }

        if (!demo.detener) {
          this._agregarLog(demoId, `Pausa de ${demo.pausasSegundos}s antes del siguiente pack`, 'info');
          await this._sleep(demo.pausasSegundos * 1000);
        }
      }
    }

    demo.estado = 'detenido';
    demo.fin = new Date();
    this._agregarLog(demoId, 'Demo detenida manualmente', 'info');
  }

  async _ejecutarCicloPack(demoId, packId, cycleId) {
    let cliente = null;
    let expediente = null;

    try {
      const nombreBase = `${packId}-${Date.now()}`;
      cliente = await Cliente.create({
        nombre: `Demo-${nombreBase}`,
        email: `demo-${nombreBase}@centinela.local`,
        plan: 'basico',
        activo: true
      });
      this._agregarLog(demoId, `Cliente temporal creado: ${cliente.nombre}`, 'info');

      expediente = await Expediente.create({
        nombre: `Demo-Instalacion-${nombreBase}`,
        clienteId: cliente._id,
        origen: 'instalacion',
        servidor: this.demosActivas.get(demoId).servidor,
        instalacion: {
          estado: 'pendiente',
          packSeleccionado: packId,
          packNombre: this._nombrePack(packId),
          software: this._softwarePorPack(packId),
          logs: [],
          progreso: 0
        }
      });
      this._agregarLog(demoId, `Expediente temporal: ${expediente._id}`, 'info');
      
      // 📝 Registrar creación de expediente en auditoría
      await this.auditoriaService.registrarEvento(
        'creacion_expediente',
        'robot-demo',
        {
          modulo: 'robot',
          expedienteId: expediente._id,
          detalles: {
            nombre: expediente.nombre,
            pack: this._nombrePack(packId),
            tipo: 'instalacion_demo'
          }
        }
      );

      const inicio = await this.instalacionService.iniciarInstalacion(expediente._id, { cycleId });
      if (!inicio.success) {
        throw new Error(inicio.error || 'No se pudo iniciar la instalacion');
      }
      
      // 📝 Registrar inicio de instalación
      await this.auditoriaService.registrarEvento(
        'inicio_instalacion',
        'robot-demo',
        {
          modulo: 'robot',
          expedienteId: expediente._id,
          detalles: {
            accion: 'instalacion_iniciada',
            pack: this._nombrePack(packId),
            mensaje: `Instalación de ${this._nombrePack(packId)} iniciada`
          }
        }
      );

      const estadoFinal = await this._esperarFinalizacion(demoId, expediente._id);
      if (!estadoFinal.exitoso) {
        throw new Error(estadoFinal.error || 'La instalacion no finalizo correctamente');
      }

      this._agregarLog(demoId, `[ROBOT][${cycleId}] Limpieza post-instalacion en servidor`, 'info');
      await this.instalacionService.limpiarServidor(expediente._id, null, { cycleId });

      const score = estadoFinal.score || 0;
      
      // 📝 Registrar ciclo completado
      await this.auditoriaService.registrarEvento(
        'fin_instalacion_exito',
        'robot-demo',
        {
          modulo: 'robot',
          expedienteId: expediente._id,
          detalles: {
            accion: 'ciclo_completado',
            pack: this._nombrePack(packId),
            score,
            mensaje: `Ciclo exitoso: ${this._nombrePack(packId)} (Score: ${score}%)`
          }
        }
      );
      
      await Expediente.findByIdAndDelete(expediente._id);
      await Cliente.findByIdAndDelete(cliente._id);

      return {
        timestamp: new Date(),
        cycleId,
        packId,
        packNombre: this._nombrePack(packId),
        exitoso: true,
        score
      };
    } catch (error) {
      if (expediente?._id) {
        try {
          await this.instalacionService.limpiarServidor(expediente._id, null, { cycleId });
          await Expediente.findByIdAndDelete(expediente._id);
        } catch (e) {
          this._agregarLog(demoId, `Limpieza de emergencia con error: ${e.message}`, 'error');
        }
      }
      if (cliente?._id) {
        try {
          await Cliente.findByIdAndDelete(cliente._id);
        } catch (e) {}
      }

      // 📝 Registrar error en auditoría
      await this.auditoriaService.registrarEvento(
        'fallo_instalacion',
        'robot-demo',
        {
          modulo: 'robot',
          expedienteId: expediente?._id || null,
          detalles: {
            accion: 'ciclo_error',
            pack: this._nombrePack(packId),
            error: error.message,
            mensaje: `Error en ciclo de ${this._nombrePack(packId)}: ${error.message}`
          }
        }
      );
      
      return {
        timestamp: new Date(),
        cycleId,
        packId,
        packNombre: this._nombrePack(packId),
        exitoso: false,
        error: error.message
      };
    }
  }

  async _esperarFinalizacion(demoId, expedienteId) {
    let ultimoLog = 0;
    const maxIntentos = Math.max(1, Math.ceil(this.maxWaitMs / this.pollIntervalMs));

    for (let i = 0; i < maxIntentos; i++) {
      const expediente = await Expediente.findById(expedienteId).lean();
      if (!expediente) {
        return { exitoso: false, error: 'Expediente no disponible durante la instalacion' };
      }

      const logs = expediente.instalacion?.logs || [];
      if (logs.length > ultimoLog) {
        const nuevos = logs.slice(ultimoLog);
        nuevos.forEach((l) => this._agregarLog(demoId, l.mensaje, l.nivel === 'error' ? 'error' : 'info'));
        ultimoLog = logs.length;
      }

      const estado = expediente.instalacion?.estado;
      if (estado === 'completado') {
        const score = expediente.instalacion?.verificacion?.score || 0;
        return { exitoso: true, score };
      }

      if (estado === 'fallo' || estado === 'rollback') {
        return { exitoso: false, error: `Instalacion finalizo en estado ${estado}` };
      }

      await this._sleep(this.pollIntervalMs);
    }

    return {
      exitoso: false,
      error: `Timeout esperando fin de instalacion (${Math.round(this.maxWaitMs / 60000)} min)`
    };
  }

  detenerDemo(demoId) {
    const demo = this.demosActivas.get(demoId);
    if (!demo) return false;
    demo.detener = true;
    return true;
  }

  obtenerEstado(demoId) {
    const demo = this.demosActivas.get(demoId);
    if (!demo) return null;

    const exitosos = demo.resultados.filter((r) => r.exitoso).length;
    const fallidos = demo.resultados.filter((r) => !r.exitoso).length;

    return {
      id: demo.id,
      estado: demo.estado,
      inicio: demo.inicio,
      fin: demo.fin,
      packActual: demo.packActual,
      ciclosCompletados: demo.ciclosCompletados,
      ciclosObjetivo: demo.ciclosObjetivo,
      secuencia: demo.secuencia,
      resumen: { exitosos, fallidos },
      resultados: demo.resultados.slice(-20),
      logs: demo.logs.slice(-200)
    };
  }

  listarActivas() {
    this._limpiarDemosAntiguas();
    
    const demos = [];
    for (const [, demo] of this.demosActivas) {
      demos.push({
        id: demo.id,
        estado: demo.estado,
        inicio: demo.inicio,
        packActual: demo.packActual,
        ciclosCompletados: demo.ciclosCompletados,
        ciclosObjetivo: demo.ciclosObjetivo
      });
    }
    return demos;
  }

  _limpiarDemosAntiguas() {
    const ahora = Date.now();
    const tiempoMaximoCompletados = 15 * 1000; // 15 segundos
    
    for (const [demoId, demo] of this.demosActivas) {
      // Solo elimina demos que completaron hace más de 15 segundos
      if ((demo.estado === 'completado' || demo.estado === 'detenido' || demo.estado === 'error') 
          && demo.fin 
          && ahora - new Date(demo.fin).getTime() > tiempoMaximoCompletados) {
        this.demosActivas.delete(demoId);
        console.log(`[ROBOT] Demo ${demoId.slice(0, 8)} limpiada del memory (completada hace > 15s)`);
      }
    }
  }

  _nombrePack(packId) {
    const nombres = {
      pack_coreos: 'Pack Core OS',
      pack_seguridad: 'Pack Seguridad',
      pack_bases_datos: 'Pack Bases de Datos',
      pack_web: '🌐 Pack Web',
      pack_dominio: '🏢 Pack Dominio',
      pack_cortafuegos: '🛡️ Pack Cortafuegos',
      pack_correo: '📧 Pack Correo',
      pack_monitoreo: '📊 Pack Monitoreo'
    };
    return nombres[packId] || packId;
  }

  _softwarePorPack(packId) {
    const packs = {
      pack_coreos: [
        { nombre: 'curl', estado: 'pendiente' },
        { nombre: 'git', estado: 'pendiente' },
        { nombre: 'htop', estado: 'pendiente' },
        { nombre: 'nginx', estado: 'pendiente' }
      ],
      pack_seguridad: [
        { nombre: 'fail2ban', estado: 'pendiente' },
        { nombre: 'ufw', estado: 'pendiente' },
        { nombre: 'nmap', estado: 'pendiente' }
      ],
      pack_bases_datos: [
        { nombre: 'postgresql', estado: 'pendiente' },
        { nombre: 'mariadb-server', estado: 'pendiente' },
        { nombre: 'redis-server', estado: 'pendiente' }
      ],
      // ===== 5 PACKS ROBOT INSTALACIÓN =====
      pack_web: [
        { nombre: 'nginx', estado: 'pendiente' },
        { nombre: 'nodejs', estado: 'pendiente' },
        { nombre: 'postgresql', estado: 'pendiente' },
        { nombre: 'redis-server', estado: 'pendiente' }
      ],
      pack_dominio: [
        { nombre: 'bind9', estado: 'pendiente' },
        { nombre: 'isc-dhcp-server', estado: 'pendiente' },
        { nombre: 'samba', estado: 'pendiente' },
        { nombre: 'krb5-kdc', estado: 'pendiente' }
      ],
      pack_cortafuegos: [
        { nombre: 'iptables-persistent', estado: 'pendiente' },
        { nombre: 'fail2ban', estado: 'pendiente' },
        { nombre: 'nftables', estado: 'pendiente' }
      ],
      pack_correo: [
        { nombre: 'postfix', estado: 'pendiente' },
        { nombre: 'dovecot-core', estado: 'pendiente' },
        { nombre: 'dovecot-imapd', estado: 'pendiente' },
        { nombre: 'dovecot-pop3d', estado: 'pendiente' },
        { nombre: 'clamav-daemon', estado: 'pendiente' }
      ],
      pack_monitoreo: [
        { nombre: 'prometheus-node-exporter', estado: 'pendiente' }
      ]
    };

    return packs[packId] || packs.pack_coreos;
  }

  _agregarLog(demoId, mensaje, tipo = 'info') {
    const demo = this.demosActivas.get(demoId);
    if (!demo) return;
    demo.logs.push({
      hora: new Date().toLocaleTimeString(),
      timestamp: new Date().toISOString(),
      mensaje,
      tipo
    });

    if (demo.logs.length > 1200) {
      demo.logs = demo.logs.slice(-800);
    }

    console.log(`[DEMO:${demoId}] ${mensaje}`);
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = RobotDemoInstalacionService;