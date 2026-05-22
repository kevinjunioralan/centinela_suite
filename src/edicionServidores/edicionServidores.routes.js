const express = require('express');
const router = express.Router();
const Expediente = require('../expediente/models/Expediente');
const AuditoriaService = require('../auditoria/AuditoriaService');

const auditoriaService = new AuditoriaService();

const PACK_EDIT_SCHEMA = {
  pack_correo: {
    title: 'Edicion de Servidor de Correo',
    fields: [
      { key: 'dominio', label: 'Dominio principal', type: 'text', required: true },
      { key: 'postfix.puertoSmtp', label: 'Puerto SMTP', type: 'number', required: true },
      { key: 'dovecot.puertoImap', label: 'Puerto IMAP', type: 'number', required: true }
    ],
    collections: [
      {
        key: 'buzones',
        label: 'Buzones',
        addEndpoint: 'pack-correo/buzones',
        fields: [
          { key: 'correo', label: 'Correo', type: 'email', required: true },
          { key: 'nombre', label: 'Nombre', type: 'text', required: true },
          { key: 'cuotaMb', label: 'Cuota (MB)', type: 'number', required: false }
        ]
      }
    ]
  },
  pack_dominio: {
    title: 'Edicion de Servidor de Dominio',
    fields: [
      { key: 'dominio', label: 'Dominio', type: 'text', required: true },
      { key: 'dhcp.rangoInicio', label: 'Rango DHCP inicio', type: 'text', required: true },
      { key: 'dhcp.rangoFin', label: 'Rango DHCP fin', type: 'text', required: true }
    ],
    collections: [
      {
        key: 'ous',
        label: 'Unidades organizativas',
        addEndpoint: 'pack-dominio/ous',
        fields: [
          { key: 'nombre', label: 'Nombre OU', type: 'text', required: true },
          { key: 'descripcion', label: 'Descripcion', type: 'text', required: false }
        ]
      },
      {
        key: 'clientesDominio',
        label: 'Clientes de dominio',
        addEndpoint: 'pack-dominio/clientes',
        fields: [
          { key: 'nombreEquipo', label: 'Nombre equipo', type: 'text', required: true },
          { key: 'usuario', label: 'Usuario principal', type: 'text', required: true },
          { key: 'ou', label: 'OU', type: 'text', required: false }
        ]
      }
    ]
  },
  pack_web: {
    title: 'Edicion de Servidor Web',
    fields: [
      { key: 'dominio', label: 'Dominio', type: 'text', required: true },
      { key: 'nginx.puertoHttp', label: 'Puerto HTTP', type: 'number', required: true },
      { key: 'postgresql.baseDatosInicial', label: 'Base de datos inicial', type: 'text', required: true }
    ],
    collections: []
  },
  pack_monitoreo: {
    title: 'Edicion de Servidor de Monitoreo',
    fields: [
      { key: 'prometheus.puerto', label: 'Puerto Prometheus', type: 'number', required: true },
      { key: 'prometheus.scrapeInterval', label: 'Scrape interval', type: 'text', required: true },
      { key: 'grafana.puerto', label: 'Puerto Grafana', type: 'number', required: true }
    ],
    collections: []
  },
  pack_cortafuegos: {
    title: 'Edicion de Servidor de Cortafuegos',
    fields: [
      { key: 'reglas.permitirHttp', label: 'Permitir HTTP', type: 'boolean', required: false },
      { key: 'reglas.permitirHttps', label: 'Permitir HTTPS', type: 'boolean', required: false },
      { key: 'fail2ban.maxIntentos', label: 'Max intentos', type: 'number', required: true }
    ],
    collections: []
  }
};

function getPackTipo(expediente) {
  return expediente?.instalacion?.packSeleccionado || expediente?.configuracion?.packTipo || null;
}

function ensureMantenimiento(expediente) {
  return expediente && expediente.origen === 'mantenimiento';
}

function deepMerge(target = {}, patch = {}) {
  const result = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(target[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function registrarEvento(expedienteId, tipo, detalles, req) {
  try {
    await auditoriaService.registrarEvento(tipo, req.user?.username || 'sistema', {
      modulo: 'edicion_servidores',
      expedienteId,
      detalles,
      ip: req.ip
    });
  } catch (_error) {
    // No bloquear edicion por fallo de auditoria.
  }
}

router.get('/servidores', async (_req, res) => {
  try {
    const expedientes = await Expediente.find({ origen: 'mantenimiento' })
      .select('nombre servidor.ip mantenimiento.estadoCustodia instalacion.packSeleccionado configuracion.packTipo configuracion.valores')
      .lean();

    const data = expedientes
      .map((exp) => {
        const packTipo = getPackTipo(exp);
        return {
          _id: exp._id,
          nombre: exp.nombre,
          ip: exp.servidor?.ip || null,
          estadoCustodia: exp.mantenimiento?.estadoCustodia || 'pendiente',
          packTipo,
          editable: Boolean(packTipo && PACK_EDIT_SCHEMA[packTipo]),
          title: PACK_EDIT_SCHEMA[packTipo]?.title || 'Pack sin edicion guiada'
        };
      })
      .filter((exp) => exp.packTipo);

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/formulario', async (req, res) => {
  try {
    const expediente = await Expediente.findById(req.params.id)
      .select('origen nombre servidor.ip instalacion.packSeleccionado configuracion.packTipo configuracion.valores mantenimiento.estadoCustodia')
      .lean();

    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }

    if (!ensureMantenimiento(expediente)) {
      return res.status(400).json({ success: false, error: 'El expediente no esta en mantenimiento' });
    }

    const packTipo = getPackTipo(expediente);
    const schema = PACK_EDIT_SCHEMA[packTipo];

    if (!packTipo || !schema) {
      return res.status(400).json({ success: false, error: 'No hay esquema de edicion para el pack instalado' });
    }

    res.json({
      success: true,
      data: {
        expediente: {
          _id: expediente._id,
          nombre: expediente.nombre,
          ip: expediente.servidor?.ip || null,
          estadoCustodia: expediente.mantenimiento?.estadoCustodia || 'pendiente'
        },
        packTipo,
        schema,
        valores: expediente.configuracion?.valores || {}
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id/configuracion', async (req, res) => {
  try {
    const { patch } = req.body;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ success: false, error: 'patch(object) es requerido' });
    }

    const expediente = await Expediente.findById(req.params.id);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }

    if (!ensureMantenimiento(expediente)) {
      return res.status(400).json({ success: false, error: 'El expediente no esta en mantenimiento' });
    }

    const packTipo = getPackTipo(expediente);
    if (!packTipo || !PACK_EDIT_SCHEMA[packTipo]) {
      return res.status(400).json({ success: false, error: 'No hay esquema de edicion para el pack instalado' });
    }

    const valoresActuales = expediente.configuracion?.valores || {};
    const valoresMerged = deepMerge(valoresActuales, patch);

    expediente.configuracion = {
      packTipo,
      valores: valoresMerged,
      completada: true,
      fecha: new Date()
    };

    await expediente.save();
    await registrarEvento(expediente._id, 'edicion_configuracion_pack', { packTipo, patch }, req);

    res.json({ success: true, data: { packTipo, valores: expediente.configuracion.valores } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/pack-correo/buzones', async (req, res) => {
  try {
    const { correo, nombre, cuotaMb } = req.body;
    if (!correo || !nombre) {
      return res.status(400).json({ success: false, error: 'correo y nombre son requeridos' });
    }

    const expediente = await Expediente.findById(req.params.id);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }

    const packTipo = getPackTipo(expediente);
    if (packTipo !== 'pack_correo') {
      return res.status(400).json({ success: false, error: 'El servidor no tiene pack_correo' });
    }

    const valores = expediente.configuracion?.valores || {};
    const buzones = Array.isArray(valores.buzones) ? valores.buzones : [];

    if (buzones.some((item) => item.correo?.toLowerCase() === String(correo).toLowerCase())) {
      return res.status(400).json({ success: false, error: 'El buzon ya existe' });
    }

    buzones.push({
      correo,
      nombre,
      cuotaMb: Number.isFinite(Number(cuotaMb)) ? Number(cuotaMb) : null,
      creadoEn: new Date().toISOString()
    });

    expediente.configuracion = {
      packTipo,
      valores: { ...valores, buzones },
      completada: true,
      fecha: new Date()
    };

    await expediente.save();
    await registrarEvento(expediente._id, 'agregar_buzon_correo', { correo, nombre }, req);

    res.json({ success: true, data: { buzones } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/pack-dominio/ous', async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    if (!nombre) {
      return res.status(400).json({ success: false, error: 'nombre es requerido' });
    }

    const expediente = await Expediente.findById(req.params.id);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }

    const packTipo = getPackTipo(expediente);
    if (packTipo !== 'pack_dominio') {
      return res.status(400).json({ success: false, error: 'El servidor no tiene pack_dominio' });
    }

    const valores = expediente.configuracion?.valores || {};
    const ous = Array.isArray(valores.ous) ? valores.ous : [];

    if (ous.some((item) => item.nombre?.toLowerCase() === String(nombre).toLowerCase())) {
      return res.status(400).json({ success: false, error: 'La OU ya existe' });
    }

    ous.push({ nombre, descripcion: descripcion || '', creadaEn: new Date().toISOString() });

    expediente.configuracion = {
      packTipo,
      valores: { ...valores, ous },
      completada: true,
      fecha: new Date()
    };

    await expediente.save();
    await registrarEvento(expediente._id, 'agregar_ou_dominio', { nombre }, req);

    res.json({ success: true, data: { ous } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/pack-dominio/clientes', async (req, res) => {
  try {
    const { nombreEquipo, usuario, ou } = req.body;
    if (!nombreEquipo || !usuario) {
      return res.status(400).json({ success: false, error: 'nombreEquipo y usuario son requeridos' });
    }

    const expediente = await Expediente.findById(req.params.id);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }

    const packTipo = getPackTipo(expediente);
    if (packTipo !== 'pack_dominio') {
      return res.status(400).json({ success: false, error: 'El servidor no tiene pack_dominio' });
    }

    const valores = expediente.configuracion?.valores || {};
    const clientesDominio = Array.isArray(valores.clientesDominio) ? valores.clientesDominio : [];

    if (clientesDominio.some((item) => item.nombreEquipo?.toLowerCase() === String(nombreEquipo).toLowerCase())) {
      return res.status(400).json({ success: false, error: 'El cliente de dominio ya existe' });
    }

    clientesDominio.push({
      nombreEquipo,
      usuario,
      ou: ou || null,
      creadoEn: new Date().toISOString()
    });

    expediente.configuracion = {
      packTipo,
      valores: { ...valores, clientesDominio },
      completada: true,
      fecha: new Date()
    };

    await expediente.save();
    await registrarEvento(expediente._id, 'agregar_cliente_dominio', { nombreEquipo, usuario, ou: ou || null }, req);

    res.json({ success: true, data: { clientesDominio } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
