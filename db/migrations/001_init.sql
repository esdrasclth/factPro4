-- factPro4 — esquema inicial
-- Facturas de Honduras (SAR). Una fila por factura, solo encabezado.

create extension if not exists pgcrypto;

create table if not exists facturas (
  id                      uuid primary key default gen_random_uuid(),

  -- Emisor
  proveedor_nombre        text,
  proveedor_rtn           text,
  proveedor_direccion     text,

  -- Identificación fiscal
  numero_factura          text,
  cai                     text,
  rango_autorizado_desde  text,
  rango_autorizado_hasta  text,
  fecha_limite_emision    date,

  -- Documento
  fecha_emision           date,
  cliente_nombre          text,
  cliente_rtn             text,
  moneda                  text default 'HNL',

  -- Montos
  subtotal                numeric(14,2),
  descuentos              numeric(14,2),
  importe_exento          numeric(14,2),
  importe_exonerado       numeric(14,2),
  importe_gravado_15      numeric(14,2),
  importe_gravado_18      numeric(14,2),
  isv_15                  numeric(14,2),
  isv_18                  numeric(14,2),
  total                   numeric(14,2),

  -- Trazabilidad
  imagen_key              text not null,
  estado                  text not null default 'pendiente_revision'
                            check (estado in ('pendiente_revision','confirmada','descartada')),
  extraccion_raw          jsonb,
  extraccion_modelo       text,
  extraccion_ms           integer,
  extraccion_error        text,
  campos_corregidos       text[] default '{}',
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now()
);

create index if not exists facturas_proveedor_rtn_idx on facturas (proveedor_rtn);
create index if not exists facturas_fecha_emision_idx  on facturas (fecha_emision desc);
create index if not exists facturas_estado_idx         on facturas (estado);
create index if not exists facturas_creado_en_idx      on facturas (creado_en desc);

-- Evita guardar dos veces la misma factura
create unique index if not exists facturas_cai_numero_uq
  on facturas (cai, numero_factura)
  where cai is not null and numero_factura is not null;

-- actualizado_en automático
create or replace function set_actualizado_en() returns trigger as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists facturas_set_actualizado_en on facturas;
create trigger facturas_set_actualizado_en
  before update on facturas
  for each row execute function set_actualizado_en();
