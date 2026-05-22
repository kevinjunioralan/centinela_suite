const rolesMiddleware = (rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }
    
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ 
        success: false, 
        error: `Acceso denegado. Rol ${req.usuario.rol} no tiene permisos.` 
      });
    }
    
    next();
  };
};

const verificarAccesoCliente = (req, res, next) => {
  const clienteId = req.params.clienteId || req.params.id || req.body.clienteId;
  
  if (req.usuario.rol === 'ADMIN') {
    return next();
  }
  
  if (req.usuario.rol === 'TECNICO') {
    return next();
  }
  
  if (req.usuario.rol === 'VISOR') {
    if (req.usuario.clienteId && req.usuario.clienteId.toString() === clienteId) {
      return next();
    }
    return res.status(403).json({ success: false, error: 'No tiene acceso a este cliente' });
  }
  
  return res.status(403).json({ success: false, error: 'Acceso denegado' });
};

module.exports = { rolesMiddleware, verificarAccesoCliente };