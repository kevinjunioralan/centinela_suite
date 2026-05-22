// Centinela Banco de Pruebas - Backend Entry Point
const connectMongo = require('./config/mongo');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3012;

// ============ CONFIGURACIÓN DE SEGURIDAD ============

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 peticiones por IP
  message: { success: false, error: 'Demasiadas peticiones, intente más tarde' }
});

// Middleware de seguridad
app.use(helmet());
app.use(cors());
app.use(limiter);
app.use(express.json());

// ============ RUTAS PÚBLICAS ============

// Rutas de autenticación (no requieren token)
const authRoutes = require('./auth/auth.routes');
app.use('/api/centinela-banco-pruebas/auth', authRoutes);

// ============ MIDDLEWARE DE AUTENTICACIÓN ============
const authMiddleware = require('./middleware/auth');

// Aplicar autenticación a todas las rutas protegidas
app.use('/api/centinela-banco-pruebas', authMiddleware);

// ============ RUTAS PROTEGIDAS ============

// Importar rutas
const aislamientoRoutes = require('./aislamiento/aislamiento.routes');
const auditorRoutes = require('./auditor/auditor.routes');
const coreRoutes = require('./core/core.routes');
const expedienteRoutes = require('./expediente/expediente.routes');
const integracionRoutes = require('./integracion/integracion.routes');
const pruebasRoutes = require('./pruebas/pruebas.routes');
const seguridadRoutes = require('./seguridad/seguridad.routes');
const aprendizajeRoutes = require('./aprendizaje/aprendizajeRoutes');
const auditoriaRoutes = require('./auditoria/auditoria.routes');
const robotRoutes = require('./robot/robot.routes');
const mantenimientoRoutes = require('./mantenimiento/mantenimiento.routes');
const informesRoutes = require('./informes/informes.routes');
const clienteRoutes = require('./cliente/cliente.routes');
const redesRoutes = require('./red/red.routes');
const organizacionRoutes = require('./organizacion/organizacion.routes');
const instalacionRoutes = require('./instalacion/instalacion.routes');
const arquitecturaRoutes = require('./arquitectura/arquitectura.routes');
const apiPublicaRoutes = require('./apiPublica/apiPublica.routes');

// Aplicar rutas
app.use('/api/centinela-banco-pruebas/aislamiento', aislamientoRoutes);
app.use('/api/centinela-banco-pruebas/auditor', auditorRoutes);
app.use('/api/centinela-banco-pruebas/core', coreRoutes);
app.use('/api/centinela-banco-pruebas/expediente', expedienteRoutes);
app.use('/api/centinela-banco-pruebas/integracion', integracionRoutes);
app.use('/api/centinela-banco-pruebas/pruebas', pruebasRoutes);
app.use('/api/centinela-banco-pruebas/seguridad', seguridadRoutes);
app.use('/api/centinela-banco-pruebas/aprendizaje', aprendizajeRoutes);
app.use('/api/centinela-banco-pruebas/auditoria', auditoriaRoutes);
app.use('/api/centinela-banco-pruebas/robot', robotRoutes);
app.use('/api/centinela-banco-pruebas/mantenimiento', mantenimientoRoutes);
app.use('/api/centinela-banco-pruebas/informes', informesRoutes);
app.use('/api/centinela-banco-pruebas/clientes', clienteRoutes);
app.use('/api/centinela-banco-pruebas/redes', redesRoutes);
app.use('/api/centinela-banco-pruebas/organizacion', organizacionRoutes);
app.use('/api/centinela-banco-pruebas/instalacion', instalacionRoutes);
app.use('/api/centinela-banco-pruebas/arquitectura', arquitecturaRoutes);
app.use('/api/publica', apiPublicaRoutes);

// Ruta de estado del servicio (pública)
app.get('/api/centinela-banco-pruebas/estado', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'centinela-banco-pruebas',
      status: 'active',
      timestamp: new Date().toISOString(),
      components: [
        'aislamiento',
        'auditor',
        'core',
        'expediente',
        'integracion',
        'pruebas',
        'seguridad',
        'aprendizaje',
        'auditoria',
        'mantenimiento',
        'informes',
        'clientes',
        'redes',
        'organizacion',
        'instalacion',
        'arquitectura'
      ]
    }
  });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Ruta no encontrada'
  });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor'
  });
});

// ============ CREAR USUARIO ADMIN SI NO EXISTE ============
async function crearAdminSiNoExiste() {
  try {
    const Usuario = require('./expediente/models/Usuario');
    const existe = await Usuario.findOne({ rol: 'ADMIN' });
    if (!existe) {
      const admin = new Usuario({
        nombre: 'Administrador',
        email: 'admin@centinela.com',
        password: 'Admin123!',
        rol: 'ADMIN',
        activo: true
      });
      await admin.save();
      console.log('✅ Usuario ADMIN creado automáticamente');
      console.log('   Email: admin@centinela.com');
      console.log('   Contraseña: Admin123!');
      console.log('   ⚠️ CAMBIE LA CONTRASEÑA EN EL PRIMER INICIO DE SESIÓN');
    } else {
      console.log('✅ Usuario ADMIN ya existe');
    }
  } catch (error) {
    console.log('⚠️ No se pudo verificar/crear usuario ADMIN:', error.message);
  }
}

// Conectar a MongoDB y crear admin
connectMongo();
setTimeout(crearAdminSiNoExiste, 2000);

app.listen(PORT, () => {
  console.log(`Servicio Centinela Banco de Pruebas ejecutándose en puerto ${PORT}`);
});

module.exports = app;