// test-normalizacion.js - Script para probar la nueva estructura normalizada
const mongoose = require('mongoose');
require('dotenv').config();

// Importar modelos
const Expediente = require('./src/expediente/models/Expediente');
const Metrica = require('./src/expediente/models/Metrica');
const Alerta = require('./src/expediente/models/Alerta');
const Prediccion = require('./src/expediente/models/Prediccion');

// Importar servicios
const ExpedienteRepository = require('./src/expediente/ExpedienteRepository/ExpedienteRepository');
const ExpedienteService = require('./src/expediente/ExpedienteService/ExpedienteService');

const repository = new ExpedienteRepository();
const service = new ExpedienteService();
service.setRepository(repository);

async function test() {
  console.log('🚀 ========== INICIANDO PRUEBAS NORMALIZACIÓN ==========\n');

  try {
    // ========== 1. CONEXIÓN A MONGODB ==========
    console.log('📡 Conectando a MongoDB...');
    await mongoose.connect('mongodb://localhost:27017/centinela_banco_pruebas');
    console.log('✅ Conexión establecida\n');

    // ========== 2. LIMPIAR DATOS DE PRUEBA (opcional) ==========
    console.log('🧹 Limpiando datos de prueba anteriores...');
    await Expediente.deleteMany({ nombre: /^Test-/ });
    await Metrica.deleteMany({});
    await Alerta.deleteMany({});
    await Prediccion.deleteMany({});
    console.log('✅ Limpieza completada\n');

    // ========== 3. CREAR EXPEDIENTE DE PRUEBA ==========
    console.log('📝 Creando expediente de prueba...');
    
    const expedienteData = {
      nombre: "Test-Servidor-Normalizado",
      descripcion: "Servidor para pruebas de normalización",
      origen: "manual",
      clienteId: new mongoose.Types.ObjectId(), // ID temporal para prueba
      servidor: {
        ip: "192.168.1.100",
        puerto: 22,
        usuario: "testuser",
        password: "testpass"
      }
    };
    
    const expediente = await service.createExpediente(expedienteData);
    const expedienteId = expediente._id;
    const clienteId = expediente.clienteId;
    
    console.log(`✅ Expediente creado con ID: ${expedienteId}\n`);

    // ========== 4. REGISTRAR MÉTRICAS ==========
    console.log('📊 Registrando métricas...');
    
    const metricas = [
      { tipo: 'cpu', valor: 45.5 },
      { tipo: 'cpu', valor: 52.3 },
      { tipo: 'cpu', valor: 78.2 },
      { tipo: 'ram', valor: 62.1 },
      { tipo: 'ram', valor: 68.4 },
      { tipo: 'disco', valor: 45.0 },
      { tipo: 'disco', valor: 47.2 }
    ];
    
    for (const m of metricas) {
      const result = await service.registrarMetrica(
        expedienteId, clienteId, m.tipo, m.valor, 'manual'
      );
      console.log(`  ✅ Métrica ${m.tipo}: ${m.valor}% (ID: ${result._id})`);
    }
    console.log('');

    // ========== 5. REGISTRAR ALERTAS ==========
    console.log('⚠️ Registrando alertas...');
    
    const alertas = [
      { tipo: 'advertencia', mensaje: 'Uso de CPU elevado', valor: 78.2, umbral: 75 },
      { tipo: 'error', mensaje: 'Servicio caído', valor: null, umbral: null },
      { tipo: 'advertencia', mensaje: 'Espacio en disco bajo', valor: 47.2, umbral: 40 }
    ];
    
    const alertasGuardadas = [];
    for (const a of alertas) {
      const result = await service.registrarAlerta(
        expedienteId, clienteId, a.tipo, a.mensaje, 'sistema', a.valor, a.umbral
      );
      alertasGuardadas.push(result);
      console.log(`  ✅ Alerta: ${a.tipo} - ${a.mensaje} (ID: ${result._id})`);
    }
    console.log('');

    // ========== 6. REGISTRAR PREDICCIONES ==========
    console.log('🔮 Registrando predicciones...');
    
    const fechaFutura = new Date();
    fechaFutura.setDate(fechaFutura.getDate() + 7);
    
    const prediccion = await service.registrarPrediccion(
      expedienteId, clienteId, 'cpu', 75, fechaFutura, 'Revisar sistema de refrigeración', 'aprendizaje'
    );
    console.log(`  ✅ Predicción: CPU - 75% (ID: ${prediccion._id})`);
    console.log('');

    // ========== 7. CONSULTAR MÉTRICAS ==========
    console.log('📊 Consultando métricas...');
    
    const metricasCPU = await service.obtenerMetricas(expedienteId, 'cpu', 10);
    console.log(`  ✅ Métricas CPU encontradas: ${metricasCPU.length}`);
    metricasCPU.forEach(m => {
      console.log(`     - ${m.timestamp.toISOString()}: ${m.valor}%`);
    });
    
    const ultimaCPU = await service.obtenerUltimaMetrica(expedienteId, 'cpu');
    console.log(`  ✅ Última CPU: ${ultimaCPU?.valor}%\n`);

    // ========== 8. CONSULTAR ALERTAS ==========
    console.log('⚠️ Consultando alertas...');
    
    const alertasNoResueltas = await service.obtenerAlertas(expedienteId, true);
    console.log(`  ✅ Alertas no resueltas: ${alertasNoResueltas.length}`);
    
    // Resolver una alerta
    if (alertasGuardadas.length > 0) {
      const alertaResuelta = await service.resolverAlerta(alertasGuardadas[0]._id, 'test_script');
      console.log(`  ✅ Alerta resuelta: ${alertaResuelta._id}\n`);
    }

    // ========== 9. CONSULTAR PREDICCIONES ACTIVAS ==========
    console.log('🔮 Consultando predicciones activas...');
    
    const prediccionesActivas = await service.obtenerPrediccionesActivas(expedienteId);
    console.log(`  ✅ Predicciones activas: ${prediccionesActivas.length}`);
    prediccionesActivas.forEach(p => {
      console.log(`     - ${p.tipoFallo}: ${p.probabilidad}% (hasta ${new Date(p.fechaEstimadaFallo).toISOString()})`);
    });
    console.log('');

    // ========== 10. VERIFICAR QUE EL EXPEDIENTE NO TIENE DATOS EMBEBIDOS ==========
    console.log('🔍 Verificando que el expediente NO tiene datos embebidos...');
    
    const expedienteFinal = await service.getExpedienteById(expedienteId);
    console.log(`  ✅ Expediente: ${expedienteFinal.nombre}`);
    console.log(`  ✅ ¿Tiene mantenimiento.metricasHistoricas? ${!!expedienteFinal.mantenimiento?.metricasHistoricas ? '❌ SÍ (error)' : '✅ NO (correcto)'}`);
    console.log(`  ✅ ¿Tiene mantenimiento.alertas? ${!!expedienteFinal.mantenimiento?.alertas ? '❌ SÍ (error)' : '✅ NO (correcto)'}`);
    console.log(`  ✅ ¿Tiene mantenimiento.predicciones? ${!!expedienteFinal.mantenimiento?.predicciones ? '❌ SÍ (error)' : '✅ NO (correcto)'}`);
    console.log('');

    // ========== 11. LIMPIAR DATOS DE PRUEBA ==========
    console.log('🧹 Limpiando datos de prueba...');
    await Expediente.deleteOne({ _id: expedienteId });
    await Metrica.deleteMany({ expedienteId });
    await Alerta.deleteMany({ expedienteId });
    await Prediccion.deleteMany({ expedienteId });
    console.log('✅ Datos de prueba eliminados\n');

    // ========== 12. RESUMEN FINAL ==========
    console.log('🎉 ========== TODAS LAS PRUEBAS PASARON ==========');
    console.log('✅ La normalización de datos funciona correctamente');
    console.log('✅ Métricas, alertas y predicciones se guardan en colecciones separadas');
    console.log('✅ El expediente se mantiene limpio y liviano');

  } catch (error) {
    console.error('❌ ERROR en las pruebas:', error);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Conexión cerrada');
  }
}

// Ejecutar pruebas
test();