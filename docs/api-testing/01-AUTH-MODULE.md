# 🔐 API Testing - Módulo de Autenticación (Auth)

**Módulo:** Authentication  
**Base URL:** `http://localhost:3000/auth`  
**Descripción:** Gestión de autenticación, registro, login y tokens JWT

---

## 📋 Índice de Tests

- [x] ✅ 1. Registro de Usuario (POST /auth/register)
- [x] ✅ 2. Login de Usuario (POST /auth/login)
- [x] ✅ 3. Refresh Token (POST /auth/refresh)
- [x] ✅ 4. Obtener Perfil (GET /auth/profile)
- [x] ✅ 5. Obtener Usuario Actual (GET /auth/me)
- [x] ✅ 6. Logout (POST /auth/logout)

---

## Variables de Entorno

```bash
export BASE_URL="http://localhost:3000"
export TOKEN=""
export REFRESH_TOKEN=""
export USER_ID=""
```

---

## 1️⃣ Registro de Usuario

### ✅ Test 1.1: Registro exitoso de nuevo usuario

**Endpoint:** `POST /auth/register`  
**Autenticación:** No requerida (público)

**Request Body:**

```json
{
  "email": "test.user@example.com",
  "password": "Test123!@#",
  "firstName": "Test",
  "lastName": "User",
  "phoneNumber": "+1234567890",
  "dateOfBirth": "1990-01-01",
  "language": "es",
  "timezone": "America/Argentina/Buenos_Aires"
}
```

**Comando curl:**

```bash
curl -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.user@example.com",
    "password": "Test123!@#",
    "firstName": "Test",
    "lastName": "User",
    "phoneNumber": "+1234567890",
    "dateOfBirth": "1990-01-01",
    "language": "es",
    "timezone": "America/Argentina/Buenos_Aires"
  }' | jq '.'
```

**Respuesta Esperada (201 Created):**

```json
{
  "user": {
    "id": "uuid-here",
    "email": "test.user@example.com",
    "firstName": "Test",
    "lastName": "User",
    "fullName": "Test User",
    "phoneNumber": "+1234567890",
    "dateOfBirth": "1990-01-01",
    "language": "es",
    "timezone": "America/Argentina/Buenos_Aires",
    "isActive": true,
    "emailVerifiedAt": null,
    "createdAt": "2025-10-11T...",
    "updatedAt": "2025-10-11T..."
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

**Guardar tokens:**

```bash
# Extraer y guardar el accessToken
export TOKEN=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.user@example.com",
    "password": "Test123!@#",
    "firstName": "Test",
    "lastName": "User"
  }' | jq -r '.accessToken')

# Extraer y guardar el refreshToken
export REFRESH_TOKEN=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.user@example.com",
    "password": "Test123!@#",
    "firstName": "Test",
    "lastName": "User"
  }' | jq -r '.refreshToken')

echo "Token guardado: $TOKEN"
```

**Checklist:**

- [ ] Status code es 201
- [ ] Respuesta contiene `user` object
- [ ] Respuesta contiene `accessToken`
- [ ] Respuesta contiene `refreshToken`
- [ ] `user.email` coincide con el enviado
- [ ] `user.isActive` es `true`
- [ ] `accessToken` es un JWT válido

---

### ❌ Test 1.2: Registro con email duplicado (409 Conflict)

**Comando curl:**

```bash
curl -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.user@example.com",
    "password": "Test123!@#",
    "firstName": "Test",
    "lastName": "User"
  }' | jq '.'
```

**Respuesta Esperada (409 Conflict):**

```json
{
  "statusCode": 409,
  "message": "User with this email already exists",
  "error": "Conflict"
}
```

**Checklist:**

- [ ] Status code es 409
- [ ] Mensaje indica email duplicado

---

### ❌ Test 1.3: Registro con datos inválidos (400 Bad Request)

**Comando curl:**

```bash
# Email inválido
curl -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "invalid-email",
    "password": "Test123!@#",
    "firstName": "Test",
    "lastName": "User"
  }' | jq '.'

# Password muy corta
curl -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test2@example.com",
    "password": "123",
    "firstName": "Test",
    "lastName": "User"
  }' | jq '.'
```

**Respuesta Esperada (400 Bad Request):**

```json
{
  "statusCode": 400,
  "message": ["email must be a valid email address", "password must be at least 8 characters long"],
  "error": "Bad Request"
}
```

**Checklist:**

- [ ] Status code es 400
- [ ] Mensaje contiene validaciones específicas

---

## 2️⃣ Login de Usuario

### ✅ Test 2.1: Login exitoso con credenciales válidas

**Endpoint:** `POST /auth/login`  
**Autenticación:** No requerida (público)

**Request Body:**

```json
{
  "email": "test.user@example.com",
  "password": "Test123!@#"
}
```

**Comando curl:**

```bash
curl -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.user@example.com",
    "password": "Test123!@#"
  }' | jq '.'
```

**Respuesta Esperada (200 OK):**

```json
{
  "user": {
    "id": "uuid-here",
    "email": "test.user@example.com",
    "firstName": "Test",
    "lastName": "User",
    "fullName": "Test User",
    "isActive": true,
    "lastLoginAt": "2025-10-11T..."
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

**Guardar tokens desde login:**

```bash
export TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.user@example.com",
    "password": "Test123!@#"
  }' | jq -r '.accessToken')

export REFRESH_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.user@example.com",
    "password": "Test123!@#"
  }' | jq -r '.refreshToken')

echo "Token guardado: $TOKEN"
```

**Checklist:**

- [ ] Status code es 200
- [ ] Respuesta contiene `accessToken` y `refreshToken`
- [ ] `user.lastLoginAt` está actualizado
- [ ] Token es válido y puede usarse para endpoints protegidos

---

### ❌ Test 2.2: Login con credenciales incorrectas (401 Unauthorized)

**Comando curl:**

```bash
curl -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.user@example.com",
    "password": "WrongPassword123"
  }' | jq '.'
```

**Respuesta Esperada (401 Unauthorized):**

```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

**Checklist:**

- [ ] Status code es 401
- [ ] Mensaje indica credenciales inválidas

---

### ❌ Test 2.3: Login con usuario inexistente (401 Unauthorized)

**Comando curl:**

```bash
curl -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nonexistent@example.com",
    "password": "Test123!@#"
  }' | jq '.'
```

**Respuesta Esperada (401 Unauthorized):**

```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

**Checklist:**

- [ ] Status code es 401
- [ ] No revela si el email existe o no (seguridad)

---

## 3️⃣ Refresh Token

### ✅ Test 3.1: Refrescar token exitosamente

**Endpoint:** `POST /auth/refresh`  
**Autenticación:** No requerida (usa refreshToken en body)

**Request Body:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Comando curl:**

```bash
curl -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{
    \"refreshToken\": \"$REFRESH_TOKEN\"
  }" | jq '.'
```

**Respuesta Esperada (200 OK):**

```json
{
  "user": {
    "id": "uuid-here",
    "email": "test.user@example.com",
    "firstName": "Test",
    "lastName": "User"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

**Actualizar token:**

```bash
export TOKEN=$(curl -s -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}" | jq -r '.accessToken')
```

**Checklist:**

- [ ] Status code es 200
- [ ] Nuevo `accessToken` generado
- [ ] Nuevo `refreshToken` generado (opcional según implementación)
- [ ] Token anterior queda invalidado

---

### ❌ Test 3.2: Refresh con token inválido (401 Unauthorized)

**Comando curl:**

```bash
curl -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "invalid-token-here"
  }' | jq '.'
```

**Respuesta Esperada (401 Unauthorized):**

```json
{
  "statusCode": 401,
  "message": "Invalid or expired refresh token",
  "error": "Unauthorized"
}
```

**Checklist:**

- [ ] Status code es 401
- [ ] Mensaje indica token inválido

---

## 4️⃣ Obtener Perfil del Usuario Autenticado

### ✅ Test 4.1: Obtener perfil con token válido

**Endpoint:** `GET /auth/profile`  
**Autenticación:** Bearer Token (JWT)

**Comando curl:**

```bash
curl -X GET "$BASE_URL/auth/profile" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

**Respuesta Esperada (200 OK):**

```json
{
  "id": "uuid-here",
  "email": "test.user@example.com",
  "firstName": "Test",
  "lastName": "User",
  "fullName": "Test User",
  "phoneNumber": "+1234567890",
  "dateOfBirth": "1990-01-01",
  "language": "es",
  "timezone": "America/Argentina/Buenos_Aires",
  "isActive": true,
  "emailVerifiedAt": null,
  "lastLoginAt": "2025-10-11T...",
  "createdAt": "2025-10-11T...",
  "updatedAt": "2025-10-11T..."
}
```

**Checklist:**

- [ ] Status code es 200
- [ ] Respuesta contiene todos los campos del usuario
- [ ] Datos coinciden con el usuario autenticado

---

### ❌ Test 4.2: Obtener perfil sin token (401 Unauthorized)

**Comando curl:**

```bash
curl -X GET "$BASE_URL/auth/profile" | jq '.'
```

**Respuesta Esperada (401 Unauthorized):**

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

**Checklist:**

- [ ] Status code es 401
- [ ] Acceso denegado sin autenticación

---

### ❌ Test 4.3: Obtener perfil con token inválido (401 Unauthorized)

**Comando curl:**

```bash
curl -X GET "$BASE_URL/auth/profile" \
  -H "Authorization: Bearer invalid-token-here" | jq '.'
```

**Respuesta Esperada (401 Unauthorized):**

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

**Checklist:**

- [ ] Status code es 401
- [ ] Token inválido rechazado

---

## 5️⃣ Obtener Usuario Actual (Endpoint Ligero)

### ✅ Test 5.1: Obtener información básica del usuario

**Endpoint:** `GET /auth/me`  
**Autenticación:** Bearer Token (JWT)

**Comando curl:**

```bash
curl -X GET "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

**Respuesta Esperada (200 OK):**

```json
{
  "id": "uuid-here",
  "email": "test.user@example.com",
  "firstName": "Test",
  "lastName": "User",
  "fullName": "Test User",
  "isActive": true
}
```

**Checklist:**

- [ ] Status code es 200
- [ ] Respuesta contiene solo campos básicos (más ligera que /profile)
- [ ] No incluye campos sensibles innecesarios

---

## 6️⃣ Logout del Usuario

### ✅ Test 6.1: Logout exitoso

**Endpoint:** `POST /auth/logout`  
**Autenticación:** Bearer Token (JWT)

**Comando curl:**

```bash
curl -X POST "$BASE_URL/auth/logout" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

**Respuesta Esperada (200 OK):**

```json
{
  "message": "Successfully logged out. Please discard your tokens.",
  "success": true
}
```

**Checklist:**

- [ ] Status code es 200
- [ ] Mensaje confirma logout exitoso
- [ ] Cliente debe descartar tokens localmente

---

### ❌ Test 6.2: Logout sin autenticación (401 Unauthorized)

**Comando curl:**

```bash
curl -X POST "$BASE_URL/auth/logout" | jq '.'
```

**Respuesta Esperada (401 Unauthorized):**

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

**Checklist:**

- [ ] Status code es 401
- [ ] Logout requiere autenticación

---

## 🧪 Flujo Completo de Testing

### Script de Testing Automatizado

```bash
#!/bin/bash
# Script de testing completo para Auth Module

BASE_URL="http://localhost:3000"

echo "=== 🔐 Testing Auth Module ==="
echo ""

# 1. Registro
echo "1️⃣ Registrando nuevo usuario..."
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "automated.test@example.com",
    "password": "Test123!@#",
    "firstName": "Automated",
    "lastName": "Test"
  }')

TOKEN=$(echo $REGISTER_RESPONSE | jq -r '.accessToken')
REFRESH_TOKEN=$(echo $REGISTER_RESPONSE | jq -r '.refreshToken')

if [ "$TOKEN" != "null" ]; then
  echo "✅ Registro exitoso"
else
  echo "❌ Registro falló"
  exit 1
fi

# 2. Login
echo "2️⃣ Login con credenciales..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "automated.test@example.com",
    "password": "Test123!@#"
  }')

NEW_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')

if [ "$NEW_TOKEN" != "null" ]; then
  echo "✅ Login exitoso"
  TOKEN=$NEW_TOKEN
else
  echo "❌ Login falló"
fi

# 3. Obtener perfil
echo "3️⃣ Obteniendo perfil..."
PROFILE_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/profile" \
  -H "Authorization: Bearer $TOKEN")

EMAIL=$(echo $PROFILE_RESPONSE | jq -r '.email')

if [ "$EMAIL" == "automated.test@example.com" ]; then
  echo "✅ Perfil obtenido correctamente"
else
  echo "❌ Error al obtener perfil"
fi

# 4. Refresh token
echo "4️⃣ Refrescando token..."
REFRESH_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")

REFRESHED_TOKEN=$(echo $REFRESH_RESPONSE | jq -r '.accessToken')

if [ "$REFRESHED_TOKEN" != "null" ]; then
  echo "✅ Token refrescado exitosamente"
else
  echo "❌ Error al refrescar token"
fi

# 5. Logout
echo "5️⃣ Cerrando sesión..."
LOGOUT_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/logout" \
  -H "Authorization: Bearer $TOKEN")

SUCCESS=$(echo $LOGOUT_RESPONSE | jq -r '.success')

if [ "$SUCCESS" == "true" ]; then
  echo "✅ Logout exitoso"
else
  echo "❌ Error en logout"
fi

echo ""
echo "=== ✅ Testing completado ==="
```

---

## 📝 Notas Importantes

### Seguridad

- ✅ Todos los passwords deben cumplir requisitos mínimos (8+ caracteres)
- ✅ Los tokens JWT tienen expiración (3600 segundos = 1 hora por defecto)
- ✅ Los refresh tokens permiten obtener nuevos access tokens sin re-login
- ✅ El logout es client-side (servidor no mantiene blacklist de tokens)

### Credenciales de Testing

```
Email: admin@test.com
Password: Admin123!@#
Rol: Admin

Email: user@test.com
Password: User123!@#
Rol: User
```

### Headers Comunes

```
Content-Type: application/json
Authorization: Bearer <token>
```

---

**Estado del Módulo:** ✅ Completado  
**Tests Totales:** 15  
**Tests Críticos:** 6  
**Última Actualización:** 2025-10-11
