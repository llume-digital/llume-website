-- Intentos fallidos de acceso al panel /admin, para limitar la fuerza bruta (por IP, ventana de 15 minutos).
CREATE TABLE intentos_acceso (
  id INTEGER PRIMARY KEY,
  ip TEXT NOT NULL,
  creado INTEGER NOT NULL  -- segundos Unix
);
CREATE INDEX intentos_acceso_ip ON intentos_acceso (ip, creado);
