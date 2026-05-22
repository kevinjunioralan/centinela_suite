// SSHManager.js - Versión completa con todos los métodos
const { Client } = require('ssh2');
const EventEmitter = require('events');
const Expediente = require('../../expediente/models/Expediente');

class SSHManager {
  constructor() {
    EventEmitter.call(this);
    this.sesiones = new Map();
    this.clientesSSH = new Map();
    
    this.maxSesiones = parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 10;
    this.timeoutSesion = parseInt(process.env.SESSION_TIMEOUT) || 1800000;
  }

  _validarComando(comando) {
    const comandosAutorizados = new Set([
      'ls', 'pwd', 'whoami', 'date', 'hostname', 'ip', 'netstat', 'ping',
      'traceroute', 'df', 'du', 'free', 'ps', 'top', 'cat', 'grep', 'find',
      'lsblk', 'fdisk', 'mount', 'umount', 'systemctl', 'service', 'journalctl',
      'dmesg', 'uname', 'arch', 'lscpu', 'lsusb', 'lspci', 'echo', 'ss', 'who',
      'awk', 'cut', 'sort', 'uniq', 'head', 'tail', 'wc', 'tr', 'uptime', 'nproc'
    ]);
    const comandoBase = comando.trim().split(/\s+/)[0];
    return comandosAutorizados.has(comandoBase);
  }

  async conectarCliente(expedienteId, servidorIp, usuario, contrasena) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        console.log(`✅ Conexión SSH establecida con ${servidorIp}`);
        this.clientesSSH.set(expedienteId.toString(), conn);
        resolve(conn);
      });
      
      conn.on('error', (err) => {
        console.error(`❌ Error SSH: ${err.message}`);
        reject(err);
      });
      
      conn.connect({
        host: servidorIp,
        port: 22,
        username: usuario,
        password: contrasena,
        readyTimeout: parseInt(process.env.SSH_TIMEOUT) || 30000
      });
    });
  }

  async iniciarSesion(expedienteId, namespaceId, servidorIp, usuario, puerto, contrasena) {
    console.log(`🔐 Iniciando sesión SSH para expediente ${expedienteId}`);
    console.log(`📡 Servidor: ${usuario}@${servidorIp}:${puerto}`);
    
    if (this.sesiones.size >= this.maxSesiones) {
      return { success: false, error: `Máximo de sesiones concurrentes alcanzado (${this.maxSesiones})` };
    }
    
    try {
      const conn = await this.conectarCliente(expedienteId, servidorIp, usuario, contrasena);
      
      const ahora = new Date();
      
      this.sesiones.set(expedienteId.toString(), {
        expedienteId,
        namespaceId,
        servidorIp,
        usuario,
        conn,
        activo: true,
        creado: ahora.toISOString(),
        comandosEjecutados: []
      });
      
      await Expediente.findByIdAndUpdate(expedienteId, {
        conexionSSH: {
          fechaInicio: ahora,
          fechaFin: null,
          duracionSegundos: 0,
          ultimoComando: null,
          totalComandos: 0
        },
        metricas: {
          tiempoConexionMs: 0,
          ultimaActividad: ahora
        }
      });
      
      return {
        success: true,
        expedienteId,
        mensaje: `✅ Conexión SSH establecida con ${usuario}@${servidorIp}`
      };
    } catch (error) {
      console.error('❌ Error en conexión SSH:', error);
      return { success: false, error: error.message };
    }
  }

  async ejecutarComando(expedienteId, comando) {
    const sesion = this.sesiones.get(expedienteId.toString());
    
    if (!sesion || !sesion.conn) {
      throw new Error('No hay conexión SSH activa');
    }
    
    return new Promise((resolve, reject) => {
      sesion.conn.exec(comando, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        
        let salida = '';
        let error = '';
        
        stream.on('data', (data) => { salida += data.toString(); });
        stream.stderr.on('data', (data) => { error += data.toString(); });
        
        stream.on('close', () => {
          resolve({ success: true, salida: salida.trim(), stderr: error.trim() });
        });
      });
    });
  }

  async ejecutarComandoSeguro(expedienteId, comando, nivel = 'basico') {
    console.log(`🔍 Ejecutando: ${comando}`);
    
    try {
      const sesion = this.sesiones.get(expedienteId.toString());
      if (!sesion) return { success: false, error: 'No hay sesión activa' };
      
      if (!this._validarComando(comando)) {
        return { success: false, error: `Comando no autorizado: ${comando}` };
      }
      
      const inicio = Date.now();
      const resultado = await this.ejecutarComando(expedienteId, comando);
      const tiempoMs = Date.now() - inicio;
      
      sesion.comandosEjecutados.push({
        comando,
        timestamp: new Date().toISOString(),
        salida: resultado.salida,
        tiempoMs
      });
      
      const expediente = await Expediente.findById(expedienteId);
      if (expediente) {
        const totalComandos = (expediente.conexionSSH?.totalComandos || 0) + 1;
        await Expediente.findByIdAndUpdate(expedienteId, {
          'conexionSSH.ultimoComando': comando,
          'conexionSSH.totalComandos': totalComandos,
          'metricas.tiempoConexionMs': (expediente.metricas?.tiempoConexionMs || 0) + tiempoMs,
          'metricas.ultimaActividad': new Date()
        });
      }
      
      return resultado;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async cerrarSesion(expedienteId) {
    try {
      const expId = expedienteId.toString();
      const sesion = this.sesiones.get(expId);
      const cliente = this.clientesSSH.get(expId);
      
      if (cliente) {
        cliente.end();
      }
      
      if (sesion && sesion.creado) {
        const fechaInicio = new Date(sesion.creado);
        const fechaFin = new Date();
        const duracionSegundos = Math.floor((fechaFin - fechaInicio) / 1000);
        
        await Expediente.findByIdAndUpdate(expedienteId, {
          'conexionSSH.fechaFin': fechaFin,
          'conexionSSH.duracionSegundos': duracionSegundos
        });
      }
      
      this.clientesSSH.delete(expId);
      this.sesiones.delete(expId);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async estadoSesion(expedienteId) {
    const sesion = this.sesiones.get(expedienteId.toString());
    if (!sesion) {
      return { success: false, error: 'No existe sesión' };
    }
    return {
      success: true,
      activo: sesion.activo,
      creado: sesion.creado,
      comandosEjecutados: sesion.comandosEjecutados
    };
  }
}

Object.setPrototypeOf(SSHManager.prototype, EventEmitter.prototype);
module.exports = SSHManager;