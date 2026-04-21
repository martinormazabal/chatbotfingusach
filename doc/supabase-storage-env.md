# Configuración de Supabase Storage por `.env`

Este proyecto usa Supabase Storage para guardar PDFs en el bucket `documents` (carpeta lógica `documents/` dentro del path del objeto).

## 1) Variables obligatorias en backend

En `backend/.env` configura:

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_STORAGE_BUCKET=documents
```

> Compatibilidad: si no defines `SUPABASE_STORAGE_BUCKET`, el backend usa `SUPABASE_BUCKET`; si tampoco existe, usa `documents` por defecto.

## 2) Qué valor usar en cada variable

- `SUPABASE_URL`: URL base del proyecto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: llave de servidor (no exponer en frontend).
- `SUPABASE_STORAGE_BUCKET`: nombre exacto del bucket (por ejemplo `documents`).

## 3) Verificación funcional esperada

Al subir un documento, el backend ahora:

1. Lista buckets y valida que exista `SUPABASE_STORAGE_BUCKET`.
2. Sube el PDF a `documents/<timestamp-o-uuid>-nombre.pdf`.
3. Obtiene `publicUrl` desde Supabase.
4. Guarda metadata en DB (`source_url`, `file_url`, `storage_path`).

## 4) Notas operativas

- Si el bucket no existe, la API responde error claro (`Bucket '<nombre>' no existe en Supabase Storage`).
- Si falla DB después de subir, el backend intenta rollback eliminando el archivo en Storage para evitar desincronización.
- En eliminación, primero borra en Storage y luego en DB para mantener consistencia.