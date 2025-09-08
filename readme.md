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

2. Configurar variables de entorno. Crear un archivo .env en la raíz del backend con:

    DB_USER=chatbotuser
    DB_PASSWORD=cp1619comm2k1
    DB_HOST=localhost
    DB_PORT=5432
    DB_NAME=chatbotdb
    GEMINI_API_KEY=TU_API_KEY
    FRONTEND_URL=http://localhost:3000

3. Inicializar base de datos:

    cd database
    psql -U postgres -f init.sql

4. Instalar dependencias:

    cd backend
    npm install
    cd ../frontend
    npm install

## ▶️ Ejecución

1. Levantar backend:

    cd backend
    npm run dev

El servidor queda disponible en: 
👉 http://localhost:5000/api

2. Levantar frontend:

    cd frontend
    npm run dev

La interfaz queda disponible en:
👉 http://localhost:3000

---

## 🧪 Funcionalidades principales

- Autenticación y roles: creación de usuarios y asignación de perfiles.
- Carga de documentos PDF con extracción de texto y OCR (Tesseract.js).
- Consulta normativa vía ChatBot conectado a Gemini API. (Se requiere API Key).
- Registro de evaluaciones (endpoint /api/requests/log) con almacenamiento en tabla `evaluation_logs`.
- Gestión de solicitudes: búsqueda, detalle y pasos asociados.

## 📊 Evaluación y pruebas

- Incluye endpoint `/api/requests/stats` para indicadores globales de exactitud, tiempos y errores.
- Caso de prueba real en tabla `evaluation_logs` (ejemplo: ID 1755789721848).
- Encuesta de usabilidad (CSUQ) aplicada a prototipo.

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