const express = require('express');
const router = express.Router();
const UnidadOrganizativa = require('../expediente/models/Organizacion');
const Expediente = require('../expediente/models/Expediente');

// Obtener todas las OU de un cliente
router.get('/cliente/:clienteId', async (req, res) => {
  try {
    const unidades = await UnidadOrganizativa.find({ clienteId: req.params.clienteId });
    res.json({ success: true, data: unidades });
  } catch (error) {
    console.error('Error obteniendo OU:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener una OU por ID con sus usuarios
router.get('/:id', async (req, res) => {
  try {
    const unidad = await UnidadOrganizativa.findById(req.params.id);
    if (!unidad) {
      return res.status(404).json({ success: false, error: 'OU no encontrada' });
    }
    res.json({ success: true, data: unidad });
  } catch (error) {
    console.error('Error obteniendo OU:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear nueva OU
router.post('/', async (req, res) => {
  try {
    const unidad = new UnidadOrganizativa(req.body);
    await unidad.save();
    res.json({ success: true, data: unidad });
  } catch (error) {
    console.error('Error creando OU:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar OU
router.put('/:id', async (req, res) => {
  try {
    const unidad = await UnidadOrganizativa.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: unidad });
  } catch (error) {
    console.error('Error actualizando OU:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar OU
router.delete('/:id', async (req, res) => {
  try {
    await UnidadOrganizativa.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'OU eliminada' });
  } catch (error) {
    console.error('Error eliminando OU:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Añadir usuario a OU
router.post('/:id/usuarios', async (req, res) => {
  try {
    const unidad = await UnidadOrganizativa.findById(req.params.id);
    if (!unidad) {
      return res.status(404).json({ success: false, error: 'OU no encontrada' });
    }
    unidad.usuarios.push(req.body);
    await unidad.save();
    res.json({ success: true, data: unidad });
  } catch (error) {
    console.error('Error añadiendo usuario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar usuario de OU
router.delete('/:id/usuarios/:usuarioId', async (req, res) => {
  try {
    const unidad = await UnidadOrganizativa.findById(req.params.id);
    if (!unidad) {
      return res.status(404).json({ success: false, error: 'OU no encontrada' });
    }
    unidad.usuarios = unidad.usuarios.filter(u => u._id.toString() !== req.params.usuarioId);
    await unidad.save();
    res.json({ success: true, data: unidad });
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Estadísticas de OU por cliente
router.get('/cliente/:clienteId/estadisticas', async (req, res) => {
  try {
    const unidades = await UnidadOrganizativa.find({ clienteId: req.params.clienteId });
    const totalUsuarios = unidades.reduce((sum, u) => sum + u.usuarios.length, 0);
    res.json({ 
      success: true, 
      data: { 
        totalUnidades: unidades.length, 
        totalUsuarios,
        unidades 
      } 
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;