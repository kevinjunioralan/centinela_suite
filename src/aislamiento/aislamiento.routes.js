const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const HabitacionBuilderService = require('./HabitacionBuilder/HabitacionBuilder.service');
const HabitacionDestroyer = require('./HabitacionDestroyer/HabitacionDestroyer');
const HabitacionValidator = require('./HabitacionValidator/HabitacionValidator');

// Modelos
const Expediente = require('../expediente/models/Expediente');
const Habitacion = require('./models/Habitacion');

// 🔥 IMPORTAR SSHManager
const SSHManager = require('../ssh/SSHManager/SSHManager');
const sshManager = new SSHManager();

// 🔥 IMPORTAR AUDITORÍA (SOLO UNA VEZ)
const AuditoriaService = require('../Auditoria/AuditoriaService');
const auditoriaService = new AuditoriaService();

const habitacionBuilder = new HabitacionBuilderService();
const habitacionDestroyer = new HabitacionDestroyer();
const habitacionValidator = new HabitacionValidator();


// Resto del código...

// ==================== LISTAR HABITACIONES ====================
router.get('/habitaciones', async (req, res) => {
  console.log('📩 [ROUTER] GET /aislamiento/habitaciones recibido');
  try {
    const habitacionesDB = await Habitacion.find({ estado: 'activa' })
      .populate('expedienteId', 'nombre')
      .sort({ fechaCreacion: -1 });
    
    const habitaciones = habitacionesDB.map(h => ({
      id: h.habitacionId,
      nombre: h.nombre,
      tipo: h.tipo,
      estado: h.estado,
      fechaCreacion: h.fechaCreacion,
      configuracion: h.configuracion,
      expediente: h.expedienteId
    }));
    
    console.log(`✅ Habitaciones obtenidas: ${habitaciones.length}`);
    res.json({
      success: true,
      data: {
        habitaciones: habitaciones,
        total: habitaciones.length
      }
    });
  } catch (error) {
    console.error('❌ Error en GET /habitaciones:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== CREAR HABITACIÓN ====================
router.post('/habitaciones/crear', async (req, res) => {
  console.log('📩 [ROUTER] POST /aislamiento/habitaciones/crear recibido');
  console.log('📦 Body recibido:', JSON.stringify(req.body, null, 2));
  
  try {
    const { nombre, tipo, configuracion } = req.body;
    let expedienteId = configuracion?.expedienteId;

    if (!nombre || !tipo) {
      return res.status(400).json({
        success: false,
        error: 'Nombre y tipo son requeridos'
      });
    }

    if (!expedienteId) {
      return res.status(400).json({
        success: false,
        error: 'expedienteId es requerido'
      });
    }

    // Validar la configuración
    const validacion = await habitacionValidator.validarConfiguracion(tipo, configuracion);
    
    if (!validacion.valido) {
      return res.status(400).json({
        success: false,
        error: 'Configuración inválida',
        detalles: validacion.errores
      });
    }

    // Buscar expediente
    let expediente;
    try {
      if (mongoose.Types.ObjectId.isValid(expedienteId)) {
        expediente = await Expediente.findById(expedienteId);
      }
    } catch (err) {
      console.log('Error buscando expediente:', err.message);
    }
    
    if (!expediente) {
      console.log('❌ Expediente NO encontrado para ID:', expedienteId);
      return res.status(404).json({
        success: false,
        error: `Expediente no encontrado con ID: ${expedienteId}`
      });
    }
    
    console.log(`✅ Expediente encontrado: ${expediente._id} - ${expediente.nombre}`);
    
    if (expediente.estado !== 'pendiente') {
      return res.status(400).json({
        success: false,
        error: `El expediente está en estado "${expediente.estado}". Solo se pueden aislar expedientes pendientes.`
      });
    }

    // Verificar si ya existe una habitación activa
    const habitacionExistente = await Habitacion.findOne({ 
      expedienteId: expediente._id, 
      estado: 'activa' 
    });
    
    if (habitacionExistente) {
      console.log(`⚠️ Ya existe una habitación activa para este expediente: ${habitacionExistente.habitacionId}`);
      return res.status(400).json({
        success: false,
        error: `Ya existe una habitación activa para este expediente. Destruye la existente primero.`,
        habitacionExistente: habitacionExistente.habitacionId
      });
    }

    // Crear ID de habitación
    const habitacionId = `hab_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Guardar habitación en MongoDB
    const nuevaHabitacion = new Habitacion({
      habitacionId: habitacionId,
      expedienteId: expediente._id,
      nombre: nombre,
      tipo: tipo,
      estado: 'activa',
      configuracion: {
        namespaceId: `ns-expediente-${expediente._id}`,
        ipInterna: `10.0.${expediente._id}.1`,
      },
      historialAcciones: [{
        accion: 'creacion',
        fecha: new Date(),
        detalles: { nombre, tipo, expedienteId: expediente._id }
      }]
    });

    const savedHabitacion = await nuevaHabitacion.save();
    console.log(`✅ Habitación guardada en MongoDB: ${savedHabitacion.habitacionId}`);

    // 🔥 REGISTRAR EVENTO DE AUDITORÍA
    await auditoriaService.registrarEvento('creacion_habitacion', req.user?.username || 'sistema', {
      modulo: 'habitaciones',
      expedienteId: expediente._id,
      habitacionId: habitacionId,
      detalles: { nombre, tipo }
    });

    // Actualizar el expediente
    await Expediente.findByIdAndUpdate(expediente._id, {
      estado: 'en_cuarentena',
      habitacionId: habitacionId,
      fechaAsignacion: new Date(),
      $push: {
        historialEstados: {
          estado: 'en_cuarentena',
          fecha: new Date(),
          observacion: `Habitación ${habitacionId} asignada`
        }
      }
    });
    console.log(`✅ Expediente ${expediente._id} actualizado a en_cuarentena`);
    
    res.json({
      success: true,
      data: {
        id: habitacionId,
        nombre: nombre,
        tipo: tipo,
        estado: 'activa',
        fechaCreacion: savedHabitacion.fechaCreacion
      }
    });
  } catch (error) {
    console.error('❌ Error en POST:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== DESTRUIR HABITACIÓN ====================
router.delete('/habitaciones/:id/destruir', async (req, res) => {
  console.log('📩 [ROUTER] DELETE /aislamiento/habitaciones/:id/destruir');
  console.log('📦 ID recibido:', req.params.id);
  
  try {
    const habitacionId = req.params.id;
    
    const habitacion = await Habitacion.findOne({ habitacionId: habitacionId });
    
    if (!habitacion) {
      console.log('⚠️ No se encontró la habitación en MongoDB');
      return res.status(404).json({
        success: false,
        error: 'Habitación no encontrada'
      });
    }
    
    const expediente = await Expediente.findById(habitacion.expedienteId);
    
    if (expediente) {
      console.log(`🔍 Expediente encontrado: ${expediente._id}, estado actual: ${expediente.estado}`);
      
      await Expediente.findByIdAndUpdate(expediente._id, {
        estado: 'pendiente',
        habitacionId: null,
        fechaLiberacion: new Date(),
        $push: {
          historialEstados: {
            estado: 'pendiente',
            fecha: new Date(),
            observacion: `Habitación ${habitacionId} liberada`
          }
        }
      });
      console.log(`✅ Expediente ${expediente._id} liberado (cambiado a pendiente)`);
    }
    
    await Habitacion.findOneAndUpdate(
      { habitacionId: habitacionId },
      { 
        estado: 'destruida',
        fechaDestruccion: new Date(),
        $push: {
          historialAcciones: {
            accion: 'destruccion',
            fecha: new Date(),
            detalles: { motivo: 'Eliminación manual' }
          }
        }
      }
    );
    console.log(`✅ Habitación ${habitacionId} marcada como destruida en MongoDB`);
    
    // 🔥 REGISTRAR EVENTO DE AUDITORÍA
    await auditoriaService.registrarEvento('destruccion_habitacion', req.user?.username || 'sistema', {
      modulo: 'habitaciones',
      expedienteId: expediente?._id,
      habitacionId: habitacionId
    });
    
    // Cerrar sesión SSH si estaba activa
    try {
      if (expediente) {
        await sshManager.cerrarSesion(expediente._id.toString());
        console.log(`✅ Sesión SSH cerrada para expediente ${expediente._id}`);
      }
    } catch (sshError) {
      console.log('⚠️ Error cerrando sesión SSH:', sshError.message);
    }
    
    res.json({
      success: true,
      data: {
        expedienteLiberado: expediente ? true : false,
        habitacionId: habitacionId,
        mensaje: 'Habitación destruida correctamente'
      }
    });
  } catch (error) {
    console.error('❌ Error en DELETE:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== VALIDAR CONFIGURACIÓN ====================
router.post('/habitaciones/validar', async (req, res) => {
  console.log('📩 [ROUTER] POST /aislamiento/habitaciones/validar recibido');
  
  try {
    const { tipo, configuracion } = req.body;
    const validacion = await habitacionValidator.validarConfiguracion(tipo, configuracion);
    res.json({
      success: true,
      data: validacion
    });
  } catch (error) {
    console.error('❌ Error en POST /habitaciones/validar:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== SSH ENDPOINTS ====================

// Iniciar sesión SSH
router.post('/habitaciones/:id/ssh/iniciar', async (req, res) => {
  try {
    const { id } = req.params;
    const { nivel = 'basico' } = req.body;
    
    const habitacion = await Habitacion.findOne({ habitacionId: id, estado: 'activa' })
      .populate('expedienteId');
    
    if (!habitacion) {
      return res.status(404).json({ success: false, error: 'Habitación activa no encontrada' });
    }
    
    const expediente = habitacion.expedienteId;
    const servidorIp = expediente.servidor?.ip;
    const usuario = expediente.servidor?.usuario || 'root';
    const puerto = expediente.servidor?.puerto || 22;
    const contrasena = expediente.servidor?.password;
    
    if (!servidorIp) {
      return res.status(400).json({ success: false, error: 'El expediente no tiene IP' });
    }
    
    if (!contrasena) {
      return res.status(400).json({ success: false, error: 'El expediente no tiene contraseña' });
    }
    
    console.log(`🔐 Conectando a ${usuario}@${servidorIp}:${puerto}`);
    
    const namespaceId = `ns-expediente-${expediente._id}`;
    
    const resultado = await sshManager.iniciarSesion(
      expediente._id.toString(),
      namespaceId,
      servidorIp,
      usuario,
      puerto,
      contrasena
    );
    
    // 🔥 REGISTRAR EVENTO DE AUDITORÍA
    if (resultado.success) {
      await auditoriaService.registrarEvento('cierre_puerta', req.user?.username || 'sistema', {
        modulo: 'habitaciones',
        expedienteId: expediente._id,
        habitacionId: id,
        detalles: { servidorIp, usuario }
      });
    }
    
    res.json(resultado);
  } catch (error) {
    console.error('❌ Error en SSH iniciar:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ejecutar comando SSH
router.post('/habitaciones/:id/ssh/comando', async (req, res) => {
  console.log('📩 [ROUTER] POST /aislamiento/habitaciones/:id/ssh/comando');
  console.log('📦 Comando:', req.body.comando);
  
  try {
    const { id } = req.params;
    const { comando, nivel = 'basico' } = req.body;
    
    if (!comando) {
      return res.status(400).json({ success: false, error: 'Comando es requerido' });
    }
    
    const habitacion = await Habitacion.findOne({ habitacionId: id, estado: 'activa' });
    if (!habitacion) {
      return res.status(404).json({ success: false, error: 'Habitación activa no encontrada' });
    }
    
    const resultado = await sshManager.ejecutarComandoSeguro(
      habitacion.expedienteId.toString(),
      comando,
      nivel
    );
    
    await Habitacion.findOneAndUpdate(
      { habitacionId: id },
      {
        $push: {
          historialAcciones: {
            accion: 'comando_ssh',
            fecha: new Date(),
            detalles: { comando, resultado: resultado.success }
          }
        }
      }
    );
    
    res.json(resultado);
  } catch (error) {
    console.error('❌ Error en SSH comando:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Estado de sesión SSH
router.get('/habitaciones/:id/ssh/estado', async (req, res) => {
  try {
    const { id } = req.params;
    
    const habitacion = await Habitacion.findOne({ habitacionId: id });
    if (!habitacion) {
      return res.status(404).json({ success: false, error: 'Habitación no encontrada' });
    }
    
    const resultado = await sshManager.estadoSesion(habitacion.expedienteId.toString());
    res.json(resultado);
  } catch (error) {
    console.error('❌ Error en SSH estado:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Registrar resultado del cierre de puerta
router.post('/habitaciones/:id/registrar-cierre', async (req, res) => {
  try {
    const { id } = req.params;
    const { exitoso, errores } = req.body;
    
    const habitacion = await Habitacion.findOne({ habitacionId: id });
    if (!habitacion) {
      return res.status(404).json({ success: false, error: 'Habitación no encontrada' });
    }
    
    await Expediente.findByIdAndUpdate(habitacion.expedienteId, {
      'cierrePuerta.fecha': new Date(),
      'cierrePuerta.exitoso': exitoso,
      'cierrePuerta.errores': errores || []
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== DIAGNÓSTICO ====================

// Importar servicio de diagnóstico
const DiagnosticoService = require('../diagnostico/DiagnosticoService');

// Crear instancia del servicio
const diagnosticoService = new DiagnosticoService(sshManager);

// Obtener diagnóstico guardado
router.get('/habitaciones/:id/diagnostico', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📊 Obteniendo diagnóstico para habitación ${id}`);
    
    const habitacion = await Habitacion.findOne({ habitacionId: id });
    if (!habitacion) {
      return res.status(404).json({ success: false, error: 'Habitación no encontrada' });
    }
    
    const expediente = await Expediente.findById(habitacion.expedienteId);
    
    res.json({ success: true, data: expediente?.diagnostico || null });
  } catch (error) {
    console.error('❌ Error obteniendo diagnóstico:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ejecutar diagnóstico
router.post('/habitaciones/:id/diagnostico', async (req, res) => {
  try {
    const { id } = req.params;
    
    const habitacion = await Habitacion.findOne({ habitacionId: id, estado: 'activa' });
    if (!habitacion) {
      return res.status(404).json({ success: false, error: 'Habitación activa no encontrada' });
    }
    
    console.log(`🔬 Ejecutando diagnóstico para habitación ${id}`);
    
    const resultado = await diagnosticoService.ejecutarDiagnostico(habitacion.expedienteId.toString());
    
    // Guardar en el expediente
    await Expediente.findByIdAndUpdate(habitacion.expedienteId, {
      diagnostico: resultado
    });
    
    // 🔥 REGISTRAR EVENTO DE AUDITORÍA
    await auditoriaService.registrarEvento('diagnostico', req.user?.username || 'sistema', {
      modulo: 'habitaciones',
      expedienteId: habitacion.expedienteId,
      habitacionId: id,
      detalles: { score: resultado.score, alertas: resultado.alertas?.length || 0 }
    });
    
    res.json({ success: true, data: resultado });
  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== DIAGNÓSTICO GENERAL ====================
router.get('/diagnostico', async (req, res) => {
  try {
    const expedientes = await Expediente.find();
    const habitaciones = await Habitacion.find();
    
    const enCuarentena = expedientes.filter(e => e.estado === 'en_cuarentena');
    const conHabitacion = expedientes.filter(e => e.habitacionId && e.habitacionId !== null);
    const huerfanos = expedientes.filter(e => e.estado === 'en_cuarentena' && (!e.habitacionId || e.habitacionId === null));
    
    const habitacionesActivas = habitaciones.filter(h => h.estado === 'activa');
    const habitacionesDestruidas = habitaciones.filter(h => h.estado === 'destruida');
    
    res.json({
      success: true,
      data: {
        totalExpedientes: expedientes.length,
        enCuarentena: enCuarentena.length,
        conHabitacion: conHabitacion.length,
        sinHabitacion: expedientes.filter(e => !e.habitacionId).length,
        huerfanos: huerfanos.length,
        totalHabitaciones: habitaciones.length,
        habitacionesActivas: habitacionesActivas.length,
        habitacionesDestruidas: habitacionesDestruidas.length
      }
    });
  } catch (error) {
    console.error('Error en diagnóstico:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== LIMPIAR TODO ====================
router.post('/limpiar-todo', async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DESTRUCTIVE_ROUTES !== 'true') {
    return res.status(403).json({
      success: false,
      error: 'No permitido en producción'
    });
  }

  const claveEsperada = process.env.CENTINELA_DANGER_KEY || 'borrar_todo_confirma';
  const clave = req.body?.clave;
  if (clave !== claveEsperada) {
    return res.status(401).json({
      success: false,
      error: 'Clave de confirmación incorrecta'
    });
  }

  try {
    await Habitacion.deleteMany({});
    await Expediente.updateMany(
      {},
      { $set: { estado: 'pendiente', habitacionId: null, fechaAsignacion: null, fechaLiberacion: null } }
    );
    if (habitacionBuilder.habitacionesCreadas) {
      habitacionBuilder.habitacionesCreadas.clear();
    }
    res.json({ success: true, mensaje: 'Todo limpiado correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== OBTENER HABITACIÓN POR ID ====================
router.get('/habitaciones/:id', async (req, res) => {
  try {
    const habitacion = await Habitacion.findOne({ habitacionId: req.params.id })
      .populate('expedienteId', 'nombre descripcion servidor');
    
    if (!habitacion) {
      return res.status(404).json({
        success: false,
        error: 'Habitación no encontrada'
      });
    }
    
    res.json({
      success: true,
      data: habitacion
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== OBTENER TODOS LOS EXPEDIENTES ====================
router.get('/expedientes', async (req, res) => {
  try {
    const expedientes = await Expediente.find();
    res.json({
      success: true,
      data: expedientes.map(e => ({
        id: e._id,
        nombre: e.nombre,
        estado: e.estado,
        habitacionId: e.habitacionId,
        servidor: e.servidor
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;