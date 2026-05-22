// backend/src/robot/RobotMixService.js
const { v4: uuidv4 } = require('uuid');
const InstalacionService = require('../instalacion/InstalacionService');
const Expediente = require('../expediente/models/Expediente');
const Cliente = require('../expediente/models/Cliente');

class RobotMixService {
  constructor() {
    this.mixersActivos = new Map();
    this.instalacionService = new InstalacionService();
  }

  _serializarMix(mixer, incluirDetalle = false) {
    const base = {
      id: mixer.id,
      estado: mixer.estado,
      cicloActual: mixer.cicloActual,
      totalCiclos: mixer.configuracion.totalCiclos,
      cicloActualInfo: mixer.cicloActualInfo,
      inicio: mixer.inicio,
      fechaFin: mixer.fechaFin
    };

    if (incluirDetalle) {
      base.resultados = mixer.resultados || [];
      base.logs = mixer.logs || [];
    }

    return base;
  }

  async iniciarMix(configuracion) {
    const mixerId = uuidv4();
    
    const { packs, servidor, pausaEntreCiclos = 5, detenerEnError = true, aleatorio = false } = configuracion;
    
    const packsActivos = packs.filter(p => p.ciclos > 0);
    if (packsActivos.length === 0) {
      throw new Error('Debe seleccionar al menos un pack con ciclos > 0');
    }
    
    const packsNormalizados = packsActivos.map(p => ({
      packId: p.id || p.packId,
      packNombre: p.nombre || p.packNombre,
      ciclos: p.ciclos
    }));
    
    console.log('📦 Packs normalizados:', JSON.stringify(packsNormalizados, null, 2));
    
    const totalCiclos = packsNormalizados.reduce((sum, p) => sum + p.ciclos, 0);
    
    const secuencia = [];
    for (const pack of packsNormalizados) {
      for (let i = 0; i < pack.ciclos; i++) {
        secuencia.push({
          packId: pack.packId,
          packNombre: pack.packNombre,
          orden: i + 1
        });
      }
    }
    
    if (aleatorio) {
      for (let i = secuencia.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [secuencia[i], secuencia[j]] = [secuencia[j], secuencia[i]];
      }
    }
    
    console.log(`📦 Secuencia generada: ${secuencia.map(s => s.packNombre).join(' → ')}`);
    
    const mixer = {
      id: mixerId,
      configuracion: {
        ...configuracion,
        packsActivos: packsNormalizados,
        totalCiclos,
        secuencia
      },
      servidor,
      pausaEntreCiclos,
      detenerEnError,
      estado: 'ejecutando',
      cicloActual: 0,
      cicloActualInfo: null,
      logs: [],
      resultados: [],
      detener: false,
      instalacionService: this.instalacionService,
      inicio: new Date()  // ✅ Añadido: fecha de inicio
    };
    
    this.mixersActivos.set(mixerId, mixer);
    
    this._agregarLog(mixerId, `🤖 ROBOT MIX iniciado`, 'info');
    this._agregarLog(mixerId, `📦 Total ciclos: ${totalCiclos}`, 'info');
    this._agregarLog(mixerId, `🔄 Secuencia: ${secuencia.map(s => s.packNombre).join(' → ')}`, 'info');
    this._agregarLog(mixerId, `🌐 Servidor: ${servidor.ip}`, 'info');
    
    this._ejecutarMix(mixerId).catch(err => {
      console.error(`❌ Error en mixer ${mixerId}:`, err);
    });
    
    return { mixerId, totalCiclos };
  }
  
  async _ejecutarMix(mixerId) {
    const mixer = this.mixersActivos.get(mixerId);
    if (!mixer) return;
    
    const { configuracion, servidor, pausaEntreCiclos, detenerEnError } = mixer;
    const { secuencia, totalCiclos } = configuracion;
    
    let cicloCompletados = 0;
    
    for (let i = 0; i < secuencia.length && !mixer.detener; i++) {
      const item = secuencia[i];
      const cycleId = `cy-${Date.now()}-${uuidv4().split('-')[0]}`;
      mixer.cicloActual = i + 1;
      mixer.cicloActualInfo = item;
      
      this._agregarLog(mixerId, `\n[ROBOT][${cycleId}] CICLO ${i + 1}/${totalCiclos}: ${item.packNombre}`, 'info');
      
      try {
        const resultado = await this._ejecutarCiclo(mixerId, item, servidor, cycleId);
        
        mixer.resultados.push({
          ciclo: i + 1,
          packId: item.packId,
          packNombre: item.packNombre,
          ...resultado,
          timestamp: new Date()
        });
        
        if (resultado.exitoso) {
          cicloCompletados++;
          this._agregarLog(mixerId, `✅ Ciclo ${i + 1} completado con éxito (Score: ${resultado.score}%)`, 'exito');
        } else {
          this._agregarLog(mixerId, `❌ Ciclo ${i + 1} fallido: ${resultado.error}`, 'error');
          if (detenerEnError) {
            this._agregarLog(mixerId, `⏹️ Deteniendo Mix por error`, 'error');
            mixer.estado = 'detenido_por_error';
            break;
          }
        }
        
      } catch (error) {
        this._agregarLog(mixerId, `❌ Error en ciclo ${i + 1}: ${error.message}`, 'error');
        mixer.resultados.push({
          ciclo: i + 1,
          packId: item.packId,
          packNombre: item.packNombre,
          exitoso: false,
          error: error.message,
          timestamp: new Date()
        });
        
        if (detenerEnError) {
          this._agregarLog(mixerId, `⏹️ Deteniendo Mix por error`, 'error');
          mixer.estado = 'detenido_por_error';
          break;
        }
      }
      
      if (i < secuencia.length - 1 && !mixer.detener) {
        this._agregarLog(mixerId, `⏳ Esperando ${pausaEntreCiclos} segundos antes del siguiente ciclo...`, 'info');
        await this._sleep(pausaEntreCiclos * 1000);
      }
    }
    
    const exitosos = mixer.resultados.filter(r => r.exitoso).length;
    const fallidos = mixer.resultados.filter(r => !r.exitoso).length;
    
    this._agregarLog(mixerId, `\n🎉 ROBOT MIX COMPLETADO`, 'exito');
    this._agregarLog(mixerId, `📊 Resumen: ${exitosos} éxitos, ${fallidos} fallos`, 'info');
    
    mixer.estado = 'completado';
    mixer.fechaFin = new Date();
    
    setTimeout(() => {
      this.mixersActivos.delete(mixerId);
    }, 300000);
  }
  
  async _ejecutarCiclo(mixerId, item, servidor, cycleId) {
    const mixer = this.mixersActivos.get(mixerId);
    const instalacionService = mixer.instalacionService;
    
    let clienteGuardado = null;
    let expedienteGuardado = null;
    
    this._agregarLog(mixerId, `[ROBOT][${cycleId}] Iniciando instalacion para pack: ${item.packNombre} (${item.packId})`, 'info');
    
    try {
      const nombreCliente = `Robot-Mix-${item.packNombre}-${Date.now()}`;
      const nuevoCliente = new Cliente({
        nombre: nombreCliente,
        email: `robot-mix-${Date.now()}@centinela.local`,
        plan: 'basico',
        activo: true
      });
      clienteGuardado = await nuevoCliente.save();
      this._agregarLog(mixerId, `✅ Cliente creado: ${nombreCliente}`, 'exito');
      
      const nuevoExpediente = new Expediente({
        nombre: `Mix-${item.packNombre}-${Date.now()}`,
        clienteId: clienteGuardado._id,
        origen: 'instalacion',
        servidor: {
          ip: servidor.ip,
          puerto: 22,
          usuario: servidor.usuario,
          password: servidor.password
        },
        instalacion: {
          estado: 'pendiente',
          packSeleccionado: item.packId,
          packNombre: item.packNombre,
          software: this._obtenerSoftwarePorPack(item.packId),
          logs: [],
          progreso: 0
        }
      });
      expedienteGuardado = await nuevoExpediente.save();
      this._agregarLog(mixerId, `✅ Expediente creado con ID: ${expedienteGuardado._id}`, 'exito');
      
      this._agregarLog(mixerId, `🔌 Conectando al servidor ${servidor.ip}...`, 'info');
      const resultado = await instalacionService.iniciarInstalacion(expedienteGuardado._id, { cycleId });
      
      if (!resultado.success) {
        throw new Error(resultado.error || 'Error en instalación');
      }
      
      let instalacionCompletada = false;
      let intentos = 0;
      const maxIntentos = 120;
      let score = 0;
      
      this._agregarLog(mixerId, `⏳ Esperando que la instalación se complete (timeout: ${maxIntentos * 5} segundos)...`, 'info');
      
      while (!instalacionCompletada && intentos < maxIntentos && !mixer.detener) {
        await this._sleep(5000);
        intentos++;
        
        const expedienteActualizado = await Expediente.findById(expedienteGuardado._id);
        if (!expedienteActualizado) {
          throw new Error('El expediente fue eliminado durante la instalación');
        }
        
        const estadoInstalacion = expedienteActualizado?.instalacion?.estado;
        
        if (estadoInstalacion === 'completado') {
          instalacionCompletada = true;
          score = expedienteActualizado.instalacion?.verificacion?.score || 90;
          this._agregarLog(mixerId, `✅ Instalación completada. Score: ${score}%`, 'exito');
        } else if (estadoInstalacion === 'fallo') {
          throw new Error('La instalación falló');
        } else if (intentos % 6 === 0) {
          this._agregarLog(mixerId, `   ⏳ Instalación en progreso... (${Math.round(intentos * 5 / 60)} minutos)`, 'info');
        }
      }
      
      if (!instalacionCompletada) {
        throw new Error('Timeout en instalación después de 10 minutos');
      }
      
      this._agregarLog(mixerId, `🧹 Limpiando servidor...`, 'info');
      // ✅ CORREGIDO: solo pasar el expedienteId, no el servidor
      await instalacionService.limpiarServidor(expedienteGuardado._id, null, { cycleId });
      
      await Cliente.findByIdAndDelete(clienteGuardado._id);
      await Expediente.findByIdAndDelete(expedienteGuardado._id);
      
      this._agregarLog(mixerId, `✅ Ciclo completado con éxito`, 'exito');
      
      return { exitoso: true, score };
      
    } catch (error) {
      this._agregarLog(mixerId, `❌ Error en ciclo: ${error.message}`, 'error');
      
      if (expedienteGuardado) {
        try {
          const existe = await Expediente.findById(expedienteGuardado._id);
          if (existe) {
            // ✅ CORREGIDO: solo pasar el expedienteId
            await instalacionService.limpiarServidor(expedienteGuardado._id, null, { cycleId });
            await Expediente.findByIdAndDelete(expedienteGuardado._id);
          }
        } catch (e) {
          this._agregarLog(mixerId, `⚠️ Error en limpieza de emergencia: ${e.message}`, 'error');
        }
      }
      if (clienteGuardado) {
        try {
          await Cliente.findByIdAndDelete(clienteGuardado._id);
        } catch (e) {}
      }
      
      return { exitoso: false, error: error.message };
    }
  }

  _obtenerSoftwarePorPack(packId) {
    const packs = {
      'pack_web': [
        { nombre: 'nginx', version: '1.24', estado: 'pendiente' },
        { nombre: 'nodejs', version: '18.x', estado: 'pendiente' },
        { nombre: 'postgresql', version: '15', estado: 'pendiente' },
        { nombre: 'redis-server', version: '7.0', estado: 'pendiente' }
      ],
      'pack_dominio': [
        { nombre: 'bind9', version: '9.18', estado: 'pendiente' },
        { nombre: 'isc-dhcp-server', version: '4.4', estado: 'pendiente' },
        { nombre: 'samba', version: '4.17', estado: 'pendiente' },
        { nombre: 'krb5-kdc', version: '1.20', estado: 'pendiente' }
      ],
      'pack_cortafuegos': [
        { nombre: 'iptables-persistent', version: '1.0', estado: 'pendiente' },
        { nombre: 'fail2ban', version: '0.11', estado: 'pendiente' },
        { nombre: 'nftables', version: '1.0', estado: 'pendiente' }
      ],
      'pack_correo': [
        { nombre: 'postfix', version: '3.7', estado: 'pendiente' },
        { nombre: 'dovecot-core', version: '2.3', estado: 'pendiente' },
        { nombre: 'dovecot-imapd', version: '2.3', estado: 'pendiente' },
        { nombre: 'dovecot-pop3d', version: '2.3', estado: 'pendiente' },
        { nombre: 'spamassassin', version: '4.0', estado: 'pendiente' },
        { nombre: 'clamav', version: '1.0', estado: 'pendiente' },
        { nombre: 'clamav-daemon', version: '1.0', estado: 'pendiente' }
      ],
      'pack_monitoreo': [
        { nombre: 'prometheus', version: '2.45', estado: 'pendiente' },
        { nombre: 'prometheus-node-exporter', version: '1.6', estado: 'pendiente' }
      ]
    };
    
    return packs[packId] || [];
  }

  obtenerEstado(mixerId) {
    const mixer = this.mixersActivos.get(mixerId);
    if (!mixer) return null;
    
    return {
      id: mixer.id,
      estado: mixer.estado,
      cicloActual: mixer.cicloActual,
      totalCiclos: mixer.configuracion.totalCiclos,
      cicloActualInfo: mixer.cicloActualInfo,
      resultados: mixer.resultados.slice(-20),
      logs: mixer.logs.slice(-50),
      fechaFin: mixer.fechaFin
    };
  }

  conectarStream(mixerId, stream) {
    const mixer = this.mixersActivos.get(mixerId);
    if (!mixer) return false;

    mixer.stream = stream;

    const logsIniciales = (mixer.logs || []).slice(-100);
    logsIniciales.forEach((log) => {
      stream.write(`data: ${JSON.stringify(log)}\n\n`);
    });

    return true;
  }

  desconectarStream(mixerId, stream) {
    const mixer = this.mixersActivos.get(mixerId);
    if (!mixer) return;

    if (!stream || mixer.stream === stream) {
      mixer.stream = null;
    }
  }

  detenerMix(mixerId) {
    const mixer = this.mixersActivos.get(mixerId);
    if (!mixer) return false;
    
    mixer.detener = true;
    mixer.estado = 'detenido_manual';
    this._agregarLog(mixerId, `⏹️ Robot Mix detenido manualmente`, 'info');
    return true;
  }

  obtenerMixersActivos() {
    const mixers = [];
    for (const [id, mixer] of this.mixersActivos) {
      if (mixer.estado === 'ejecutando') {
        mixers.push(this._serializarMix(mixer));
      }
    }
    return mixers;
  }

  obtenerMixersHistorial() {
    const historial = [];
    for (const mixer of this.mixersActivos.values()) {
      if (mixer.estado !== 'ejecutando') {
        historial.push(this._serializarMix(mixer, true));
      }
    }

    return historial.sort((a, b) => {
      const aTime = new Date(a.fechaFin || a.inicio || 0).getTime();
      const bTime = new Date(b.fechaFin || b.inicio || 0).getTime();
      return bTime - aTime;
    });
  }

  _agregarLog(mixerId, mensaje, tipo = 'info') {
    const mixer = this.mixersActivos.get(mixerId);
    if (!mixer) return;
    
    const log = { hora: new Date().toLocaleTimeString(), mensaje, tipo };
    mixer.logs.push(log);
    console.log(`[Mix ${mixerId}] ${mensaje}`);
    
    if (mixer.stream) {
      mixer.stream.write(`data: ${JSON.stringify(log)}\n\n`);
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = RobotMixService;