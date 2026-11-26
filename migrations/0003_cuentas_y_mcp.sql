-- Fase 2 del Cerebro: cuentas individuales (la clave compartida desaparece), conector MCP con OAuth 2.1 y auditoría.
-- Todos los secretos (contraseñas, sesiones, invitaciones, códigos y tokens) se guardan solo como hash.

-- Contraseña de cada persona: «pbkdf2$<iteraciones>$<sal hex>$<hash hex>». NULL = aún no ha activado su cuenta.
ALTER TABLE personas ADD COLUMN clave TEXT;

-- Sesiones del panel (cookie llume_admin = token; aquí su sha256)
CREATE TABLE sesiones (
  hash TEXT PRIMARY KEY,
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  creada INTEGER NOT NULL,  -- segundos Unix
  caduca INTEGER NOT NULL
);
CREATE INDEX sesiones_persona ON sesiones (persona_id);

-- Enlaces de invitación de un solo uso para que cada persona elija (o restablezca) su contraseña
CREATE TABLE invitaciones (
  hash TEXT PRIMARY KEY,
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  creada_por INTEGER REFERENCES personas(id),  -- NULL si se creó con scripts/invitar.sh
  creada INTEGER NOT NULL,
  caduca INTEGER NOT NULL,
  usada INTEGER
);
CREATE INDEX invitaciones_persona ON invitaciones (persona_id);

-- Clientes OAuth registrados dinámicamente (Claude, ChatGPT, Claude Code...)
CREATE TABLE oauth_clientes (
  client_id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,  -- JSON
  origen TEXT NOT NULL CHECK (origen IN ('claude', 'chatgpt')),
  creado INTEGER NOT NULL
);

-- Códigos de autorización (un solo uso, 5 minutos, PKCE S256)
CREATE TABLE oauth_codigos (
  hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clientes(client_id),
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  caduca INTEGER NOT NULL,
  usado INTEGER
);

-- Una conexión = un asistente autorizado por una persona. Access de 1 h y refresh de 60 días que rota en cada uso.
CREATE TABLE oauth_conexiones (
  id INTEGER PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clientes(client_id),
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  access_hash TEXT NOT NULL UNIQUE,
  access_caduca INTEGER NOT NULL,
  refresh_hash TEXT NOT NULL UNIQUE,
  refresh_caduca INTEGER NOT NULL,
  creada INTEGER NOT NULL,
  ultimo_uso INTEGER,
  revocada INTEGER,
  revocada_por INTEGER REFERENCES personas(id)
);
CREATE INDEX oauth_conexiones_persona ON oauth_conexiones (persona_id);

-- Una fila por llamada a una herramienta del MCP
CREATE TABLE mcp_auditoria (
  id INTEGER PRIMARY KEY,
  conexion_id INTEGER REFERENCES oauth_conexiones(id),
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  herramienta TEXT NOT NULL,
  argumentos TEXT NOT NULL,  -- JSON, recortado a 2000 caracteres
  ok INTEGER NOT NULL,
  error TEXT,
  creado INTEGER NOT NULL
);
CREATE INDEX mcp_auditoria_creado ON mcp_auditoria (creado);
