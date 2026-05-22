const express = require('express');
const router = express.Router();
const Red = require('../expediente/models/Red');
const Expediente = require('../expediente/models/Expediente');

// Obtener todas las redes de un cliente
router.get('/cliente/:clienteId', async (req, res) => {
  try {
    const redes = await Red.find({ clienteId: req.params.clienteId });
    res.json({ success: true, data: redes });
  } catch (error) {
    console.error('Error obteniendo redes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener una red por ID con sus servidores
router.get('/:id', async (req, res) => {
  try {
    const red = await Red.findById(req.params.id);
    if (!red) {
      return res.status(404).json({ success: false, error: 'Red no encontrada' });
    }
    
    // Servidores en esta red
    const servidores = await Expediente.find({ 
      clienteId: red.clienteId,
      'servidor.ip': { $regex: `^${red.direccionRed.replace('.0', '.')}` }
    });
    
    res.json({ success: true, data: { red, servidores } });
  } catch (error) {
    console.error('Error obteniendo red:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear nueva red
router.post('/', async (req, res) => {
  try {
    const red = new Red(req.body);
    await red.save();
    res.json({ success: true, data: red });
  } catch (error) {
    console.error('Error creando red:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar red
router.put('/:id', async (req, res) => {
  try {
    const red = await Red.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: red });
  } catch (error) {
    console.error('Error actualizando red:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar red
router.delete('/:id', async (req, res) => {
  try {
    await Red.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Red eliminada' });
  } catch (error) {
    console.error('Error eliminando red:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Asignar servidor a una red (actualizar IP)
router.put('/:id/asignar-ip', async (req, res) => {
  try {
    const { servidorId, ip } = req.body;
    const red = await Red.findById(req.params.id);
    
    if (!red) {
      return res.status(404).json({ success: false, error: 'Red no encontrada' });
    }
    
    // Verificar que la IP está en el rango de la red
    const redBase = red.direccionRed.split('.')[0];
    const ipBase = ip.split('.')[0];
    
    if (redBase !== ipBase) {
      return res.status(400).json({ 
        success: false, 
        error: `La IP ${ip} no pertenece a la red ${red.direccionRed}` 
      });
    }
    
    const expediente = await Expediente.findByIdAndUpdate(
      servidorId,
      { 'servidor.ip': ip },
      { new: true }
    );
    
    res.json({ success: true, data: expediente });
  } catch (error) {
    console.error('Error asignando IP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;