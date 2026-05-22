const AuditorInterno = require('./AuditorInterno.js');

describe('AuditorInterno', () => {
  let auditor;

  beforeEach(() => {
    auditor = new AuditorInterno();
  });

  test('should instantiate successfully', () => {
    expect(auditor).toBeInstanceOf(AuditorInterno);
  });

  test('should register an event successfully', async () => {
    const result = await auditor.registrarEvento(1, 'prueba', { accion: 'creacion', detalle: 'test' });
    expect(result.success).toBe(true);
    expect(result.expedienteId).toBe(1);
    expect(result.evento).toHaveProperty('tipo', 'prueba');
  });

  test('should reject invalid expedienteId', async () => {
    const result = await auditor.registrarEvento('invalid', 'prueba', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('expedienteId debe ser numérico y positivo');
  });

  test('should reject invalid tipo', async () => {
    const result = await auditor.registrarEvento(1, '', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('tipo debe ser un string válido');
  });

  test('should obtain historial for an expediente', async () => {
    await auditor.registrarEvento(1, 'prueba', { accion: 'test' });
    const result = await auditor.obtenerHistorial(1);
    expect(result.success).toBe(true);
    expect(result.historial).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  test('should return empty historial for non-existent expediente', async () => {
    const result = await auditor.obtenerHistorial(999);
    expect(result.success).toBe(true);
    expect(result.historial).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  test('should detect anomaly placeholder', async () => {
    // Add enough events to trigger anomaly detection
    for (let i = 0; i < 15; i++) {
      await auditor.registrarEvento(1, 'network', { paquetes: i });
    }
    
    const result = await auditor.detectarAnomalia(1);
    expect(result.success).toBe(true);
    // With our placeholder logic, this should detect an anomaly due to many network events
    expect(result.anomaliaDetectada).toBe(true);
  });

  test('should generate resumen', async () => {
    await auditor.registrarEvento(1, 'prueba', { accion: 'test1' });
    await auditor.registrarEvento(1, 'network', { accion: 'test2' });
    
    const result = await auditor.resumen(1);
    expect(result.success).toBe(true);
    expect(result.resumen.totalEventos).toBe(2);
    expect(result.resumen.eventosPorTipo.prueba).toBe(1);
    expect(result.resumen.eventosPorTipo.network).toBe(1);
  });
});