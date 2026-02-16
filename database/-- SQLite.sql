-- SQLite
CREATE TABLE clasificaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    emoji TEXT DEFAULT '📦',
    imagen TEXT,
    orden INTEGER DEFAULT 0,
    activa INTEGER DEFAULT 1,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE productos ADD COLUMN clasificacion_id INTEGER;
INSERT INTO clasificaciones (nombre, emoji, orden) VALUES
('Pizzas', '🍕', 1),
('Bebidas', '🥤', 2),
('Postres', '🍰', 3),
('Ingredientes', '🧀', 4),
('Otros', '📦', 99);

UPDATE productos
SET clasificacion_id = (
    SELECT id
    FROM clasificaciones
    WHERE clasificaciones.nombre = productos.categoria
);

UPDATE productos
SET clasificacion_id = (
    SELECT id FROM clasificaciones WHERE nombre = 'Otros'
)
WHERE clasificacion_id IS NULL;
