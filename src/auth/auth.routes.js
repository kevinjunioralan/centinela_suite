const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

// ============ FUNCIÓN PARA CAPTURAR IP REAL ============
function getClientIp(req) {
  // Para localhost, convertir ::1 a 127.0.0.1
  let ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || 
           req.headers['x-real-ip'] ||
           req.ip || 
           req.connection?.remoteAddress ||
           'desconocida';
  
  // Convertir IPv6 loopback (::1) a IPv4 (127.0.0.1)
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }
  
  // Si es IPv6 con prefijo, limpiar
  if (ip && ip.includes('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  
  return ip;
}

router.post('/login', async (req, res) => {
  try {
    console.log('🔐 [LOGIN] PASO 1: Iniciando');
    console.log('🔐 [LOGIN] Body recibido:', req.body);
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      console.log('❌ [LOGIN] Email o password faltantes');
      return res.status(400).json({ 
        success: false, 
        error: 'Email y contraseña son requeridos' 
      });
    }
    
    console.log('🔐 [LOGIN] PASO 2: Buscando usuario:', email);
    
    const Usuario = require('../expediente/models/Usuario');
    const usuario = await Usuario.findOne({ email });
    
    if (!usuario) {
      console.log('❌ [LOGIN] Usuario no encontrado');
      return res.status(401).json({ 
        success: false, 
        error: 'Credenciales inválidas' 
      });
    }
    
    console.log('🔐 [LOGIN] PASO 3: Usuario encontrado, verificando password');
    
    const bcrypt = require('bcryptjs');
    const passwordValido = await bcrypt.compare(password, usuario.password);
    
    if (!passwordValido) {
      console.log('❌ [LOGIN] Password incorrecto');
      return res.status(401).json({ 
        success: false, 
        error: 'Credenciales inválidas' 
      });
    }
    
    console.log('🔐 [LOGIN] PASO 4: Password correcto, actualizando último acceso');
    
    usuario.ultimoAcceso = new Date();
    await usuario.save();
    
    console.log('🔐 [LOGIN] PASO 5: Login exitoso');
    
    res.json({ 
      success: true, 
      data: {
        token: 'token-' + Date.now(),
        usuario: {
          id: usuario._id,
          nombre: usuario.nombre,
          email: usuario.email,
          rol: usuario.rol,
          clienteId: usuario.clienteId
        }
      }
    });
  } catch (error) {
    console.error('❌ [LOGIN] ERROR CAPTURADO:', error);
    console.error('❌ [LOGIN] Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor',
      message: error.message 
    });
  }
});// ============ GESTIÓN DE USUARIOS ============

// Listar todos los usuarios
router.get('/usuarios', async (req, res) => {
  try {
    const Usuario = require('../expediente/models/Usuario');
    const usuarios = await Usuario.find()
      .select('-password')
      .sort({ createdAt: -1 });
    
    console.log(`📋 Usuarios encontrados: ${usuarios.length}`);
    res.json({ success: true, data: usuarios });
  } catch (error) {
    console.error('Error GET /usuarios:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear usuario
router.post('/usuarios', async (req, res) => {
  try {
    const Usuario = require('../expediente/models/Usuario');
    const { nombre, email, password, rol, clienteId, activo } = req.body;
    
    console.log('📝 Creando usuario:', { nombre, email, rol, clienteId });
    
    if (!nombre || !email || !password || !rol) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan campos requeridos' 
      });
    }
    
    const existe = await Usuario.findOne({ email });
    if (existe) {
      return res.status(400).json({ 
        success: false, 
        error: 'El email ya está registrado' 
      });
    }
    
    if (rol === 'VISOR' && !clienteId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Los usuarios VISOR deben tener un clienteId' 
      });
    }
    
    const usuario = new Usuario({ 
      nombre, 
      email, 
      password, 
      rol, 
      clienteId: clienteId || null,
      activo: activo !== false
    });
    
    await usuario.save();
    console.log(`✅ Usuario creado: ${email} (${rol})`);
    
    res.json({ 
      success: true, 
      data: { 
        id: usuario._id, 
        nombre, 
        email, 
        rol, 
        clienteId: usuario.clienteId
      } 
    });
  } catch (error) {
    console.error('Error POST /usuarios:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Editar usuario
router.put('/usuarios/:id', async (req, res) => {
  try {
    const Usuario = require('../expediente/models/Usuario');
    const { nombre, email, rol, clienteId, activo } = req.body;
    
    const usuario = await Usuario.findByIdAndUpdate(
      req.params.id,
      { nombre, email, rol, clienteId: clienteId || null, activo },
      { new: true }
    ).select('-password');
    
    if (!usuario) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    
    console.log(`✅ Usuario actualizado: ${usuario.email}`);
    res.json({ success: true, data: usuario });
  } catch (error) {
    console.error('Error PUT /usuarios/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar usuario
router.delete('/usuarios/:id', async (req, res) => {
  try {
    const Usuario = require('../expediente/models/Usuario');
    const usuario = await Usuario.findById(req.params.id);
    
    if (!usuario) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    
    if (usuario.email === 'admin@centinela.com') {
      return res.status(400).json({ 
        success: false, 
        error: 'No se puede eliminar al administrador principal' 
      });
    }
    
    await Usuario.findByIdAndDelete(req.params.id);
    console.log(`🗑️ Usuario eliminado: ${usuario.email}`);
    res.json({ success: true, message: 'Usuario eliminado' });
  } catch (error) {
    console.error('Error DELETE /usuarios/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resetear contraseña
router.post('/usuarios/:id/reset-password', async (req, res) => {
  try {
    const Usuario = require('../expediente/models/Usuario');
    const { nuevaPassword } = req.body;
    
    if (!nuevaPassword) {
      return res.status(400).json({ success: false, error: 'La nueva contraseña es requerida' });
    }
    
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    
    usuario.password = nuevaPassword;
    await usuario.save();
    
    console.log(`🔑 Contraseña actualizada para: ${usuario.email}`);
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (error) {
    console.error('Error POST /usuarios/:id/reset-password:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ LOGOUT ============
router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const email = req.body.email || 'desconocido';
    const clienteIp = getClientIp(req);
    
    console.log(`🚪 Logout: ${email} desde IP: ${clienteIp}`);
    
    // ✅ REGISTRAR LOGOUT CON IP REAL
    try {
      const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
      await EventoAuditoria.create({
        tipo: 'logout',
        modulo: 'auth',
        usuario: email,
        detalles: { 
          token: token ? token.substring(0, 20) + '...' : null,
          ip: clienteIp
        },
        ip: clienteIp,
        fecha: new Date()
      });
      console.log(`📝 Evento de logout registrado desde IP: ${clienteIp}`);
    } catch (err) {
      console.error('Error registrando evento de logout:', err.message);
    }
    
    res.json({ success: true, message: 'Sesión cerrada' });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ LOGS DE ACCESO ============
router.get('/logs-acceso', async (req, res) => {
  try {
    const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
    const logs = await EventoAuditoria.find({
      modulo: 'auth',
      tipo: { $in: ['login', 'logout'] }
    })
    .sort({ fecha: -1 })
    .limit(100);
    
    console.log(`📋 Logs de acceso consultados: ${logs.length} registros`);
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Error obteniendo logs de acceso:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ACCESOS DE HOY ============
router.get('/accesos-hoy', async (req, res) => {
  try {
    const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const accesosHoy = await EventoAuditoria.countDocuments({
      modulo: 'auth',
      tipo: 'login',
      fecha: { $gte: hoy }
    });
    res.json({ success: true, data: { accesosHoy } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;