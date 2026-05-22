const Expediente = require('../expediente/models/Expediente');

class CustodiaService {
  constructor() {
    this.conexionesActivas = new Map();
  }

  async iniciarCustodia(expedienteId) {
    console.log(`🛡️ Iniciando custodia para expediente ${expedienteId}`);
    
    await Expediente.findByIdAndUpdate(expedienteId, {
      'mantenimiento.estadoCustodia': 'conectado',
      'mantenimiento.ultimaConexion': new Date(),
      'mantenimiento.fechaIngreso': new Date()
    });
    
    const intervalId = setInterval(async () => {
      const metrica = {
        timestamp: new Date(),
        cpu: Math.floor(Math.random() * 60) + 20,
        memoria: Math.floor(Math.random() * 50) + 30,
        disco: Math.floor(Math.random() * 40) + 20
      };
      
      await Expediente.findByIdAndUpdate(expedienteId, {
        $push: { 'mantenimiento.metricasHistoricas': metrica }
      });
    }, 30000);
    
    this.conexionesActivas.set(expedienteId.toString(), { intervalId });
    return { success: true };
  }
  
  async detenerCustodia(expedienteId) {
    const conexion = this.conexionesActivas.get(expedienteId.toString());
    if (conexion) {
      clearInterval(conexion.intervalId);
      this.conexionesActivas.delete(expedienteId.toString());
    }
    
    await Expediente.findByIdAndUpdate(expedienteId, {
      'mantenimiento.estadoCustodia': 'desconectado'
    });
  }
  
  async verificarEstado(expedienteId) {
    const expediente = await Expediente.findById(expedienteId);
    const conectado = expediente?.mantenimiento?.estadoCustodia === 'conectado';
    return { conectado, estado: expediente?.mantenimiento?.estadoCustodia };
  }
}

module.exports = CustodiaService;