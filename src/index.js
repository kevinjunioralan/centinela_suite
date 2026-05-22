// ============================================================================
// CENTINELA BANCO DE PRUEBAS - BACKEND ENTRY POINT (MODO PRUEBAS)
// ============================================================================

// 1. IMPORTS DE TERCEROS (primero)
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
// const rateLimit = require('express-rate-limit'); // ❌ DESACTIVADO PARA PRUEBAS
const mongoose = require('mongoose');
const requestIp = require('request-ip');
require('dotenv').config();

// 2. IMPORTS LOCALES (configuración, servicios, rutas)
const connectMongo = require('./config/mongo');
const EventoAuditoria = require('./auditoria/models/EventoAuditoria');
const Expediente = require('./expediente/models/Expediente');
const NocturnoScheduler = require('./scheduler/NocturnoScheduler');

// 3. IMPORTS DE RUTAS
const authRoutes = require('./auth/auth.routes');
const apiPublicaRoutes = require('./apiPublica/apiPublica.routes');
const aislamientoRoutes = require('./aislamiento/aislamiento.routes');
const auditorRoutes = require('./auditor/auditor.routes');
const coreRoutes = require('./core/core.routes');
const expedienteRoutes = require('./expediente/expediente.routes');
const integracionRoutes = require('./integracion/integracion.routes');
const pruebasRoutes = require('./pruebas/pruebas.routes');
const seguridadRoutes = require('./seguridad/seguridad.routes');
const auditoriaRoutes = require('./auditoria/auditoria.routes');
const robotRoutes = require('./robot/robot.routes');
const mantenimientoRoutes = require('./mantenimiento/mantenimiento.routes');
const informesRoutes = require('./informes/informes.routes');
const instalacionRoutes = require('./instalacion/instalacion.routes');
const arquitecturaRoutes = require('./arquitectura/arquitectura.routes');
const clienteRoutes = require('./cliente/cliente.routes');
const redesRoutes = require('./red/red.routes');
const organizacionRoutes = require('./organizacion/organizacion.routes');
const dashboardRoutes = require('./dashboard/dashboard.routes');
const oraculoRoutes = require('./oraculo/oraculo.routes');
const aprendizajeRoutes = require('./aprendizaje/aprendizajeRoutes');

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const app = express();
const PORT = process.env.PORT || 3012;
const AUDITOR_LEGACY_ENABLED = process.env.ENABLE_AUDITOR_LEGACY !== 'false';

// ============================================================================
// MIDDLEWARES GLOBALES
// ============================================================================
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestIp.mw());

// ============================================================================
// RATE LIMITING - DESACTIVADO PARA PRUEBAS
// ============================================================================
// ❌ Comentado para evitar bloqueos durante pruebas
// const globalLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 100,
//   message: { success: false, error: 'Demasiadas peticiones, intente más tarde' }
// });
// app.use(globalLimiter);

// ✅ Limiter solo para login (mantenemos seguridad básica)
const loginLimiter = (req, res, next) => {
  // Por ahora, permitimos todo en pruebas
  next();
};
app.use('/api/centinela-banco-pruebas/auth/login', loginLimiter);

// ============================================================================
// RUTAS PÚBLICAS (NO requieren autenticación)
// ============================================================================

// Ruta de estado del sistema
app.get('/api/centinela-banco-pruebas/estado', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const eventosUltimaHora = await EventoAuditoria.countDocuments({
      fecha: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
    });
    const servidoresEnCustodia = await Expediente.countDocuments({ 
      origen: 'mantenimiento',
      eliminado: { $ne: true }
    });
    const memoria = process.memoryUsage();

    res.json({
      success: true,
      data: {
        service: 'centinela-banco-pruebas',
        status: 'active',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        health: {
          database: dbStatus,
          lastActivity: eventosUltimaHora > 0 ? 'active' : 'low',
          eventosUltimaHora,
          servidoresEnCustodia,
          uptime: Math.floor(process.uptime()),
          memory: {
            heapUsed: Math.round(memoria.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memoria.heapTotal / 1024 / 1024) + 'MB',
            rss: Math.round(memoria.rss / 1024 / 1024) + 'MB'
          }
        },
        modules: [
          'instalacion', 'mantenimiento', 'auditoria', 'aprendizaje', 
          'informes', 'robot', 'expediente', 'cliente', 'red', 'organizacion'
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      details: error.message
    });
  }
});

// Rutas de autenticación
app.use('/api/centinela-banco-pruebas/auth', authRoutes);
app.use('/api/publica', apiPublicaRoutes);

// ============================================================================
// RUTAS PROTEGIDAS (temporalmente públicas para pruebas)
// ============================================================================
app.use('/api/centinela-banco-pruebas/aislamiento', aislamientoRoutes);
if (AUDITOR_LEGACY_ENABLED) {
  app.use('/api/centinela-banco-pruebas/auditor', auditorRoutes);
} else {
  app.use('/api/centinela-banco-pruebas/auditor', (req, res) => {
    res.set('Deprecation', 'true');
    res.set('Link', '</api/centinela-banco-pruebas/auditoria>; rel="successor-version"');
    return res.status(410).json({
      success: false,
      error: 'Ruta legacy /auditor deshabilitada',
      successor: '/api/centinela-banco-pruebas/auditoria'
    });
  });
}
app.use('/api/centinela-banco-pruebas/core', coreRoutes);
app.use('/api/centinela-banco-pruebas/expediente', expedienteRoutes);
app.use('/api/centinela-banco-pruebas/integracion', integracionRoutes);
app.use('/api/centinela-banco-pruebas/pruebas', pruebasRoutes);
app.use('/api/centinela-banco-pruebas/seguridad', seguridadRoutes);
app.use('/api/centinela-banco-pruebas/auditoria', auditoriaRoutes);
app.use('/api/centinela-banco-pruebas/robot', robotRoutes);
app.use('/api/centinela-banco-pruebas/mantenimiento', mantenimientoRoutes);
app.use('/api/centinela-banco-pruebas/informes', informesRoutes);
app.use('/api/centinela-banco-pruebas/instalacion', instalacionRoutes);
app.use('/api/centinela-banco-pruebas/arquitectura', arquitecturaRoutes);
app.use('/api/centinela-banco-pruebas/clientes', clienteRoutes);
app.use('/api/centinela-banco-pruebas/redes', redesRoutes);
app.use('/api/centinela-banco-pruebas/organizacion', organizacionRoutes);
app.use('/api/centinela-banco-pruebas/dashboard', dashboardRoutes);
app.use('/api/centinela-banco-pruebas/oraculo', oraculoRoutes);
app.use('/api/centinela-banco-pruebas/aprendizaje', aprendizajeRoutes);

// ============================================================================
// MANEJO DE ERRORES
// ============================================================================

// Ruta no encontrada (404)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  });
});

// Manejador global de errores (500)
app.use((err, req, res, next) => {
  console.error('❌ Error interno:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================================================
// INICIALIZACIÓN DE SERVICIOS
// ============================================================================

// Iniciar conexión a MongoDB
connectMongo();

// Iniciar servidor HTTP
const server = app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║     ✅ SERVIDOR CENTINELA BANCO DE PRUEBAS - MODO PRUEBAS        ║
╠══════════════════════════════════════════════════════════════════╣
║  📡 API: http://localhost:${PORT}/api/centinela-banco-pruebas      ║
║  🔓 Login: http://localhost:${PORT}/api/centinela-banco-pruebas/auth/login ║
║  🧠 ORÁCULO: http://localhost:${PORT}/api/centinela-banco-pruebas/oraculo   ║
║  🤖 ROBOTS: http://localhost:${PORT}/api/centinela-banco-pruebas/robot      ║
╠══════════════════════════════════════════════════════════════════╣
║  ⚠️  MODO PRUEBAS - Rate limiting DESACTIVADO                   ║
║  ⚠️  Autenticación DESACTIVADA temporalmente                    ║
╚══════════════════════════════════════════════════════════════════╝
  `);
});

// Iniciar programador nocturno (solo si está activado en .env)
if (process.env.ACTIVAR_SIMULACION_NOCTURNA === 'true') {
  const scheduler = new NocturnoScheduler();
  scheduler.iniciar({
    servidorIp: process.env.SERVIDOR_PRUEBAS_IP,
    servidorUsuario: process.env.SERVIDOR_PRUEBAS_USUARIO,
    servidorPassword: process.env.SERVIDOR_PRUEBAS_PASSWORD,
    pack: process.env.SIMULACION_PACK || 'pack_web',
    intensidad: process.env.SIMULACION_INTENSIDAD || 'media',
    fallosActivos: true
  });
  console.log('🌙 [SCHEDULER] Programador nocturno activado');
} else {
  console.log('🌙 [SCHEDULER] Programador nocturno desactivado');
}

module.exports = app;