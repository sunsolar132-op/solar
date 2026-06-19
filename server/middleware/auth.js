const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

const auth = (allowedRoles = []) => {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Malformed token' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      if (allowedRoles.length && !allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Forbidden: insufficient role' });
      }
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
};

module.exports = auth;
