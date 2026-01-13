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
   git clone https://github.com/TU-USUARIO/chatbot-usach.git
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

### Cómo obtener `GEMINI_API_KEY`

1. Ingresa a [Google AI Studio](https://aistudio.google.com/) con tu cuenta de Google y abre la sección **API keys**.
2. Crea una nueva API Key y copia el valor generado; no la compartas públicamente.
3. Pega la clave en la variable `GEMINI_API_KEY` de tu archivo `.env` del backend (o en tu configuración de Firebase/IDX) y reinicia el servicio para que tome efecto.

3. Inicializar base de datos:

    ```bash
    cd database
    psql -U postgres -f bootstrap.sql
    psql -U chatbotuser -d chatbotdb -f init.sql
    ```

4. Instalar dependencias:

    ```bash
    cd backend
    npm install
    cd ../frontend
    npm install
    ```

## ▶️ Ejecución

1. Levantar frontend:

    ```bash
    cd frontend
    npm run dev
    ```

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
     1. Crear o confirmar la existencia del usuario demo `admin@usach.cl` en la base (contraseña inicial `admin`).
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
   - Confirmar que el usuario demo `admin@usach.cl` permanece restringido a fines de prototipo.
   - Verificar que no existan credenciales duras en el código y que las variables sensibles se gestionan mediante `.env`.
   - Revisar que las instrucciones de despliegue y autenticación incluyan advertencias de uso exclusivo para demostraciones.

## 📂 Estructura del proyecto

    chatbot-usach/
    ├── backend/        # API en Node.js/Express
    ├── frontend/       # Next.js (interfaz)
    ├── database/       # Scripts SQL e inicialización
    └── README.md

## 👩‍🏫 Uso para revisión

1. Levantar backend y frontend como se indica arriba.
2. Ingresar en navegador a http://localhost:3000
3. Al ser un prototipo, debe ingresar con el correo del usuario "admin@usach.cl" y contraseña "admin".
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