const express = require('express');
const router = express.Router();

const HabitacionController = require('../habitaciones/HabitacionController');
const PruebasController = require('../pruebas/PruebasController/PruebasController');
const EventosController = require('../eventos/EventosController');
const PatronesController = require('../patrones/PatronesController');
const InformesController = require('../informes/InformesController');

// Instantiate controllers
const habitacionController = new HabitacionController();
const pruebasController = new PruebasController();
const eventosController = new EventosController();
const patronesController = new PatronesController();
const informesController = new InformesController();

// ------------------------------
// HABITACIONES
// ------------------------------
router.post('/habitaciones', (req, res) => habitacionController.crearHabitacion(req, res));
router.get('/habitaciones/:id', (req, res) => habitacionController.obtenerHabitacion(req, res));
router.delete('/habitaciones/:id/destruir', (req, res) => habitacionController.destruirHabitacion(req, res));

// ------------------------------
// PRUEBAS
// ------------------------------
router.post('/pruebas/ejecutar', (req, res) => pruebasController.ejecutarPruebas(req, res));
router.get('/pruebas/:id', (req, res) => pruebasController.obtenerPrueba(req, res));

// ------------------------------
// EVENTOS
// ------------------------------
router.get('/eventos/:id', (req, res) => eventosController.obtenerEventos(req, res));

// ------------------------------
// PATRONES
// ------------------------------
router.get('/patrones/:id', (req, res) => patronesController.obtenerPatrones(req, res));

// ------------------------------
// INFORMES
// ------------------------------
router.get('/informes/:id', (req, res) => informesController.obtenerInforme(req, res));

module.exports = router;
