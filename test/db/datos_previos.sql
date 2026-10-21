-- Estado anterior a security_auth.sql: usuarios con contraseña en texto plano.
insert into usuarios (nombre, usuario, contrasena, rol) values
  ('Admin', 'admin', 'secreto', 'admin'),
  ('Oficial', 'ofi', 'abc123', 'oficial');

-- Configuración como la tiene producción (fila única id = 1)
insert into configuracion (id) values (1);
