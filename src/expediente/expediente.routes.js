const express = require('express');
const router = express.Router();
const ExpedienteController = require('./ExpedienteController/ExpedienteController');
const ExpedienteService = require('./ExpedienteService/ExpedienteService');
const ExpedienteRepository = require('./ExpedienteRepository/ExpedienteRepository');

// ============ INSTANCIAR DEPENDENCIAS ============
const expedienteRepository = new ExpedienteRepository();
const expedienteService = new ExpedienteService();
const expedienteController = new ExpedienteController();

// Inyectar dependencias
expedienteService.setRepository(expedienteRepository);
expedienteController.setExpedienteService(expedienteService);

// ============ RUTAS DE EXPEDIENTES (CRUD básico) ============

// Obtener todos los expedientes (con filtros opcionales)
router.get('/', (req, res) => {
  console.log("📩 [ROUTER] GET /expedientes recibido");
  expedienteController.getAllExpedientes(req, res);
});

// Obtener un expediente por ID
router.get('/:id', (req, res) => {
  expedienteController.getExpedienteById(req, res);
});

// Crear un nuevo expediente
router.post('/', (req, res) => {
  console.log("📩 [ROUTER] POST /expedientes recibido");
  expedienteController.createExpediente(req, res);
});

// Actualizar un expediente
router.put('/:id', (req, res) => {
  expedienteController.updateExpediente(req, res);
});

// Eliminar un expediente
router.delete('/:id', (req, res) => {
  expedienteController.deleteExpediente(req, res);
});

// ============ RUTAS DE ASIGNACIÓN Y ESTADO ============

// Asignar habitación a un expediente
router.post('/:id/asignar-habitacion', (req, res) => {
  expedienteController.asignarHabitacion(req, res);
});

// Cambiar estado de un expediente
router.put('/:id/estado', (req, res) => {
  expedienteController.cambiarEstado(req, res);
});

// Liberar habitación de un expediente
router.post('/:id/liberar-habitacion', (req, res) => {
  expedienteController.liberarHabitacion(req, res);
});

// ============ NUEVAS RUTAS PARA MÉTRICAS ============

// Registrar una nueva métrica
router.post('/metricas', (req, res) => {
  console.log("📩 [ROUTER] POST /expedientes/metricas recibido");
  expedienteController.registrarMetrica(req, res);
});

// Obtener métricas de un expediente
router.get('/:expedienteId/metricas', (req, res) => {
  expedienteController.obtenerMetricas(req, res);
});

// Obtener la última métrica de un tipo específico
router.get('/:expedienteId/metricas/:tipo/ultima', (req, res) => {
  expedienteController.obtenerUltimaMetrica(req, res);
});

// ============ NUEVAS RUTAS PARA ALERTAS ============

// Registrar una nueva alerta
router.post('/alertas', (req, res) => {
  console.log("📩 [ROUTER] POST /expedientes/alertas recibido");
  expedienteController.registrarAlerta(req, res);
});

// Obtener alertas de un expediente
router.get('/:expedienteId/alertas', (req, res) => {
  expedienteController.obtenerAlertas(req, res);
});

// Resolver una alerta
router.put('/alertas/:alertaId/resolver', (req, res) => {
  expedienteController.resolverAlerta(req, res);
});

// ============ NUEVAS RUTAS PARA PREDICCIONES ============

// Registrar una nueva predicción
router.post('/predicciones', (req, res) => {
  console.log("📩 [ROUTER] POST /expedientes/predicciones recibido");
  expedienteController.registrarPrediccion(req, res);
});

// Obtener predicciones activas de un expediente
router.get('/:expedienteId/predicciones/activas', (req, res) => {
  expedienteController.obtenerPrediccionesActivas(req, res);
});

// Evaluar predicciones vencidas
router.post('/predicciones/evaluar', (req, res) => {
  console.log("📩 [ROUTER] POST /expedientes/predicciones/evaluar recibido");
  expedienteController.evaluarPredicciones(req, res);
});

module.exports = router;