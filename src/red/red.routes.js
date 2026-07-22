const express = require('express');
const router = express.Router();
const Red = require('../expediente/models/Red');
const Expediente = require('../expediente/models/Expediente');
const Cliente = require('../expediente/models/Cliente');
const RedDisenoOrganizacion = require('./models/RedDisenoOrganizacion');
const HardwareItem = require('../hardware/models/HardwareItem');

function toNonNegativeInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return Math.floor(num);
}

function normalizeNecesidades(input = {}) {
  return {
    usuarios: toNonNegativeInt(input.usuarios),
    pcs: toNonNegativeInt(input.pcs),
    impresoras: toNonNegativeInt(input.impresoras),
    vms: toNonNegativeInt(input.vms),
    switches: toNonNegativeInt(input.switches),
    routers: toNonNegativeInt(input.routers),
    apsWifi: toNonNegativeInt(input.apsWifi)
  };
}

function normalizeAreas(inputAreas = []) {
  if (!Array.isArray(inputAreas)) {
    return [];
  }

  return inputAreas
    .map((item) => ({
      nombre: String(item?.nombre || '').trim(),
      usuarios: toNonNegativeInt(item?.usuarios),
      pcs: toNonNegativeInt(item?.pcs),
      impresoras: toNonNegativeInt(item?.impresoras),
      vms: toNonNegativeInt(item?.vms),
      criticidad: ['baja', 'media', 'alta'].includes(item?.criticidad) ? item.criticidad : 'media'
    }))
    .filter((item) => item.nombre.length > 0)
    .slice(0, 50);
}

function ipToInt(ip) {
  const parts = String(ip || '').split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return null;
  }

  return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0);
}

function intToIp(intValue) {
  const value = intValue >>> 0;
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255
  ].join('.');
}

function hostsToPrefix(hosts) {
  const needed = Math.max(2, toNonNegativeInt(hosts));
  for (let prefix = 30; prefix >= 16; prefix -= 1) {
    const capacity = (2 ** (32 - prefix)) - 2;
    if (capacity >= needed) {
      return prefix;
    }
  }
  return 16;
}

function alignAddress(addressInt, prefix) {
  const blockSize = 2 ** (32 - prefix);
  return Math.floor(addressInt / blockSize) * blockSize;
}

function estimateHostsForArea(area) {
  return (
    toNonNegativeInt(area.usuarios) +
    toNonNegativeInt(area.pcs) +
    toNonNegativeInt(area.impresoras) +
    toNonNegativeInt(area.vms) +
    4
  );
}

function criticidadPeso(criticidad) {
  if (criticidad === 'alta') return 3;
  if (criticidad === 'media') return 2;
  return 1;
}

function buildPropuestaFromDiseno(diseno) {
  const baseIp = '10.20.0.0';
  let nextAddress = ipToInt(baseIp);
  const necesidades = normalizeNecesidades(diseno?.necesidades || {});
  let areas = normalizeAreas(diseno?.areas || []);

  if (!areas.length) {
    areas = [{
      nombre: 'General',
      usuarios: necesidades.usuarios,
      pcs: necesidades.pcs,
      impresoras: necesidades.impresoras,
      vms: necesidades.vms,
      criticidad: 'media'
    }];
  }

  const areasOrdenadas = [...areas].sort((a, b) => {
    const peso = criticidadPeso(b.criticidad) - criticidadPeso(a.criticidad);
    if (peso !== 0) return peso;
    return estimateHostsForArea(b) - estimateHostsForArea(a);
  });

  const subredes = areasOrdenadas.map((area, index) => {
    const hostsEstimados = estimateHostsForArea(area);
    const prefix = hostsToPrefix(hostsEstimados);
    const blockSize = 2 ** (32 - prefix);
    let networkAddress = alignAddress(nextAddress, prefix);
    if (networkAddress < nextAddress) {
      networkAddress += blockSize;
    }
    const gatewayInt = networkAddress + 1;
    const dhcpInicio = networkAddress + 20;
    const dhcpFin = networkAddress + blockSize - 10;

    nextAddress = networkAddress + blockSize;

    return {
      area: area.nombre,
      criticidad: area.criticidad,
      hostsEstimados,
      vlanId: 10 + index,
      red: intToIp(networkAddress),
      prefijo: prefix,
      mascara: intToIp((0xffffffff << (32 - prefix)) >>> 0),
      gateway: intToIp(gatewayInt),
      dhcp: {
        inicio: intToIp(dhcpInicio),
        fin: intToIp(dhcpFin)
      }
    };
  });

  return {
    resumen: {
      totalSubredes: subredes.length,
      totalHostsEstimados: subredes.reduce((acc, s) => acc + s.hostsEstimados, 0),
      dnsSugeridos: ['8.8.8.8', '1.1.1.1'],
      baseCalculo: baseIp
    },
    subredes,
    generadoEn: new Date().toISOString(),
    version: 'v1'
  };
}

function normalizeRedText(value) {
  return String(value || '').trim().toLowerCase();
}

function buildRedNombre(subred) {
  return `${subred.area} VLAN ${subred.vlanId}`;
}

function getPackTipo(expediente) {
  return expediente?.instalacion?.packSeleccionado || expediente?.configuracion?.packTipo || null;
}

function buildProposalSnapshot(propuesta, origen = 'calculo_manual') {
  return {
    version: propuesta.version,
    generadoEn: propuesta.generadoEn,
    origen,
    resumen: propuesta.resumen,
    subredes: propuesta.subredes
  };
}

async function persistProposalSnapshot(clienteId, propuesta, origen = 'calculo_manual') {
  const snapshot = buildProposalSnapshot(propuesta, origen);
  await RedDisenoOrganizacion.findOneAndUpdate(
    { clienteId },
    {
      $set: { ultimaPropuesta: snapshot },
      $push: { historialPropuestas: { $each: [snapshot], $slice: -10 } }
    },
    { new: true, upsert: false }
  );
  return snapshot;
}

function buildRedFromSubred(clienteId, subred) {
  return new Red({
    clienteId,
    nombre: buildRedNombre(subred),
    tipo: 'lan',
    direccionRed: subred.red,
    mascara: subred.mascara,
    puertaEnlace: subred.gateway,
    vlanId: subred.vlanId,
    dhcp: {
      activado: true,
      rangoInicio: subred.dhcp.inicio,
      rangoFin: subred.dhcp.fin,
      tiempoConcesion: 86400
    },
    descripcion: `Red generada automaticamente para ${subred.area} (${subred.criticidad})`,
    activa: true
  });
}

async function applyProposalToCliente({ clienteId, propuesta, apply = true, redesOverride = null }) {
  const existingRedes = Array.isArray(redesOverride)
    ? [...redesOverride]
    : await Red.find({ clienteId }).lean();

  const creadas = [];
  const omitidas = [];

  for (const subred of Array.isArray(propuesta?.subredes) ? propuesta.subredes : []) {
    const nombre = buildRedNombre(subred);
    const conflictoDireccion = existingRedes.find((red) =>
      normalizeRedText(red.direccionRed) === normalizeRedText(subred.red)
    );

    if (conflictoDireccion) {
      omitidas.push({
        area: subred.area,
        motivo: 'direccion_red_existente',
        redExistenteId: conflictoDireccion._id,
        direccionRed: conflictoDireccion.direccionRed
      });
      continue;
    }

    const conflictoNombre = existingRedes.find((red) =>
      normalizeRedText(red.nombre) === normalizeRedText(nombre)
    );

    if (conflictoNombre) {
      omitidas.push({
        area: subred.area,
        motivo: 'nombre_existente',
        redExistenteId: conflictoNombre._id,
        nombre: conflictoNombre.nombre
      });
      continue;
    }

    if (apply) {
      const nuevaRed = buildRedFromSubred(clienteId, subred);
      await nuevaRed.save();
      const redCreada = typeof nuevaRed.toObject === 'function' ? nuevaRed.toObject() : nuevaRed;
      existingRedes.push(redCreada);
      creadas.push(redCreada);
      continue;
    }

    const previewRed = {
      _id: `preview-${clienteId}-${creadas.length + 1}`,
      clienteId,
      nombre,
      tipo: 'lan',
      direccionRed: subred.red,
      mascara: subred.mascara,
      puertaEnlace: subred.gateway,
      vlanId: subred.vlanId,
      dhcp: {
        activado: true,
        rangoInicio: subred.dhcp.inicio,
        rangoFin: subred.dhcp.fin,
        tiempoConcesion: 86400
      },
      descripcion: `Red generada automaticamente para ${subred.area} (${subred.criticidad})`,
      activa: true
    };

    existingRedes.push(previewRed);
    creadas.push(previewRed);
  }

  return {
    clienteId,
    propuesta,
    redes: existingRedes,
    creadas,
    omitidas,
    resumen: {
      totalPropuestas: Array.isArray(propuesta?.subredes) ? propuesta.subredes.length : 0,
      totalCreadas: creadas.length,
      totalOmitidas: omitidas.length
    }
  };
}

async function suggestServerAssignmentsFromProposal({ clienteId, propuesta, apply = true }) {
  const subredes = Array.isArray(propuesta?.subredes) ? propuesta.subredes : [];
  if (!subredes.length) {
    return {
      propuesta,
      expedientes: [],
      asignaciones: [],
      resumen: { totalServidores: 0, totalAsignados: 0 }
    };
  }

  const expedientes = await Expediente.find({ clienteId })
    .select('_id nombre origen instalacion.packSeleccionado configuracion.packTipo configuracion.valores servidor.ip')
    .lean();

  const asignaciones = [];
  let usedIndex = 0;

  for (const expediente of expedientes) {
    const packTipo = getPackTipo(expediente);
    const subred = getSubnetForPack(packTipo, subredes, usedIndex);
    usedIndex += 1;

    if (!subred) {
      continue;
    }

    const sugerencia = {
      area: subred.area,
      red: subred.red,
      prefijo: subred.prefijo,
      vlanId: subred.vlanId,
      gateway: subred.gateway,
      criticidad: subred.criticidad,
      packTipo: packTipo || null,
      origen: 'propuesta_red_v1',
      asignadoEn: new Date().toISOString()
    };

    if (apply) {
      await Expediente.findByIdAndUpdate(expediente._id, {
        'configuracion.valores.redSugerida': sugerencia,
        'configuracion.valores.areaSugerida': subred.area
      }, { new: false });
    }

    asignaciones.push({
      expedienteId: expediente._id,
      nombre: expediente.nombre,
      packTipo: packTipo || null,
      subred
    });
  }

  const snapshot = {
    generadoEn: new Date().toISOString(),
    totalAsignados: asignaciones.length,
    asignaciones: asignaciones.slice(0, 100)
  };

  if (apply) {
    await RedDisenoOrganizacion.findOneAndUpdate(
      { clienteId },
      { $set: { ultimaAsignacionServidores: snapshot, ultimaPropuesta: propuesta } },
      { new: false }
    );
  }

  return {
    propuesta,
    expedientes,
    asignaciones,
    snapshot,
    resumen: {
      totalServidores: expedientes.length,
      totalAsignados: asignaciones.length
    }
  };
}

async function suggestIpAssignmentsFromCliente({
  clienteId,
  apply = true,
  redesOverride = null,
  expedientesOverride = null
}) {
  const redes = Array.isArray(redesOverride) ? redesOverride : await Red.find({ clienteId }).lean();
  const expedientes = Array.isArray(expedientesOverride)
    ? expedientesOverride
    : await Expediente.find({ clienteId })
      .select('_id nombre servidor.ip configuracion.valores instalacion.packSeleccionado configuracion.packTipo')
      .lean();

  const usedIpInts = new Set(
    expedientes
      .map((item) => ipToInt(item?.servidor?.ip))
      .filter((value) => value !== null)
  );

  const asignadas = [];
  const omitidas = [];

  for (const expediente of expedientes) {
    const sugerencia = expediente?.configuracion?.valores?.redSugerida || null;

    if (!sugerencia) {
      omitidas.push({ expedienteId: expediente._id, nombre: expediente.nombre, motivo: 'sin_sugerencia' });
      continue;
    }

    if (expediente?.servidor?.ip) {
      omitidas.push({ expedienteId: expediente._id, nombre: expediente.nombre, motivo: 'ip_existente', ip: expediente.servidor.ip });
      continue;
    }

    const red = findRedBySuggestion(redes, sugerencia);
    if (!red) {
      omitidas.push({ expedienteId: expediente._id, nombre: expediente.nombre, motivo: 'red_no_encontrada', red: sugerencia.red || null });
      continue;
    }

    const range = buildIpRange(red, sugerencia);
    if (!range) {
      omitidas.push({ expedienteId: expediente._id, nombre: expediente.nombre, motivo: 'dhcp_invalido', redId: red._id });
      continue;
    }

    const nextIpInt = findNextAvailableIp(range, usedIpInts);
    if (nextIpInt === null) {
      omitidas.push({ expedienteId: expediente._id, nombre: expediente.nombre, motivo: 'sin_ips_disponibles', redId: red._id });
      continue;
    }

    const ipAsignada = intToIp(nextIpInt);
    usedIpInts.add(nextIpInt);

    if (apply) {
      await Expediente.findByIdAndUpdate(expediente._id, {
        'servidor.ip': ipAsignada,
        'configuracion.valores.redSugerida.ipAsignada': ipAsignada,
        'configuracion.valores.redSugerida.estado': 'ip_asignada',
        'configuracion.valores.redSugerida.redId': red._id,
        'configuracion.valores.redSugerida.asignacionIpEn': new Date().toISOString()
      }, { new: false });
    }

    asignadas.push({
      expedienteId: expediente._id,
      nombre: expediente.nombre,
      ip: ipAsignada,
      red: red.direccionRed,
      vlanId: red.vlanId || sugerencia.vlanId || null
    });
  }

  const ipSnapshot = {
    generadoEn: new Date().toISOString(),
    totalExpedientes: expedientes.length,
    totalAsignadas: asignadas.length,
    totalOmitidas: omitidas.length,
    asignadas: asignadas.slice(0, 100),
    omitidas: omitidas.slice(0, 100)
  };

  if (apply) {
    await RedDisenoOrganizacion.findOneAndUpdate(
      { clienteId },
      {
        $set: { ultimaAplicacionIps: ipSnapshot },
        $push: { historialAplicacionesIps: { $each: [ipSnapshot], $slice: -10 } }
      },
      { new: false }
    );
  }

  return {
    clienteId,
    redes,
    expedientes,
    asignadas,
    omitidas,
    snapshot: ipSnapshot,
    resumen: {
      totalExpedientes: expedientes.length,
      totalAsignadas: asignadas.length,
      totalOmitidas: omitidas.length
    }
  };
}

function getSubnetForPack(packTipo, subredes, usedIndex) {
  if (!subredes.length) {
    return null;
  }

  const alta = subredes.find((item) => item.criticidad === 'alta') || subredes[0];
  const media = subredes.find((item) => item.criticidad === 'media') || subredes[0];
  const baja = [...subredes].reverse().find((item) => item.criticidad === 'baja') || subredes[subredes.length - 1];

  if (['pack_dominio', 'pack_cortafuegos', 'pack_seguridad', 'pack_bases_datos'].includes(packTipo)) {
    return alta;
  }

  if (['pack_web', 'pack_correo', 'pack_empresa'].includes(packTipo)) {
    return media;
  }

  if (['pack_monitoreo', 'pack_coreos'].includes(packTipo)) {
    return baja;
  }

  return subredes[usedIndex % subredes.length];
}

function findRedBySuggestion(redes, sugerencia) {
  if (!sugerencia) {
    return null;
  }

  return redes.find((red) =>
    normalizeRedText(red.direccionRed) === normalizeRedText(sugerencia.red) ||
    (Number(red.vlanId || 0) > 0 && Number(red.vlanId) === Number(sugerencia.vlanId))
  ) || null;
}

function buildIpRange(red, sugerencia) {
  const startIp = red?.dhcp?.rangoInicio || sugerencia?.dhcp?.inicio || null;
  const endIp = red?.dhcp?.rangoFin || sugerencia?.dhcp?.fin || null;
  const start = ipToInt(startIp);
  const end = ipToInt(endIp);

  if (start === null || end === null || start > end) {
    return null;
  }

  return { start, end };
}

function findNextAvailableIp(range, usedIpInts) {
  if (!range) {
    return null;
  }

  for (let value = range.start; value <= range.end; value += 1) {
    if (!usedIpInts.has(value)) {
      return value;
    }
  }

  return null;
}

function normalizeHardwareText(value) {
  return String(value || '').trim().toLowerCase();
}

function classifyNetworkHardwareRole(item = {}) {
  const bag = [
    item?.nombre,
    item?.modelo,
    item?.descripcion,
    item?.descripcionComercial,
    item?.fichaProducto?.descripcionComercial
  ]
    .map((token) => normalizeHardwareText(token))
    .join(' ');

  if (/router|gateway|cortafuego|firewall/.test(bag)) return 'router';
  if (/ap\b|wifi|access point|punto de acceso/.test(bag)) return 'ap_wifi';
  if (/switch|l2|l3/.test(bag)) return 'switch';
  return 'red_generico';
}

function calculateRedHardwareDemanda(propuesta) {
  const subredes = Array.isArray(propuesta?.subredes) ? propuesta.subredes : [];

  const porSubred = subredes.map((subred) => {
    const hosts = Number(subred?.hostsEstimados || 0);
    const switches = Math.max(1, Math.ceil(hosts / 48));
    const apsWifi = Math.max(0, Math.ceil(hosts / 25));
    const routers = subred?.criticidad === 'alta' ? 1 : 0;

    return {
      area: subred.area,
      vlanId: subred.vlanId,
      criticidad: subred.criticidad,
      hostsEstimados: hosts,
      demanda: {
        switch: switches,
        ap_wifi: apsWifi,
        router: routers
      }
    };
  });

  const total = porSubred.reduce((acc, item) => {
    acc.switch += Number(item?.demanda?.switch || 0);
    acc.ap_wifi += Number(item?.demanda?.ap_wifi || 0);
    acc.router += Number(item?.demanda?.router || 0);
    return acc;
  }, { switch: 0, ap_wifi: 0, router: 0 });

  return { porSubred, total };
}

function createPoolByRole(items = []) {
  const pool = { switch: [], ap_wifi: [], router: [], red_generico: [] };
  items.forEach((item) => {
    const role = classifyNetworkHardwareRole(item);
    const disponible = Math.max(0, Number(item?.stock?.disponible || 0) - Number(item?.stock?.reservado || 0));
    if (disponible <= 0) return;

    const enriched = {
      _id: item._id,
      sku: item.sku,
      nombre: item.nombre,
      marca: item.marca,
      modelo: item.modelo,
      categoria: item.categoria,
      role,
      disponible,
      costoUnitario: Number(item?.costo?.unitario || 0),
      estadoCicloVida: item?.cicloVida?.estado || 'vigente'
    };

    pool[role] = pool[role] || [];
    pool[role].push(enriched);
  });

  Object.keys(pool).forEach((key) => {
    pool[key].sort((a, b) => {
      const lifecycleScore = (candidate) => {
        if (candidate.estadoCicloVida === 'vigente') return 3;
        if (candidate.estadoCicloVida === 'en_revision') return 2;
        if (candidate.estadoCicloVida === 'sustituido') return 1;
        return 0;
      };
      const lifeDiff = lifecycleScore(b) - lifecycleScore(a);
      if (lifeDiff !== 0) return lifeDiff;
      return a.costoUnitario - b.costoUnitario;
    });
  });

  return pool;
}

function takeFromPool(pool, role, cantidad) {
  const taken = [];
  let remaining = Math.max(0, Number(cantidad || 0));
  const rolesOrder = [role, 'red_generico'];

  for (const candidateRole of rolesOrder) {
    const list = pool[candidateRole] || [];
    for (const item of list) {
      if (remaining <= 0) break;
      if (item.disponible <= 0) continue;

      const unidades = Math.min(item.disponible, remaining);
      item.disponible -= unidades;
      remaining -= unidades;
      taken.push({
        itemId: item._id,
        sku: item.sku,
        nombre: item.nombre,
        marca: item.marca,
        modelo: item.modelo,
        roleAsignado: role,
        roleOrigen: candidateRole,
        unidades,
        estadoCicloVida: item.estadoCicloVida
      });
    }
    if (remaining <= 0) break;
  }

  return { taken, faltantes: remaining };
}

async function suggestHardwareForRedFromPropuesta({ clienteId, propuesta, apply = false, actor = 'red-hardware-suggester' }) {
  const demanda = calculateRedHardwareDemanda(propuesta);
  const inventoryItems = await HardwareItem.find({
    categoria: 'red',
    estado: 'activo'
  }).lean();

  const pool = createPoolByRole(inventoryItems);
  const sugerenciasPorSubred = [];
  const faltantesGlobales = { switch: 0, ap_wifi: 0, router: 0 };

  for (const subred of demanda.porSubred) {
    const byRole = {};

    for (const role of ['switch', 'ap_wifi', 'router']) {
      const requested = Number(subred?.demanda?.[role] || 0);
      if (requested <= 0) continue;

      const taken = takeFromPool(pool, role, requested);
      byRole[role] = {
        solicitado: requested,
        asignado: requested - taken.faltantes,
        faltante: taken.faltantes,
        items: taken.taken
      };

      faltantesGlobales[role] += taken.faltantes;
    }

    sugerenciasPorSubred.push({
      area: subred.area,
      vlanId: subred.vlanId,
      criticidad: subred.criticidad,
      hostsEstimados: subred.hostsEstimados,
      hardware: byRole
    });
  }

  const snapshot = {
    generadoEn: new Date().toISOString(),
    actor,
    resumen: {
      totalSubredes: sugerenciasPorSubred.length,
      demandaTotal: demanda.total,
      faltantes: faltantesGlobales,
      coberturaCompleta: Object.values(faltantesGlobales).every((value) => value === 0)
    },
    sugerenciasPorSubred
  };

  if (apply) {
    await RedDisenoOrganizacion.findOneAndUpdate(
      { clienteId },
      {
        $set: { ultimaSugerenciaHardware: snapshot },
        $push: { historialSugerenciasHardware: { $each: [snapshot], $slice: -10 } }
      },
      { new: false }
    );
  }

  return snapshot;
}

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

// Obtener contexto completo para construir red desde organizacion/instalacion
router.get('/cliente/:clienteId/contexto', async (req, res) => {
  try {
    const { clienteId } = req.params;

    const [cliente, redes, expedientes, diseno] = await Promise.all([
      Cliente.findById(clienteId).lean(),
      Red.find({ clienteId }).lean(),
      Expediente.find({ clienteId })
        .select('nombre origen estado servidor instalacion configuracion modeloComercial')
        .lean(),
      RedDisenoOrganizacion.findOne({ clienteId }).lean()
    ]);

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const servidores = expedientes.map((expediente) => ({
      _id: expediente._id,
      nombre: expediente.nombre,
      origen: expediente.origen,
      estado: expediente.estado,
      servidor: {
        ip: expediente.servidor?.ip || null,
        puerto: expediente.servidor?.puerto || 22,
        usuario: expediente.servidor?.usuario || null,
        hostname: expediente.servidor?.hostname || null
      },
      instalacion: {
        estado: expediente.instalacion?.estado || 'pendiente',
        packSeleccionado: expediente.instalacion?.packSeleccionado || null,
        packNombre: expediente.instalacion?.packNombre || null,
        scoreFinal: expediente.instalacion?.resumen?.scoreFinal || 0
      },
      configuracion: {
        packTipo: expediente.configuracion?.packTipo || null,
        completada: Boolean(expediente.configuracion?.completada),
        redSugerida: expediente.configuracion?.valores?.redSugerida || null,
        areaSugerida: expediente.configuracion?.valores?.areaSugerida || null
      },
      modeloComercial: expediente.modeloComercial || 'legacy_multi_pack',
      clasificacionRed: expediente.configuracion?.valores?.redSugerida
        ? (expediente.servidor?.ip ? 'ip_asignada' : 'clasificado')
        : 'sin_clasificar'
    }));

    const resumen = {
      totalRedes: redes.length,
      totalServidores: servidores.length,
      servidoresEnInstalacion: servidores.filter((s) => s.origen === 'instalacion').length,
      servidoresEnMantenimiento: servidores.filter((s) => s.origen === 'mantenimiento').length
    };

    return res.json({
      success: true,
      data: {
        cliente,
        redes,
        servidores,
        resumen,
        disenoOrganizacion: diseno || null
      }
    });
  } catch (error) {
    console.error('Error obteniendo contexto de red por cliente:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener diseno organizativo para red por cliente
router.get('/cliente/:clienteId/diseno-organizacion', async (req, res) => {
  try {
    const { clienteId } = req.params;

    const cliente = await Cliente.findById(clienteId).select('_id nombre').lean();
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const diseno = await RedDisenoOrganizacion.findOne({ clienteId }).lean();

    return res.json({
      success: true,
      data: {
        cliente,
        diseno: diseno || null
      }
    });
  } catch (error) {
    console.error('Error obteniendo diseno organizativo de red:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Crear o actualizar diseno organizativo para red por cliente
router.put('/cliente/:clienteId/diseno-organizacion', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const cliente = await Cliente.findById(clienteId).select('_id nombre').lean();

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const necesidades = normalizeNecesidades(req.body?.necesidades || {});
    const areas = normalizeAreas(req.body?.areas || []);
    const observaciones = String(req.body?.observaciones || '').trim().slice(0, 3000);
    const actualizadoPor = String(req.body?.actualizadoPor || 'sistema').trim().slice(0, 120) || 'sistema';
    const solicitarCalculo = Boolean(req.body?.solicitarCalculo);

    const updatePayload = {
      necesidades,
      areas,
      observaciones,
      actualizadoPor,
      version: 1
    };

    if (solicitarCalculo) {
      updatePayload.fechaCalculoSolicitado = new Date();
    }

    const disenoDoc = await RedDisenoOrganizacion.findOneAndUpdate(
      { clienteId },
      { $set: updatePayload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const diseno = typeof disenoDoc?.toObject === 'function'
      ? disenoDoc.toObject()
      : disenoDoc;

    return res.json({ success: true, data: diseno });
  } catch (error) {
    console.error('Error guardando diseno organizativo de red:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Generar propuesta inicial de subredes desde diseno organizativo
router.post('/cliente/:clienteId/propuesta-red', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const cliente = await Cliente.findById(clienteId).select('_id nombre').lean();

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const diseno = await RedDisenoOrganizacion.findOne({ clienteId }).lean();
    if (!diseno) {
      return res.status(400).json({
        success: false,
        error: 'No existe diseno organizativo guardado para calcular la propuesta'
      });
    }

    const propuesta = buildPropuestaFromDiseno(diseno);
    await persistProposalSnapshot(clienteId, propuesta, 'calculo_manual');

    return res.json({
      success: true,
      data: {
        cliente,
        propuesta
      }
    });
  } catch (error) {
    console.error('Error generando propuesta de red:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Aplicar propuesta calculada creando redes reales sin duplicados
router.post('/cliente/:clienteId/aplicar-propuesta-red', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const cliente = await Cliente.findById(clienteId).select('_id nombre').lean();

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const [diseno, redesExistentes] = await Promise.all([
      RedDisenoOrganizacion.findOne({ clienteId }).lean(),
      Red.find({ clienteId }).lean()
    ]);

    if (!diseno) {
      return res.status(400).json({
        success: false,
        error: 'No existe diseno organizativo guardado para aplicar la propuesta'
      });
    }

    const propuesta = buildPropuestaFromDiseno(diseno);
    await persistProposalSnapshot(clienteId, propuesta, 'aplicacion_propuesta');
    const aplicacion = await applyProposalToCliente({ clienteId, propuesta, apply: true, redesOverride: redesExistentes });

    return res.json({
      success: true,
      data: {
        cliente,
        propuesta,
        creadas: aplicacion.creadas,
        omitidas: aplicacion.omitidas,
        resumen: aplicacion.resumen
      }
    });
  } catch (error) {
    console.error('Error aplicando propuesta de red:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Sugerir asignacion inicial de servidores a subredes sin tocar IPs
router.post('/cliente/:clienteId/asignar-servidores-propuesta', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const cliente = await Cliente.findById(clienteId).select('_id nombre').lean();

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const diseno = await RedDisenoOrganizacion.findOne({ clienteId }).lean();
    if (!diseno) {
      return res.status(400).json({ success: false, error: 'No existe diseno organizativo guardado para asignar servidores' });
    }

    const propuesta = diseno.ultimaPropuesta || buildProposalSnapshot(buildPropuestaFromDiseno(diseno), 'asignacion_servidores');
    if (!Array.isArray(propuesta.subredes) || !propuesta.subredes.length) {
      return res.status(400).json({ success: false, error: 'La propuesta no contiene subredes para asignar servidores' });
    }
    const assignmentResult = await suggestServerAssignmentsFromProposal({
      clienteId,
      propuesta,
      apply: true
    });

    return res.json({
      success: true,
      data: {
        cliente,
        propuesta,
        asignaciones: assignmentResult.asignaciones,
        resumen: assignmentResult.resumen
      }
    });
  } catch (error) {
    console.error('Error asignando servidores segun propuesta:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Aplicar IPs sugeridas usando las redes creadas y evitando conflictos
router.post('/cliente/:clienteId/aplicar-ips-sugeridas', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const cliente = await Cliente.findById(clienteId).select('_id nombre').lean();

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const ipAplicacion = await suggestIpAssignmentsFromCliente({ clienteId, apply: true });

    return res.json({
      success: true,
      data: {
        cliente,
        asignadas: ipAplicacion.asignadas,
        omitidas: ipAplicacion.omitidas,
        resumen: ipAplicacion.resumen
      }
    });
  } catch (error) {
    console.error('Error aplicando IPs sugeridas:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Sugerir hardware del almacen para soportar la propuesta de red por cliente
router.post('/cliente/:clienteId/sugerir-hardware-red', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const apply = Boolean(req.body?.apply);
    const actor = String(req.body?.actor || 'red-hardware-suggester').trim().slice(0, 120) || 'red-hardware-suggester';

    const cliente = await Cliente.findById(clienteId).select('_id nombre').lean();
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const diseno = await RedDisenoOrganizacion.findOne({ clienteId }).lean();
    if (!diseno) {
      return res.status(400).json({ success: false, error: 'No existe diseno organizativo guardado para sugerir hardware de red' });
    }

    const propuesta = diseno?.ultimaPropuesta || buildProposalSnapshot(buildPropuestaFromDiseno(diseno), 'sugerencia_hardware_red');
    if (!Array.isArray(propuesta.subredes) || !propuesta.subredes.length) {
      return res.status(400).json({ success: false, error: 'La propuesta no contiene subredes para sugerir hardware' });
    }

    const sugerencia = await suggestHardwareForRedFromPropuesta({ clienteId, propuesta, apply, actor });

    return res.json({
      success: true,
      data: {
        cliente,
        apply,
        propuesta,
        sugerencia
      }
    });
  } catch (error) {
    console.error('Error sugiriendo hardware para red:', error);
    return res.status(500).json({ success: false, error: error.message });
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

    if (!servidorId || !ip) {
      return res.status(400).json({ success: false, error: 'servidorId e ip son requeridos' });
    }

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

    const expediente = await Expediente.findById(servidorId);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Servidor no encontrado' });
    }

    if (String(expediente.clienteId) !== String(red.clienteId)) {
      return res.status(400).json({
        success: false,
        error: 'El servidor no pertenece al mismo cliente de la red'
      });
    }

    const conflictoIp = await Expediente.findOne({
      _id: { $ne: servidorId },
      clienteId: red.clienteId,
      'servidor.ip': ip
    }).select('_id nombre servidor.ip').lean();

    if (conflictoIp) {
      return res.status(409).json({
        success: false,
        error: `La IP ${ip} ya está asignada al servidor ${conflictoIp.nombre}`
      });
    }
    
    const expedienteActualizado = await Expediente.findByIdAndUpdate(
      servidorId,
      { 'servidor.ip': ip },
      { new: true }
    );
    
    res.json({ success: true, data: expedienteActualizado });
  } catch (error) {
    console.error('Error asignando IP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.__internals = {
  buildPropuestaFromDiseno,
  buildProposalSnapshot,
  persistProposalSnapshot,
  applyProposalToCliente,
  suggestServerAssignmentsFromProposal,
  suggestIpAssignmentsFromCliente,
  suggestHardwareForRedFromPropuesta
};

module.exports = router;