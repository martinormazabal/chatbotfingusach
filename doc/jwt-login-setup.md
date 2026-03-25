# Configuración JWT y acceso al login

Esta guía deja **JWT activo** y, al mismo tiempo, facilita entrar al sistema durante desarrollo o demo.

## 1. Usuario administrador por defecto

La base de datos crea o actualiza automáticamente el usuario raíz definido por `ROOT_ADMIN_EMAIL` y le deja la contraseña `admin` cuando se ejecuta la inicialización de `database/init.sql`.

- Correo por defecto: `admin@usach.cl`
- Contraseña por defecto: `admin`

Si cambias `ROOT_ADMIN_EMAIL`, vuelve a ejecutar la inicialización para regenerar o actualizar ese admin.

## 2. Generar claves RSA

Ejecuta exactamente estos comandos en la raíz del repositorio o dentro de `backend/`:

```bash
openssl genpkey -algorithm RSA -out jwt_private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in jwt_private.pem -out jwt_public.pem
```

## 3. Convertir las claves a formato usable en `.env`

El backend ahora acepta **tres formatos**:

1. `JWT_PRIVATE_KEY` y `JWT_PUBLIC_KEY` con saltos `\n` escapados.
2. `JWT_PRIVATE_KEY_PATH` y `JWT_PUBLIC_KEY_PATH` apuntando a los archivos `.pem`.
3. `JWT_PRIVATE_KEY_BASE64` y `JWT_PUBLIC_KEY_BASE64` en Base64.

Para no hacerlo a mano, ejecuta:

```bash
cd backend
npm run jwt:env -- ../jwt_private.pem ../jwt_public.pem
```

Si generaste los archivos directamente dentro de `backend/`, basta con:

```bash
cd backend
npm run jwt:env
```

El comando imprimirá bloques listos para pegar en `backend/.env`.

## 4. Ejemplo recomendado de `.env`

### Opción A: usar rutas a los archivos PEM

```env
JWT_PRIVATE_KEY_PATH=/ruta/completa/jwt_private.pem
JWT_PUBLIC_KEY_PATH=/ruta/completa/jwt_public.pem
```

Esta es la opción más simple para desarrollo local porque no debes pegar claves largas en una sola línea.

### Opción B: usar PEM inline en `.env`

```env
JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\nMIIBI...\n-----END PUBLIC KEY-----
```

### Opción C: usar Base64

```env
JWT_PRIVATE_KEY_BASE64=LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t...
JWT_PUBLIC_KEY_BASE64=LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0...
```

## 5. Variables mínimas sugeridas para demo

```env
ROOT_ADMIN_EMAIL=admin@usach.cl
JWT_ISSUER=chatbot-fing-usach
JWT_AUDIENCE=chatbot-clients
JWT_ACCESS_EXP=15m
JWT_REFRESH_EXP=30d
JWT_REFRESH_COOKIE_NAME=refresh_token
JWT_REFRESH_COOKIE_SAMESITE=strict
JWT_COOKIE_SECURE=false
```

Y agrega una de las tres opciones de claves del punto anterior.

## 6. Cómo entrar al sistema después de configurar JWT

1. Asegúrate de que la base de datos esté inicializada.
2. Reinicia backend y frontend para que carguen el nuevo `.env`.
3. Entra a `/login`.
4. Usa el admin raíz:
   - correo: `admin@usach.cl` o el valor de `ROOT_ADMIN_EMAIL`
   - contraseña: `admin`

## 7. Si no puedes entrar con `admin`

Verifica, en este orden:

1. Que `ROOT_ADMIN_EMAIL` en `backend/.env` coincida con el correo que intentas usar.
2. Que corriste `database/setupDatabase.js` o el flujo de arranque que reaplica `database/init.sql`.
3. Que backend haya reiniciado después de cambiar las claves JWT.
4. Que no estés copiando mal las claves PEM dentro de `.env`.
5. Que el usuario no haya quedado bloqueado temporalmente por intentos fallidos; en ese caso espera el tiempo definido por `AUTH_LOCK_MINUTES`.

## 8. Qué cambió en el proyecto

- El backend acepta claves JWT por **PEM inline**, **ruta a archivo** o **Base64**.
- Se agregó un helper para generar automáticamente valores listos para `.env`.
- El login del frontend ahora guarda también el `accessToken` y muestra el error exacto devuelto por backend, facilitando el diagnóstico.