const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'centinela_secret_key_2024';

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, error: 'Token requerido' });
  }
  
  try {
    // Para tokens temporales (desarrollo)
    if (token.startsWith('temp-token-')) {
      req.usuario = {
        id: 'temp-id',
        email: 'desarrollo@centinela.com',
        nombre: 'Usuario Desarrollo',
        rol: 'ADMIN'
      };
      return next();
    }
    
    // Tokens JWT normales (producción)
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }
};

module.exports = authMiddleware;