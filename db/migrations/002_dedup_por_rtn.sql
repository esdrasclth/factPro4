-- Detección de duplicados más robusta.
--
-- El índice original exigía CAI *y* número de factura no nulos. Pero el CAI es
-- de los campos que peor se leen (letra pequeña, al pie, a veces borroso), y
-- cuando sale null la detección de duplicados se apagaba en silencio: se podía
-- guardar dos veces la misma factura sin ninguna advertencia.
--
-- La clave natural real de una factura hondureña es el emisor más el
-- correlativo: dos proveedores distintos sí pueden repetir numeración, pero el
-- mismo RTN no repite su propio número. Ese es el índice principal ahora.
-- El de CAI se conserva para cubrir el caso inverso: RTN ilegible pero CAI sí.

create unique index if not exists facturas_rtn_numero_uq
  on facturas (proveedor_rtn, numero_factura)
  where proveedor_rtn is not null and numero_factura is not null;
