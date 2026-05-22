const express = require('express');
const router = express.Router();
const arquitecturaService = require('./arquitecturaService');

// Generar propuesta de arquitectura
router.post('/generar', async (req, res) => {
  try {
    const { respuestas } = req.body;
    const propuesta = arquitecturaService.generarPropuesta(respuestas);
    res.json({ success: true, data: propuesta });
  } catch (error) {
    console.error('Error generando propuesta:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener packs disponibles
router.get('/packs', async (req, res) => {
  try {
    const packs = [
      { key: 'pack_web', nombre: '🌐 Pack Web', descripcion: 'Servidor web, base de datos y caché' },
      { key: 'pack_dominio', nombre: '🏢 Pack Dominio', descripcion: 'Controlador de dominio, DNS, DHCP, Samba' },
      { key: 'pack_cortafuegos', nombre: '🛡️ Pack Cortafuegos', descripcion: 'Firewall, iptables, fail2ban' },
      { key: 'pack_correo', nombre: '📧 Pack Correo', descripcion: 'Servidor de correo, antispam, antivirus' },
      { key: 'pack_monitoreo', nombre: '📊 Pack Monitoreo', descripcion: 'Métricas, alertas, dashboards' }
    ];
    res.json({ success: true, data: packs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;