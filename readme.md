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

3. Inicializar base de datos:

    ```bash
    cd database
    psql -U postgres -f init.sql
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