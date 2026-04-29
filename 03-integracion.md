# 🔌 Paso 3: Integrar el cloud con la app actual

Hasta ahora tienes:
- ✅ Supabase configurado
- ✅ Schema de base de datos
- ✅ Módulo de cifrado (`encryption.js`)
- ✅ Página de login (`login.html`)

Ahora necesitamos modificar `resicodeo.html` para que:
1. Verifique si hay sesión activa
2. Sincronice los datos con el servidor
3. Maneje conflictos si edita en 2 dispositivos

---

## Cómo se integra: el "sync engine"

El módulo nuevo se inserta en `resicodeo.html` así:

```javascript
// === PSEUDOCÓDIGO ===

async function init() {
  // 1. Verificar si está logueado
  const session = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  // 2. Cargar datos del servidor
  const remoteData = await downloadEncryptedData(session.user.id);

  if (remoteData && remoteData.updated_at > localData.updated_at) {
    // Servidor tiene versión más nueva, descifrar y usar
    const decrypted = await decryptFromServer(key, remoteData.ciphertext, remoteData.iv, remoteData.hash);
    ingresos = decrypted.ingresos;
    gastos = decrypted.gastos;
    clientes = decrypted.clientes;
    paquetes = decrypted.paquetes;
    saveAllToLocal();
  }

  // 3. Renderizar app normal
  renderResumen();
}

// Cuando el usuario guarda algo:
async function saveData() {
  // Guardar local primero (rápido)
  saveAllToLocal();

  // Subir al servidor en background (con cifrado)
  syncToCloud();
}
```

---

## Código a agregar a resicodeo.html

### 1. En el `<head>` agregar Supabase

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
const SUPABASE_URL = 'TU_URL';
const SUPABASE_ANON_KEY = 'TU_KEY';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
</script>
```

### 2. Importar el módulo de cifrado al final del `<body>`

```html
<script type="module">
import * as crypto from './encryption.js';
window.cloudCrypto = crypto;
</script>
```

### 3. Agregar el módulo `cloudSync.js` (código nuevo)

Este es el archivo nuevo:
