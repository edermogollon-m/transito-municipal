-- Estado anterior a security_auth.sql: usuarios con contraseña en texto plano.
insert into usuarios (nombre, usuario, contrasena, rol) values
  ('Admin', 'admin', 'secreto', 'admin'),
  ('Oficial', 'ofi', 'abc123', 'oficial');
