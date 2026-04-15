# ChatBot Normativo USACH

Este proyecto implementa un prototipo de **ChatBot** para asesoría de estudiantes de la Facultad de Ingeniería (USACH), desarrollado en **Next.js (frontend)**, **Node.js/Express (backend)** y **PostgreSQL (base de datos)**. El objetivo es facilitar la consulta de normativa institucional mediante lenguaje natural.

---

## 🚀 Requisitos previos

- Node.js v18 o superior
- npm o yarn
- PostgreSQL v14+ instalado localmente
- Git (para clonar el repositorio)

---

## 📦 Instalación

1. Clonar el repositorio:

   ```bash
   git clone https://github.com/TU-USUARIO/chatbot-usach.git -b master
   cd chatbot-usach
   ```

2. Configurar variables de entorno. Crear un archivo .env en la raíz del backend con:

    ```bash
    DB_USER=chatbotuser
    DB_PASSWORD=cp1619comm2k1
    DB_HOST=localhost
    DB_PORT=5432
    DB_NAME=chatbotdb
    GEMINI_API_KEY=TU_API_KEY
    FRONTEND_URL=http://localhost:3000
    FRONTEND_RESET_URL=http://localhost:3000/reset-password
    EMAIL_USER=tu_cuenta@gmail.com
    EMAIL_PASS=tu_password_o_app_password
    EMAIL_SERVICE=gmail
    EMAIL_FROM="Equipo Chatbot USACH <tu_cuenta@gmail.com>"
    PASSWORD_RESET_TOKEN_TTL_MINUTES=60
    ```

### Configuración rápida de JWT para login

1. Genera las claves RSA:

```bash
openssl genpkey -algorithm RSA -out jwt_private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in jwt_private.pem -out jwt_public.pem
```

2. Convierte las claves a formato `.env` con el helper del backend:

```bash
cd backend
npm run jwt:env -- ../jwt_private.pem ../jwt_public.pem
```

3. Copia una de las salidas en `backend/.env`. Puedes usar variables inline (`JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`), rutas (`JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH`) o Base64 (`JWT_PRIVATE_KEY_BASE64` / `JWT_PUBLIC_KEY_BASE64`).

4. Reinicia backend y frontend. El admin raíz de demo se crea con el correo de `ROOT_ADMIN_EMAIL` y contraseña `admin`.

Consulta la guía completa en `doc/jwt-login-setup.md`.

### Cómo obtener `GEMINI_API_KEY`

1. Ingresa a [Google AI Studio](https://aistudio.google.com/) con tu cuenta de Google y abre la sección **API keys**.
2. Crea una nueva API Key y copia el valor generado; no la compartas públicamente.
3. Pega la clave en la variable `GEMINI_API_KEY` de tu archivo `.env` del backend (o en tu configuración de Firebase/IDX) y reinicia el servicio para que tome efecto.

3. Inicializar base de datos (modo local, solo funciona si busca montar por primera vez):

```bash
cd database
chmod u+x pg-up.sh psql.sh
initdb -D .pgdata -U postgres --auth=trust --encoding=UTF8 --locale=C
pg_ctl -D .pgdata -l .pgdata/server.log start -w -o "-h 127.0.0.1 -p 5433 -k $(pwd)/.pgdata"
./pg-up.sh
node setupDatabase.js
```

4. Instalar dependencias:

```bash
cd backend
npm install
npm audit fix
cd ../frontend
npm install
npm audit fix
```

---

## ✅ Camino feliz (npm run dev desde frontend)

Desde `frontend/`, el comando:

```bash
npm run dev
```

1. Arranca PostgreSQL local en `database/.pgdata`.
2. Elige automáticamente un puerto libre (5432, 5433, 5434...).
3. Guarda el puerto real en `database/.pgdata/PORT`.
4. Crea el rol/BD `chatbotdb`, ejecuta `init.sql` y valida tablas.
5. Levanta backend + Next.js en paralelo.

---

## 🧰 PostgreSQL local en `database/.pgdata` (Firebase Studio)

En Firebase Studio / Cloud Workstations se levanta PostgreSQL como un clúster local dentro de `database/.pgdata`.

### Iniciar (camino feliz)

```bash
cd database
chmod u+x pg-up.sh psql.sh
./pg-up.sh
node setupDatabase.js
```

### Arranque manual (primer uso / troubleshooting)

```bash
cd database
chmod u+x pg-up.sh psql.sh

# Inicializa el clúster (solo si .pgdata no existe o está vacío)
initdb -D .pgdata -U postgres --auth=trust --encoding=UTF8 --locale=C
```

Opción A: puerto 5432 (por defecto):

```bash
pg_ctl -D .pgdata -l .pgdata/server.log start -w -o "-h 127.0.0.1 -p5432 -k $(pwd)/.pgdata"
./pg-up.sh
node setupDatabase.js
```

Opción B: puerto 5433 (si 5432 está ocupado)

Si estás ejecutando el repositorio en el mismo PC pero en otra cuenta/workspace en paralelo, puede existir otro PostgreSQL escuchando en 5432.
En ese caso, el arranque con -p5432 puede fallar con:

```
waiting for server to start.... stopped waiting / pg_ctl: could not start server
```

Repite usando 5433:

```bash
pg_ctl -D .pgdata -l .pgdata/server.log start -w -o "-h 127.0.0.1 -p5433 -k $(pwd)/.pgdata"
./pg-up.sh
node setupDatabase.js
```

Nota: `pg-up.sh` intenta 5432 y si no puede, cae a 5433 (y luego 5434-5450). El puerto efectivo queda en `database/.pgdata/PORT` y es el que usa `setupDatabase.js` y el backend.

### Reset total (borra DB local)

```bash
rm -rf database/.pgdata
cd database && ./pg-up.sh
node setupDatabase.js
```

Si el clúster quedó corrupto o el puerto cambió, borrar `database/.pgdata` fuerza un reinicio limpio y la regeneración de `PORT`.

### Error típico: `/run/postgresql/.s.PGSQL.5432.lock` no existe

En Firebase Studio puede no existir `/run/postgresql`. PostgreSQL intenta crear ahí el socket/lock file y falla.
La solución es forzar el socket dentro de `.pgdata` (opción `-k`) o desactivar sockets Unix:

- **Recomendado (socket en `.pgdata`)**: `pg_ctl ... -o "-h 127.0.0.1 -p 5432 -k $PGDATA"`
- **Alternativa (solo TCP)**: `pg_ctl ... -o "-h 127.0.0.1 -p 5432 -c unix_socket_directories=''"`

### Recovery / Reset avanzado (solo si falla)

Dentro de `database/`:

```bash
rm -rf .pgdata
initdb -D .pgdata -U postgres --auth=trust --encoding=UTF8 --locale=C
pg_ctl -D .pgdata -l .pgdata/server.log start -w -o "-h 127.0.0.1 -p 5432 -k $(pwd)/.pgdata"
```
## ☁️ Despliegue separado (Vercel + Render + Supabase)

Si desplegarás frontend y backend por separado, **no debes iniciar PostgreSQL local** (`pg-up.sh`, `initdb`, `pg_ctl`) en Render.
Esos scripts son solo para entorno local/Firebase Studio.

### Frontend en Vercel

- Root Directory: `Frontend`
- Build Command: `npm run build` (ejecuta solo `next build`)
- Start Command: `npm run start` (ejecuta `next start`)
- **No configurar `NODE_ENV` manualmente** en Vercel. Vercel lo define automáticamente (`production` en deploy).
- Variables de entorno:
  - `NEXT_PUBLIC_BACKEND_URL=https://<tu-backend-render>.onrender.com`
  - `NEXT_PUBLIC_ROOT_ADMIN_EMAIL=admin@usach.cl`

### Backend en Render

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `node server.js`
- Health Check Path: `/api/healthz`
- Variables de entorno:
  - `DATABASE_URL=postgres://postgres.<project_ref>:<DB_PASSWORD_URL_ENCODED>@aws-0-<region>.pooler.supabase.com:5432/postgres` (**usar Session pooler de Supabase; evita el host directo IPv6**)
  - `FRONTEND_URL=https://<tu-frontend-vercel>.vercel.app`
  - `DB_SSL=true` (recomendado para conexiones externas administradas)

Con `DATABASE_URL` configurada, el backend omite automáticamente el arranque local con `database/pg-up.sh`. En `NODE_ENV=production`, si `DATABASE_URL` no es válida, el backend falla temprano para evitar intentar PostgreSQL local.

> Importante: no uses la conexión "directa" del proyecto Supabase en Render cuando tengas errores `ENETUNREACH` por IPv6. En ese caso, usa la cadena de **Session pooler** que aparece en el panel `Connect` de Supabase.

#### Error `Tenant or user not found` (Supavisor)

Si el backend ya llega a Supavisor pero responde `Tenant or user not found`, normalmente la `DATABASE_URL` está mal formada.

Checklist exacto para Render:

1. Formato exacto (session mode):  
   `postgres://postgres.<project_ref>:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres`
2. Usuario: `postgres.<project_ref>` (no `postgres` solo).
3. Host: `aws-0-<region>.pooler.supabase.com`.
4. Puerto: `5432`.
5. Password: usar la **Database password real** del proyecto Supabase (no API key, no placeholder).
   - Si aún ves `[YOUR-PASSWORD]` o `<PASSWORD>`, reemplázalo por la contraseña real antes de guardar.
   - Si la contraseña tiene caracteres especiales (`@`, `#`, `/`, `?`, `[`, `]`, etc.), aplicar **URL encoding**.
6. Guardar variable en Render y hacer **Manual Deploy / Clear build cache and deploy**.
7. No reaplicar `database/supabase-init.sql` si las tablas ya existen

### Cargar esquema y datos en Supabase

Las tablas locales (`database/.pgdata`) **no se migran solas** al despliegue.

1. Abre el SQL Editor de Supabase (o ejecuta una migración controlada en tu pipeline).
2. Copia y ejecuta el contenido de `database/supabase-init.sql` (extensiones, tablas, índices y semilla admin).
3. Usa `database/init.sql` solo para instalación local/Firebase Studio.

> Nota: una URL como `192.168.x.x:3000` es una IP privada de red local y no sirve como endpoint público en Render/Vercel. Usa siempre los dominios públicos `*.onrender.com` y `*.vercel.app` (o tu dominio propio).

## ▶️ Ejecución

1. Levantar frontend (secuencia recomendada):

```bash
cd frontend
npm run dev
```

Esto ejecuta primero `database/setupDatabase.js` (arranque de Postgres + esquema) y luego corre backend + Next.js en paralelo con `concurrently -k`.

Si aparece `concurrently: command not found`, asegúrate de ejecutar primero `npm install` dentro de `Frontend/` (instala dependencias locales) o reintenta tras reinstalar dependencias.

El servidor queda disponible en: 
👉 http://localhost:5000/api

La interfaz queda disponible en:
👉 http://localhost:3000

---

## 🧪 Funcionalidades principales

- **Autenticación y roles:** creación de usuarios y asignación de perfiles.
- **Gestión de contraseñas:** cambio seguro (`PUT /api/users/:id/change-password`), solicitud y confirmación de restablecimiento (`POST /api/users/password-reset/*`) con contraseñas temporales enviadas por correo.
- **Subida de documentos:** Carga de documentos PDF con extracción de texto y OCR (Tesseract.js).
- **Consulta normativa vía ChatBot conectado a Gemini API.** (Se requiere API Key).
- **Registro de evaluaciones (endpoint /api/requests/log) con almacenamiento en tabla `evaluation_logs`.**
- **Gestión de solicitudes:** búsqueda, detalle y pasos asociados.

## 🖨️ Flujo de carga y OCR

- Cuando un PDF incluye texto incrustado, el backend lo detecta y guarda automáticamente el contenido.
- Si el PDF es escaneado (sin texto), durante la subida se intenta un OCR automático con Tesseract.js. El resultado informa si el texto se obtuvo o si es necesario procesarlo manualmente.
- En la vista de documentos, los archivos sin texto muestran un aviso y permiten ejecutar el botón **"Procesar OCR"** para reintentar la extracción bajo demanda.

### Demostración sugerida

1. Inicie sesión y diríjase a **Subir Documentos**.
2. Suba un PDF con texto embebido: la respuesta mostrará que no se requirió OCR y el contenido quedará disponible de inmediato.
3. Suba un PDF escaneado (sin OCR previo): el sistema intentará extraer el texto automáticamente. Si no se logra, el documento quedará marcado y podrá ejecutar **"Procesar OCR"** desde la lista de documentos.
4. Ingrese a **Documentos** y verifique ambos archivos: el primero tendrá contenido visible, mientras que el segundo mostrará la alerta que invita a lanzar el OCR manual.

## 📊 Evaluación y pruebas

- Incluye endpoint `/api/requests/stats` para indicadores globales de exactitud, tiempos y errores.
- Caso de prueba real en tabla `evaluation_logs` (ejemplo: ID 1755789721848).
- Encuesta de usabilidad (CSUQ) aplicada a prototipo.
- Chequeo rápido del módulo de chat: `cd backend && npm run test:requests` (no requiere conexión a la base de datos ni credenciales reales de Gemini).

### 📋 Plan de QA de demostración

El siguiente plan permite ejecutar, documentar y presentar una demostración de QA centrada en el flujo de autenticación y la consulta normativa, alineada con buenas prácticas y criterios IEC/ISO 25010.

1. **Objetivo y alcance**
   - Validar que el prototipo cumple con los atributos de calidad relevantes de IEC/ISO 25010 (funcionalidad, seguridad, usabilidad y fiabilidad) durante el inicio de sesión y la navegación posterior.
   - Confirmar que solo es posible autenticar usuarios con credenciales registradas en la base de datos y que no existan accesos accidentales mediante entradas maliciosas.

2. **Entorno de prueba**
   - Backend en Node.js/Express (`backend/server.js`) y frontend en Next.js.
   - Base de datos PostgreSQL inicializada con `database/init.sql`.
   - **Opcional Firebase Functions:** despliegue o emulación con `firebase emulators:start --only functions` para exponer la API Express como función `api` (véase carpeta `functions/`). El Firebase Emulator UI (Firebase Studio) permite invocar manualmente la función y observar logs durante la demo.

3. **Procedimiento recomendado**
   - **Preparación:**
     1. Ejecutar los pasos de instalación y levantar servicios según se describe en este README.
     2. (Opcional) Si se usa Firebase, desde la raíz correr `npm install --prefix functions` y luego `firebase emulators:start --only functions`. En Firebase Studio, verificar que el endpoint `api` enruta a las rutas Express habituales.
   - **Casos de prueba funcionales y de seguridad:**
     1. Crear o confirmar la existencia del usuario demo `ROOT_ADMIN_EMAIL` (por defecto `admin@usach.cl`) en la base (contraseña inicial `admin`).
     2. Iniciar sesión desde el frontend y navegar por las funcionalidades habilitadas para su rol.
     3. Intentar iniciar sesión con credenciales inválidas, cuentas inexistentes y combinaciones alteradas (contraseñas previas, tokens caducados) para comprobar el rechazo.
     4. Probar el restablecimiento y cambio de contraseña verificando que los tokens de recuperación de una sola vez se invalidan tras su uso.
     5. Ejecutar intentos con caracteres especiales y patrones de inyección (`' OR '1'='1`, `<script>`, JSON malformado) para confirmar que la capa de validación evita accesos no autorizados.
   - **Criterios IEC/ISO 25010 aplicados:**
     - *Funcionalidad:* la autenticación solo permite acceso con credenciales válidas; el chatbot responde consultas normativas registrando logs en `evaluation_logs`.
     - *Seguridad:* no se permite acceder a datos restringidos sin autenticación; respuestas de error no exponen información sensible; las contraseñas se gestionan con políticas de cambio y recuperación.
     - *Usabilidad:* mensajes de error claros y formularios accesibles.
     - *Fiabilidad:* el sistema se mantiene estable ante entradas inválidas repetidas, registrando eventos en logs o consola.

4. **Evidencias sugeridas**
   - Capturas de pantalla del frontend, respuestas HTTP (códigos 200/401/403), bitácoras del backend y registros en la tabla `evaluation_logs`.
   - Exportar registros desde Firebase Studio (si se utiliza) para documentar invocaciones a la función `api`.

5. **Registro de responsables**
   - Documentar en una tabla la fecha, nombre y resultado de cada caso de prueba. Este registro puede mantenerse en el mismo README o en un anexo compartido durante la demostración.

6. **Checklist final**
   - Confirmar que el usuario demo `ROOT_ADMIN_EMAIL` (por defecto `admin@usach.cl`) permanece restringido a fines de prototipo.
   - Verificar que no existan credenciales duras en el código y que las variables sensibles se gestionan mediante `.env`.
   - Revisar que las instrucciones de despliegue y autenticación incluyan advertencias de uso exclusivo para demostraciones.

## 📂 Estructura del proyecto

    chatbot-usach/
    ├── backend/        # API en Node.js/Express
    ├── frontend/       # Next.js (interfaz)
    ├── database/       # Scripts SQL e inicialización
    └── README.md

---

## 🗄️ Operación de base de datos local (Firebase Studio)

### Iniciar / verificar

```bash
cd database
chmod u+x pg-up.sh psql.sh
./pg-up.sh
cat .pgdata/PORT
```

### Reset total (borra DB local)

```bash
rm -rf database/.pgdata
cd database && ./pg-up.sh
node setupDatabase.js
```

### Troubleshooting

- **Ver logs del servidor**: `tail -n 200 database/.pgdata/server.log`
- **Socket en ruta inexistente**: el arranque fuerza `-k database/.pgdata` para evitar `/run/postgresql`.
- **Error en índices/DDL**: vuelve a ejecutar `node database/setupDatabase.js` tras corregir `database/init.sql`.

---

## 🔐 Nota sobre el preview URL (401)

Si al abrir el preview URL de Cloud Workstations aparece:
`Permission 'workstations.workstations.use' denied`, la cuenta necesita el rol
**roles/workstations.user** (o superior). Pide al profesor/admin que lo asigne en IAM.

## 👩‍🏫 Uso para revisión

1. Levantar backend y frontend como se indica arriba.
2. Ingresar en navegador a http://localhost:3000
3. Al ser un prototipo, debe ingresar con el correo del usuario configurado en `ROOT_ADMIN_EMAIL` (por defecto `admin@usach.cl`) y contraseña "admin".
4. Registrarse como usuario y probar:
- Crear usuarios y asignar roles (menú administrador).
- Verificar que el sistema envía contraseñas temporales y permite cambiarlas/restablecerlas con los nuevos flujos.
- Subir documentos normativos en PDF.
- Consultar reglamentos desde el chatbot.
- Revisar registros de casos en tabla `evaluation_logs`.

---

## 📖 Referencias normativas

- Normativa Interna USACH
- Contraloría USACH
- Transparencia Activa USACH
- Normativa Reglamentos USACH

## 📝 Nota

Este proyecto es un prototipo académico desarrollado como parte de una memoria de título. Se recomienda utilizar únicamente con fines de demostración.