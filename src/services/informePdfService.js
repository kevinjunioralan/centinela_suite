const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class InformePdfService {
  
  // ============ NUEVO: Generar informe con datos normalizados ============
  async generarInformeServidorNormalizado(expediente, metricas, alertas, predicciones, outputPath) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      
      doc.pipe(stream);
      
      // ============ CABECERA ============
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .fillColor('#1e4a6e')
         .text('INFORME DE SERVIDOR', { align: 'center' });
      
      doc.moveDown();
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Generado: ${new Date().toLocaleString('es-ES')}`, { align: 'center' });
      
      doc.moveDown(2);
      
      // ============ DATOS GENERALES ============
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#1e4a6e')
         .text('📋 DATOS GENERALES');
      
      doc.moveDown(0.5);
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor('#333333');
      
      // ✅ Calcular score basado en alertas y métricas
      const alertasNoResueltas = alertas.filter(a => !a.resuelta).length;
      const scoreSalud = Math.max(0, Math.min(100, 100 - (alertasNoResueltas * 5)));
      
      const datosGenerales = [
        { label: 'Nombre del servidor', value: expediente.nombre || 'N/A' },
        { label: 'IP', value: expediente.servidor?.ip || 'N/A' },
        { label: 'Usuario SSH', value: expediente.servidor?.usuario || 'N/A' },
        { label: 'Hostname', value: expediente.servidor?.hostname || 'N/A' },
        { label: 'Estado Custodia', value: expediente.mantenimiento?.estadoCustodia || 'pendiente' },
        { label: 'Fecha ingreso custodia', value: this._formatearFecha(expediente.mantenimiento?.fechaIngreso) },
        { label: 'Score salud', value: `${scoreSalud}%` },
        { label: 'Alertas activas', value: alertasNoResueltas.toString() }
      ];
      
      this._dibujarTabla(doc, datosGenerales, 2, 250);
      
      doc.moveDown();
      
      // ============ CONFIGURACIÓN DEL PACK ============
      if (expediente.configuracion?.valores) {
        doc.addPage();
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1e4a6e')
           .text('⚙️ CONFIGURACIÓN DEL PACK');
        
        doc.moveDown(0.5);
        
        const configData = [];
        const config = expediente.configuracion.valores;
        
        if (config.dominio) configData.push({ label: 'Dominio', value: config.dominio });
        if (config.adminEmail) configData.push({ label: 'Email administrador', value: config.adminEmail });
        if (config.nginx) {
          configData.push({ label: 'Nginx - Puerto HTTP', value: config.nginx.puertoHttp || 80 });
          configData.push({ label: 'Nginx - SSL', value: config.nginx.ssl ? 'Activado' : 'Desactivado' });
        }
        if (config.postgresql) {
          configData.push({ label: 'PostgreSQL - Puerto', value: config.postgresql.puerto || 5432 });
          configData.push({ label: 'PostgreSQL - Backups', value: config.postgresql.backups ? 'Activado' : 'Desactivado' });
        }
        if (config.redis) {
          configData.push({ label: 'Redis - Puerto', value: config.redis.puerto || 6379 });
          configData.push({ label: 'Redis - Memoria máxima', value: config.redis.maxMemoria || '256mb' });
        }
        
        this._dibujarTabla(doc, configData, 2, 250);
      }
      
      // ============ MÉTRICAS (normalizadas) ============
      if (metricas.length > 0) {
        doc.addPage();
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1e4a6e')
           .text('📈 MÉTRICAS HISTÓRICAS');
        
        doc.moveDown(0.5);
        
        // Calcular estadísticas por tipo
        const metricasCPU = metricas.filter(m => m.tipo === 'cpu');
        const metricasRAM = metricas.filter(m => m.tipo === 'ram');
        const metricasDISCO = metricas.filter(m => m.tipo === 'disco');
        
        const stats = [
          { label: 'CPU Promedio', value: `${this._calcularPromedio(metricasCPU)}%` },
          { label: 'CPU Máximo', value: `${this._calcularMaximo(metricasCPU)}%` },
          { label: 'RAM Promedio', value: `${this._calcularPromedio(metricasRAM)}%` },
          { label: 'RAM Máximo', value: `${this._calcularMaximo(metricasRAM)}%` },
          { label: 'DISCO Promedio', value: `${this._calcularPromedio(metricasDISCO)}%` },
          { label: 'DISCO Máximo', value: `${this._calcularMaximo(metricasDISCO)}%` }
        ];
        
        this._dibujarTabla(doc, stats, 2, 250);
        
        // Gráfico simple de evolución (últimas 10 métricas)
        doc.moveDown();
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .text('Evolución reciente (últimas mediciones)', { align: 'center' });
        
        const ultimasCPU = metricasCPU.slice(-10);
        const ultimasRAM = metricasRAM.slice(-10);
        const ultimasDISCO = metricasDISCO.slice(-10);
        const maxLongitud = Math.max(ultimasCPU.length, ultimasRAM.length, ultimasDISCO.length);
        
        if (maxLongitud > 0) {
          const anchoBarra = (doc.page.width - 100) / maxLongitud;
          let x = 50;
          
          for (let i = 0; i < maxLongitud; i++) {
            const cpuValor = ultimasCPU[i]?.valor || 0;
            const ramValor = ultimasRAM[i]?.valor || 0;
            const discoValor = ultimasDISCO[i]?.valor || 0;
            
            const alturaCPU = (cpuValor / 100) * 80;
            const alturaRAM = (ramValor / 100) * 80;
            const alturaDISCO = (discoValor / 100) * 80;
            
            doc.fillColor('#3b82f6')
               .rect(x, doc.y + 90 - alturaCPU, anchoBarra - 3, alturaCPU)
               .fill();
            doc.fillColor('#10b981')
               .rect(x + anchoBarra/3, doc.y + 90 - alturaRAM, anchoBarra - 3, alturaRAM)
               .fill();
            doc.fillColor('#f59e0b')
               .rect(x + (anchoBarra*2)/3, doc.y + 90 - alturaDISCO, anchoBarra - 3, alturaDISCO)
               .fill();
            
            x += anchoBarra;
          }
          
          doc.y += 110;
          
          // Leyenda
          doc.fontSize(8);
          doc.fillColor('#3b82f6').text('CPU', 50, doc.y);
          doc.fillColor('#10b981').text('RAM', 100, doc.y);
          doc.fillColor('#f59e0b').text('DISCO', 150, doc.y);
          doc.y += 15;
        }
      }
      
      // ============ ALERTAS (normalizadas) ============
      if (alertas.length > 0) {
        doc.addPage();
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1e4a6e')
           .text('⚠️ ALERTAS REGISTRADAS');
        
        doc.moveDown(0.5);
        
        const alertasData = alertas.slice(-20).map(a => ({
          label: this._formatearFecha(a.timestamp),
          value: `${a.tipo?.toUpperCase()}: ${a.mensaje} ${a.resuelta ? '(RESUELTA)' : '(PENDIENTE)'}`
        }));
        
        this._dibujarTabla(doc, alertasData, 1, 450);
      }
      
      // ============ PREDICCIONES (normalizadas) ============
      if (predicciones && predicciones.length > 0) {
        doc.addPage();
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1e4a6e')
           .text('🔮 PREDICCIONES');
        
        doc.moveDown(0.5);
        
        const prediccionesData = predicciones.slice(-10).map(p => ({
          label: this._formatearFecha(p.fechaPrediccion),
          value: `${p.tipoFallo?.toUpperCase()}: ${p.probabilidad}% probabilidad - ${p.acertada === null ? 'Pendiente' : (p.acertada ? 'Acertada' : 'Fallida')}`
        }));
        
        this._dibujarTabla(doc, prediccionesData, 1, 450);
      }
      
      // ============ VALIDACIÓN ============
      if (expediente.validacion?.estado === 'completado') {
        doc.addPage();
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1e4a6e')
           .text('🔍 INFORME DE VALIDACIÓN');
        
        doc.moveDown(0.5);
        
        const validacionData = [
          { label: 'Fecha validación', value: this._formatearFecha(expediente.validacion.fechaFin) },
          { label: 'Duración', value: `${expediente.validacion.duracionHoras?.toFixed(1)} horas` },
          { label: 'Puntuación', value: `${expediente.validacion.score}%` },
          { label: 'Recomendación', value: expediente.validacion.recomendacion || 'Sin evaluación' }
        ];
        
        this._dibujarTabla(doc, validacionData, 2, 250);
      }
      
      // ============ PIE DE PÁGINA ============
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.fontSize(8)
           .fillColor('#999999')
           .text(
             `Centinela - Sistema de Custodia Predictiva | Página ${i + 1} de ${totalPages}`,
             50,
             doc.page.height - 50,
             { align: 'center' }
           );
      }
      
      doc.end();
      
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    });
  }
  
  // ============ NUEVO: Generar informe de cliente con datos normalizados ============
  async generarInformeClienteNormalizado(cliente, servidores, metricas, alertas, outputPath) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      
      doc.pipe(stream);
      
      // Cabecera
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .fillColor('#1e4a6e')
         .text('INFORME DE CLIENTE', { align: 'center' });
      
      doc.moveDown();
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Generado: ${new Date().toLocaleString('es-ES')}`, { align: 'center' });
      
      doc.moveDown(2);
      
      // Datos del cliente
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#1e4a6e')
         .text('🏢 DATOS DEL CLIENTE');
      
      doc.moveDown(0.5);
      
      const clienteData = [
        { label: 'Nombre', value: cliente.nombre || 'N/A' },
        { label: 'NIF/CIF', value: cliente.nif || 'N/A' },
        { label: 'Email', value: cliente.email || 'N/A' },
        { label: 'Teléfono', value: cliente.telefono || 'N/A' },
        { label: 'Dirección', value: cliente.direccion || 'N/A' },
        { label: 'Plan', value: cliente.plan || 'basico' },
        { label: 'Fecha alta', value: this._formatearFecha(cliente.fechaAlta) }
      ];
      
      this._dibujarTabla(doc, clienteData, 2, 250);
      
      doc.addPage();
      
      // Resumen de servidores
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#1e4a6e')
         .text('🖥️ SERVIDORES');
      
      doc.moveDown(0.5);
      
      // ✅ Calcular estadísticas por servidor
      const servidoresData = servidores.map(s => {
        const metricasServidor = metricas.filter(m => m.expedienteId.toString() === s._id.toString());
        const alertasServidor = alertas.filter(a => a.expedienteId.toString() === s._id.toString());
        const alertasNoResueltas = alertasServidor.filter(a => !a.resuelta).length;
        const cpuPromedio = this._calcularPromedio(metricasServidor.filter(m => m.tipo === 'cpu'));
        
        return {
          label: s.nombre,
          value: `IP: ${s.servidor?.ip || 'N/A'} | Pack: ${s.instalacion?.packNombre || 'Sin pack'} | CPU: ${cpuPromedio}% | Alertas: ${alertasNoResueltas}`
        };
      });
      
      this._dibujarTabla(doc, servidoresData, 1, 450);
      
      // ============ RESUMEN DE ALERTAS ============
      if (alertas.length > 0) {
        doc.addPage();
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1e4a6e')
           .text('⚠️ ALERTAS DEL CLIENTE');
        
        doc.moveDown(0.5);
        
        const alertasResumen = alertas.slice(-30).map(a => ({
          label: this._formatearFecha(a.timestamp),
          value: `${a.tipo?.toUpperCase()}: ${a.mensaje}`
        }));
        
        this._dibujarTabla(doc, alertasResumen, 1, 450);
      }
      
      // Pie de página
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.fontSize(8)
           .fillColor('#999999')
           .text(
             `Centinela - Sistema de Custodia Predictiva | Página ${i + 1} de ${totalPages}`,
             50,
             doc.page.height - 50,
             { align: 'center' }
           );
      }
      
      doc.end();
      
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    });
  }
  
  // ============ MÉTODOS AUXILIARES ============
  
  _calcularPromedio(metricas) {
    if (metricas.length === 0) return 0;
    const suma = metricas.reduce((acc, m) => acc + m.valor, 0);
    return Math.round(suma / metricas.length);
  }
  
  _calcularMaximo(metricas) {
    if (metricas.length === 0) return 0;
    return Math.max(...metricas.map(m => m.valor));
  }
  
  _dibujarTabla(doc, data, columnas, anchoColumna) {
    const startX = 50;
    let startY = doc.y;
    const alturaFila = 25;
    
    for (let i = 0; i < data.length; i++) {
      const fila = data[i];
      const columna = i % columnas;
      const filaIndex = Math.floor(i / columnas);
      const x = startX + (columna * anchoColumna);
      const y = startY + (filaIndex * alturaFila);
      
      if (y + alturaFila > doc.page.height - 100) {
        doc.addPage();
        startY = 50;
        const nuevaFilaIndex = Math.floor(i / columnas);
        const nuevoY = startY + (nuevaFilaIndex * alturaFila);
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#555555')
           .text(fila.label, x, nuevoY);
        
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#333333')
           .text(fila.value, x + 100, nuevoY);
        
        doc.moveTo(x, nuevoY + alturaFila - 5)
           .lineTo(x + anchoColumna - 20, nuevoY + alturaFila - 5)
           .strokeColor('#e2e8f0')
           .stroke();
      } else {
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#555555')
           .text(fila.label, x, y);
        
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#333333')
           .text(fila.value, x + 100, y);
        
        doc.moveTo(x, y + alturaFila - 5)
           .lineTo(x + anchoColumna - 20, y + alturaFila - 5)
           .strokeColor('#e2e8f0')
           .stroke();
      }
    }
    
    const totalFilas = Math.ceil(data.length / columnas);
    doc.y = startY + totalFilas * alturaFila + 10;
  }
  
  _formatearFecha(fecha) {
    if (!fecha) return 'N/A';
    return new Date(fecha).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

module.exports = InformePdfService;