# 🔐 resicodeo Cloud — Plan de implementación Zero-Knowledge

## La idea en una frase

Convertir resicodeo en una app con **cuentas reales** donde los datos del usuario están **cifrados de extremo a extremo**. Tú almacenas blobs cifrados que ni tú puedes leer.

## Por qué este modelo es legalmente seguro

Bajo la **LFPDPPP (Ley Federal de Protección de Datos Personales en Posesión de los Particulares)**, almacenar datos cifrados con clave del usuario te coloca en una posición legal mucho más segura: técnicamente operas como un servicio de **almacenamiento opaco**, no como un procesador de datos personales.

Esto es lo que hacen **1Password, Bitwarden, ProtonMail, Tresorit**. Operan globalmente sin problemas regulatorios porque genuinamente no pueden leer los datos de sus usuarios.

---

## La arquitectura completa

```
┌─────────────────────────────────────────┐
│         NAVEGADOR DEL USUARIO           │
│                                         │
│  ┌────────────────────────────────┐    │
│  │  Login: email + password       │    │
│  │  └─→ Acceso a la cuenta        │    │
│  │                                │    │
│  │  Llave maestra (frase secreta) │    │
│  │  └─→ Acceso a los datos        │    │
│  └────────────────────────────────┘    │
│                                         │
│  ┌────────────────────────────────┐    │
│  │  resicodeo (app actual)        │    │
│  │  Datos en localStorage         │    │
│  └────────────────────────────────┘    │
│                                         │
│  ┌────────────────────────────────┐    │
│  │  Sync engine                   │    │
│  │  1. Cifra JSON con master key  │    │
│  │  2. Sube blob a Supabase       │    │
│  │  3. Descarga al cambiar device │    │
│  └────────────────────────────────┘    │
└──────────────┬──────────────────────────┘
               │ HTTPS + JWT
               ▼
┌─────────────────────────────────────────┐
│            SUPABASE                     │
│                                         │
│  TABLA: profiles                        │
│  ├─ user_id (UUID)                      │
│  ├─ email                               │
│  └─ created_at                          │
│                                         │
│  TABLA: encrypted_data                  │
│  ├─ user_id (UUID)                      │
│  ├─ blob_cifrado (TEXT)  ← BASURA       │
│  ├─ updated_at                          │
│  └─ version                             │
│                                         │
│  El servidor NUNCA puede descifrar      │
└─────────────────────────────────────────┘
```

## Las dos capas de seguridad

### Capa 1: Acceso a la cuenta (email + password)
- El usuario se loguea con email y password normal
- Supabase maneja autenticación
- Le permite acceder a SU blob cifrado

### Capa 2: Acceso a los datos (master password / frase secreta)
- Esta es **diferente** del password de login
- NUNCA se envía al servidor
- Se usa solo en el navegador para cifrar/descifrar
- Si el usuario la olvida, sus datos son **irrecuperables** (es la regla del juego)

## Por qué dos passwords

**Si fuera solo un password:**
- Necesitarías enviarlo al servidor para autenticar
- O derivar la llave de cifrado del mismo password
- En ambos casos, el servidor potencialmente podría descifrar

**Con dos passwords:**
- El de login solo da acceso a la cuenta (estilo Gmail)
- El de cifrado nunca toca el servidor
- Es el modelo que usan los mejores password managers

---

## Stack técnico

| Componente | Tecnología | Costo |
|---|---|---|
| Hosting frontend | Vercel o GitHub Pages | $0 |
| Backend + Auth | Supabase | $0 hasta 50K MAU |
| Base de datos | PostgreSQL (incluido en Supabase) | $0 |
| Cifrado | Web Crypto API (nativo del navegador) | $0 |
| Email transaccional | Resend | $0 hasta 3K/mes |
| Dominio | Namecheap | ~$200 MXN/año |

**Total mensual:** $0-50 MXN inicial. $200-500 MXN cuando crezcas.

---

## Algoritmos de cifrado usados

### Para derivar la llave del password
**PBKDF2** con 600,000 iteraciones + SHA-256

```javascript
// El navegador toma la frase del usuario y la convierte en una llave criptográfica
// 600K iteraciones hace que aún si alguien obtiene los datos cifrados, 
// hacer fuerza bruta sobre el password es prohibitivamente costoso
```

### Para cifrar los datos
**AES-GCM** con llaves de 256 bits

```javascript
// Estándar mundial. Lo usan bancos, gobiernos, militares.
// Velocidad: cifrar 100MB toma ~200ms en celular típico
```

### Para autenticación
**Supabase Auth** con JWT
- Email + password (con bcrypt en el servidor)
- Refresh tokens
- Magic links opcional

---

## Lo que NO podemos hacer (y está bien)

❌ **Recuperación de password sin pérdida de datos**  
Si el usuario olvida su frase secreta, los datos son basura. Punto. Esto es lo que hace seguro el modelo.

❌ **Analytics sobre los datos**  
No podemos saber cuánto cobran los usuarios en agregado, ni hacer recomendaciones automáticas.

❌ **Compartir datos entre cuentas**  
No hay "modo equipo" sin perder zero-knowledge.

❌ **Soporte técnico que vea sus datos**  
"No puedo abrir mi app" → "lo siento, no puedo ver tus datos para ayudarte" (igual que Bitwarden).

---

## Lo que SÍ podemos hacer

✅ **Sincronización entre dispositivos**  
PC, celular, tablet — todos los datos sincronizados.

✅ **Backup automático en la nube**  
El usuario nunca pierde datos por borrar caché o cambiar navegador.

✅ **Historial de versiones**  
Si quieres, puedes guardar las últimas N versiones del blob para deshacer cambios.

✅ **Acceso multi-cuenta**  
Si el usuario tiene varios negocios, puede tener múltiples cuentas.

✅ **Verificación de integridad**  
HMAC para detectar si alguien intentó modificar el blob.

---

## Roadmap de implementación

### Fase 1: Setup (1 sesión, ~2 horas)
- Crear proyecto Supabase
- Schema de base de datos
- Politicas Row-Level Security (RLS)
- Variables de entorno

### Fase 2: Código de cifrado (1 sesión, ~3 horas)
- Módulo de cifrado en JS
- Tests del cifrado (cifrar → descifrar → verificar)
- UI para crear/configurar master password

### Fase 3: Integración (2 sesiones, ~6 horas)
- Login/registro UI
- Modificar app para sync con servidor
- Indicador visual de "sincronizando"
- Manejo de conflictos (si edita en 2 dispositivos)

### Fase 4: Legal + Deploy (1 sesión, ~2 horas)
- Aviso de privacidad
- Términos y condiciones
- Página de cookies
- Deploy a Vercel
- Configurar dominio

**Total: ~13 horas de trabajo, repartidas en 5 sesiones.**

---

## Próximo paso

Lee `01-setup-supabase.md` para configurar tu cuenta de Supabase.
