-- Cerebro de llume: bitácora compartida de notas y pendientes del panel /admin (ver src/worker.js).
-- Nada se borra: corregir crea una fila nueva y marca la anterior como «superseded»; cerrar solo la saca de las activas.

-- Equipo de llume. Firma las notas y es responsable de los pendientes.
CREATE TABLE personas (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  activa INTEGER NOT NULL DEFAULT 1
);

-- Clientes y proyectos con los que se enlazan las notas. Se gestionan desde el panel.
CREATE TABLE clientes (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE COLLATE NOCASE,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE entradas (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('nota', 'pendiente')),
  estado TEXT NOT NULL DEFAULT 'open' CHECK (estado IN ('open', 'closed', 'superseded')),
  texto TEXT NOT NULL CHECK (length(texto) BETWEEN 1 AND 2000),
  etiquetas TEXT NOT NULL DEFAULT '[]',   -- JSON: ["Facturación", ...]
  enlaces TEXT NOT NULL DEFAULT '[]',     -- JSON: ["https://...", ...]
  cliente_id INTEGER REFERENCES clientes(id),
  persona_id INTEGER REFERENCES personas(id),      -- persona del equipo de la que trata la nota
  responsable_id INTEGER REFERENCES personas(id),  -- quién tiene que hacer el pendiente
  vence TEXT,                                      -- AAAA-MM-DD
  autor_id INTEGER NOT NULL REFERENCES personas(id),
  origen TEXT NOT NULL DEFAULT 'panel' CHECK (origen IN ('panel', 'claude', 'chatgpt')),
  sustituye_id INTEGER REFERENCES entradas(id),    -- versión anterior, si es una corrección
  creada TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizada TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  cerrada TEXT,
  cerrada_por INTEGER REFERENCES personas(id)
);
CREATE INDEX entradas_estado ON entradas (estado, actualizada);
CREATE INDEX entradas_cliente ON entradas (cliente_id, estado);
CREATE INDEX entradas_responsable ON entradas (responsable_id, estado);
CREATE INDEX entradas_sustituye ON entradas (sustituye_id);

-- «Estado actual» de un sujeto (un cliente, una persona o lo general). Cada guardado es una fila nueva: el estado
-- vigente es la última y las anteriores quedan como historial.
CREATE TABLE estados (
  id INTEGER PRIMARY KEY,
  sujeto_tipo TEXT NOT NULL CHECK (sujeto_tipo IN ('general', 'cliente', 'persona')),
  sujeto_id INTEGER NOT NULL DEFAULT 0,
  texto TEXT NOT NULL CHECK (length(texto) <= 4000),
  autor_id INTEGER NOT NULL REFERENCES personas(id),
  creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX estados_sujeto ON estados (sujeto_tipo, sujeto_id, id);

INSERT INTO personas (nombre) VALUES ('pachu'), ('miguel'), ('daniel');
INSERT INTO clientes (nombre) VALUES ('Lopita & Co'), ('Nar&Co'), ('BioAsturias'), ('El Puerto Luanco'), ('A Caldeira');
