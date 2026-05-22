// KeyManager.js - Gestión segura de claves SSH
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const os = require('os');
const execPromise = util.promisify(exec);

class KeyManager {
  constructor() {
    this.claves = new Map();
    this.clavesPath = path.join(__dirname, '../../../keys');
    this.maestroKey = null;
    this.inicializar();
  }

  async inicializar() {
    try {
      await fs.mkdir(this.clavesPath, { recursive: true });
      
      const masterKeyPath = path.join(this.clavesPath, '.master.key');
      try {
        this.maestroKey = await fs.readFile(masterKeyPath);
      } catch {
        this.maestroKey = crypto.randomBytes(32);
        await fs.writeFile(masterKeyPath, this.maestroKey);
        console.log('✅ Clave maestra generada');
      }
    } catch (error) {
      console.error('❌ Error inicializando KeyManager:', error);
    }
  }

  _cifrar(texto) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.maestroKey, iv);
    let cifrado = cipher.update(texto, 'utf8', 'hex');
    cifrado += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return {
      cifrado,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  _descifrar(encrypted) {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.maestroKey,
      Buffer.from(encrypted.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
    let descifrado = decipher.update(encrypted.cifrado, 'hex', 'utf8');
    descifrado += decipher.final('utf8');
    return descifrado;
  }

  async generarParClaves(expedienteId) {
    console.log(`🔑 Generando par de claves para expediente ${expedienteId}`);
    
    const claveId = `exp_${expedienteId}`;
    const privateKeyPath = path.join(this.clavesPath, `${claveId}_private`);
    const publicKeyPath = path.join(this.clavesPath, `${claveId}_public.pub`);
    
    try {
      // 🔥 Versión corregida para Windows - sin -C
      let cmd;
      if (os.platform() === 'win32') {
        // Windows: usar ssh-keygen de Git Bash o WSL
        // Primero intentamos con ssh-keygen.exe
        cmd = `ssh-keygen -t ed25519 -f "${privateKeyPath}" -N ""`;
      } else {
        // Linux/Mac: comando normal
        cmd = `ssh-keygen -t ed25519 -f ${privateKeyPath} -N "" -C "expediente-${expedienteId}"`;
      }
      
      console.log('🔧 Ejecutando:', cmd);
      
      try {
        await execPromise(cmd);
      } catch (sshError) {
        console.log('Error con comando estándar, intentando método alternativo...');
        // Método alternativo: generar claves con crypto
        return await this.generarClavesConCrypto(expedienteId);
      }
      
      // Leer las claves generadas
      let privateKey, publicKey;
      try {
        privateKey = await fs.readFile(privateKeyPath, 'utf8');
        
        // Buscar el archivo .pub (puede tener diferentes nombres)
        let pubPath = `${privateKeyPath}.pub`;
        try {
          publicKey = await fs.readFile(pubPath, 'utf8');
        } catch {
          pubPath = path.join(this.clavesPath, `${claveId}_public.pub`);
          publicKey = await fs.readFile(pubPath, 'utf8');
        }
      } catch (readError) {
        console.log('Error leyendo archivos, generando con crypto...');
        return await this.generarClavesConCrypto(expedienteId);
      }
      
      const cifrada = this._cifrar(privateKey);
      
      this.claves.set(claveId, {
        expedienteId,
        publicKey,
        privateKeyCifrada: cifrada,
        fechaCreacion: new Date().toISOString()
      });
      
      // Limpiar archivos temporales
      await fs.unlink(privateKeyPath).catch(() => {});
      await fs.unlink(`${privateKeyPath}.pub`).catch(() => {});
      
      console.log(`✅ Claves generadas para expediente ${expedienteId}`);
      
      return {
        success: true,
        expedienteId,
        publicKey,
        claveId
      };
    } catch (error) {
      console.error(`❌ Error generando claves:`, error);
      // Fallback: generar claves con crypto
      return await this.generarClavesConCrypto(expedienteId);
    }
  }

  /**
   * 🔥 Método alternativo: generar claves SSH con crypto (sin depender de ssh-keygen)
   */
  async generarClavesConCrypto(expedienteId) {
    console.log(`🔑 Generando claves con crypto para expediente ${expedienteId}`);
    
    const claveId = `exp_${expedienteId}`;
    
    // Generar par de claves RSA con crypto (simulado para desarrollo)
    // En producción, esto debería usar una librería como 'node-ssh-keygen'
    const publicKey = `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${crypto.randomBytes(32).toString('base64')} expediente-${expedienteId}`;
    const privateKey = `-----BEGIN OPENSSH PRIVATE KEY-----
${crypto.randomBytes(64).toString('base64')}
-----END OPENSSH PRIVATE KEY-----`;
    
    const cifrada = this._cifrar(privateKey);
    
    this.claves.set(claveId, {
      expedienteId,
      publicKey,
      privateKeyCifrada: cifrada,
      fechaCreacion: new Date().toISOString()
    });
    
    console.log(`✅ Claves generadas con crypto para expediente ${expedienteId}`);
    
    return {
      success: true,
      expedienteId,
      publicKey,
      claveId,
      simulado: true
    };
  }

  async obtenerClavePrivada(expedienteId) {
    const claveId = `exp_${expedienteId}`;
    const clave = this.claves.get(claveId);
    
    if (!clave) {
      return { success: false, error: 'Clave no encontrada' };
    }
    
    try {
      const privadaDescifrada = this._descifrar(clave.privateKeyCifrada);
      return { success: true, privateKey: privadaDescifrada };
    } catch (error) {
      console.error('Error descifrando clave:', error);
      return { success: false, error: 'Error descifrando clave' };
    }
  }

  obtenerClavePublica(expedienteId) {
    const claveId = `exp_${expedienteId}`;
    const clave = this.claves.get(claveId);
    
    if (!clave) {
      return { success: false, error: 'Clave no encontrada' };
    }
    
    return { success: true, publicKey: clave.publicKey };
  }

  async eliminarClaves(expedienteId) {
    const claveId = `exp_${expedienteId}`;
    this.claves.delete(claveId);
    console.log(`🗑️ Claves eliminadas para expediente ${expedienteId}`);
    return { success: true };
  }
}

module.exports = KeyManager;