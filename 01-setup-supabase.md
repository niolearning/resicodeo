# 📦 Paso 1: Configurar Supabase

Supabase es la plataforma que va a manejar:
- Autenticación de usuarios (email + password)
- Almacenamiento de los blobs cifrados
- Base de datos PostgreSQL

**Costo:** $0 hasta 50,000 usuarios activos al mes. Después escala con planes razonables.

---

## 1. Crear cuenta de Supabase

1. Ve a [supabase.com](https://supabase.com)
2. Click en **"Start your project"**
3. Inicia sesión con GitHub (lo más fácil) o crea una cuenta con email
4. Acepta los términos

⏱ Tiempo: 2 minutos.

---

## 2. Crear el proyecto

1. Click en **"New project"**
2. Llena los datos:
   - **Organization:** elige tu organización (o crea una nueva)
   - **Name:** `resicodeo`
   - **Database Password:** genera una password fuerte y **GUÁRDALA** (la usarás para el dashboard)
   - **Region:** elige `East US (Northern Virginia)` o `West US (Oregon)` — más cercano a México
   - **Pricing Plan:** Free tier
3. Click **"Create new project"**

⏱ Espera ~2 minutos a que se aprovisione.

---

## 3. Obtener las credenciales del proyecto

Una vez creado el proyecto:

1. Ve a **"Project Settings"** (ícono de engranaje abajo a la izquierda)
2. Click en **"API"**
3. **GUARDA** estos valores que vas a necesitar:

```
Project URL:        https://xxxxxxxxx.supabase.co
anon public key:    eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

⚠️ **El `anon key` es público y va en el frontend — está bien.** No es secreto, es un identificador del proyecto.

⚠️ **NO uses el `service_role` key en el frontend nunca.** Ese sí es secreto y solo se usa para tareas administrativas en backend.

---

## 4. Configurar el Schema de la base de datos

Ve a **"SQL Editor"** (ícono de terminal a la izquierda) y ejecuta este SQL:

```sql
-- ============================================
-- RESICODEO CLOUD: Schema de base de datos
-- Modelo Zero-Knowledge
-- ============================================

-- Tabla 1: Perfiles de usuario
-- Solo guardamos email y metadata. NUNCA datos fiscales.
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  
  -- Información del cifrado (no comprometedora)
  encryption_salt TEXT NOT NULL,  -- Salt para PBKDF2, no es la llave
  encryption_check TEXT NOT NULL, -- Para verificar que la frase secreta es correcta
  
  -- Plan del usuario (free / pro)
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'lifetime')),
  plan_expires_at TIMESTAMPTZ
);

-- Tabla 2: Blobs cifrados de cada usuario
-- Aquí van los datos. Para el servidor son texto ilegible.
CREATE TABLE encrypted_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- El blob cifrado en base64
  ciphertext TEXT NOT NULL,
  
  -- IV (initialization vector) usado en el cifrado
  iv TEXT NOT NULL,
  
  -- Versión del schema de datos (para migraciones futuras)
  data_version INTEGER DEFAULT 1,
  
  -- Hash para verificar integridad
  data_hash TEXT NOT NULL,
  
  -- Tamaño del blob (no comprometedor, útil para limits)
  blob_size INTEGER NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsquedas rápidas por usuario
CREATE INDEX idx_encrypted_data_user_id ON encrypted_data(user_id);
CREATE INDEX idx_encrypted_data_updated ON encrypted_data(user_id, updated_at DESC);

-- Tabla 3: Historial de versiones (opcional, para "deshacer")
-- Guardamos las últimas N versiones del blob para que el usuario pueda restaurar
CREATE TABLE encrypted_data_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  data_hash TEXT NOT NULL,
  blob_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_history_user_created ON encrypted_data_history(user_id, created_at DESC);

-- Tabla 4: Log de actividad (para seguridad/auditoría)
-- Solo guardamos eventos no comprometedores
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'login', 'sync_upload', 'sync_download', 'password_change', etc.
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_user ON activity_log(user_id, created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (CRÍTICO)
-- ============================================
-- Sin esto, cualquier usuario podría leer datos de otros.
-- Estas políticas son LA capa de seguridad principal.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_data_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Policies para profiles
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policies para encrypted_data
CREATE POLICY "Users can view only their own data"
  ON encrypted_data FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own data"
  ON encrypted_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own data"
  ON encrypted_data FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own data"
  ON encrypted_data FOR DELETE
  USING (auth.uid() = user_id);

-- Policies para historial
CREATE POLICY "Users can view their own history"
  ON encrypted_data_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert history"
  ON encrypted_data_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policies para activity log
CREATE POLICY "Users can view their own activity"
  ON activity_log FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================
-- FUNCIÓN: Auto-crear profile al registrarse
-- ============================================
-- Cuando alguien se registra con auth.signUp(), 
-- esta función crea automáticamente su row en profiles

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, encryption_salt, encryption_check)
  VALUES (
    NEW.id,
    NEW.email,
    -- Estos campos se llenarán al primer setup de la frase secreta
    '',
    ''
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- FUNCIÓN: Limitar historial a N versiones
-- ============================================
-- Cada vez que se inserta una nueva versión, borrar las viejas
-- (mantener solo las últimas 10)

CREATE OR REPLACE FUNCTION trim_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM encrypted_data_history
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM encrypted_data_history
      WHERE user_id = NEW.user_id
      ORDER BY created_at DESC
      LIMIT 10
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trim_history_on_insert
  AFTER INSERT ON encrypted_data_history
  FOR EACH ROW EXECUTE FUNCTION trim_history();

-- ============================================
-- FUNCIÓN: Actualizar updated_at automáticamente
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_encrypted_data_updated_at
  BEFORE UPDATE ON encrypted_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_last_sync
  BEFORE UPDATE ON encrypted_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VERIFICACIÓN
-- ============================================
-- Ejecuta esto para confirmar que todo se creó bien:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('profiles', 'encrypted_data', 'encrypted_data_history', 'activity_log');
```

Ejecuta el SQL completo. Deberías ver al final:
```
table_name
─────────────────────────
activity_log
encrypted_data
encrypted_data_history
profiles
```

✅ Si ves las 4 tablas, el schema está listo.

---

## 5. Configurar autenticación

1. Ve a **"Authentication"** → **"Providers"** (en el menú izquierdo)
2. **Email** debe estar habilitado por defecto. Verifica:
   - ✅ Enable Email Sign Up
   - ✅ Confirm email (recomendado, fuerza verificación)
   - ⏱ Email expiry: 3600 (1 hora)
3. **Magic Link** opcional (puedes habilitarlo si quieres permitir login sin password también)

### Configurar URL de redirección

Ve a **"Authentication"** → **"URL Configuration"**:

```
Site URL: https://tunombre.github.io/resicodeo
   (o tu dominio cuando lo tengas)

Redirect URLs (agrega estas):
- http://localhost:8000
- http://localhost:3000  
- https://tunombre.github.io/resicodeo
- https://resicodeo.com (cuando tengas dominio)
```

---

## 6. Configurar plantillas de email

Ve a **"Authentication"** → **"Email Templates"**.

Personaliza al menos:
- **Confirm signup** — el email cuando un usuario se registra
- **Reset password** — para recuperar contraseña de cuenta

⚠️ **Importante:** estos emails son para recuperar **acceso a la cuenta**, NO para recuperar la frase secreta de cifrado. Si el usuario olvida la frase secreta, los datos se pierden.

Ejemplo de plantilla "Confirm signup" personalizada:

```html
<h2>Confirma tu cuenta de resicodeo</h2>
<p>Hola,</p>
<p>Gracias por registrarte en resicodeo. Confirma tu correo dando click aquí:</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar mi cuenta</a></p>
<p>Si no fuiste tú, puedes ignorar este correo.</p>
<p>—<br>El equipo de resicodeo</p>
```

---

## 7. Habilitar protección anti-bots (recomendado)

Ve a **"Authentication"** → **"Rate Limits"**:

```
Max requests per hour: 30
```

Esto evita que bots intenten crear miles de cuentas en automático.

---

## 8. Configurar email transaccional (Resend) — opcional pero recomendado

Por defecto Supabase manda emails desde su dominio. Para verse profesional, conecta tu propio dominio:

1. Ve a [resend.com](https://resend.com) y crea cuenta gratis
2. Verifica tu dominio (`resicodeo.com` cuando lo tengas)
3. Copia el SMTP de Resend
4. En Supabase: **Settings** → **Auth** → **SMTP Settings** y pégalo

⏱ Esto puede esperar hasta que tengas el dominio. Por ahora deja el default de Supabase.

---

## ✅ Lista de verificación

Antes de continuar al siguiente paso, confirma:

- [ ] Cuenta de Supabase creada
- [ ] Proyecto `resicodeo` creado
- [ ] Tienes guardadas: Project URL y anon key
- [ ] SQL ejecutado exitosamente (4 tablas creadas)
- [ ] RLS (Row Level Security) habilitado en todas las tablas
- [ ] Email Auth habilitado
- [ ] URLs de redirección configuradas

---

## Próximo paso

Lee `02-cifrado-cliente.md` para implementar el módulo de cifrado.
