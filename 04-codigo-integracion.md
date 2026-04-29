# 🔧 Guía de integración: conectar resicodeo.html con la nube

Esta es la lista exacta de cambios que hay que hacer en `resicodeo.html` (el archivo actual) para que use la nube.

## Cambio 1: Agregar Supabase al `<head>`

Busca el `<head>` y agrega ANTES de `</head>`:

```html
<!-- Supabase para autenticación y sync -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
const SUPABASE_URL = 'TU_URL_AQUI';        // ← reemplaza
const SUPABASE_ANON_KEY = 'TU_KEY_AQUI';   // ← reemplaza
window._supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
</script>
```

## Cambio 2: Verificar sesión al inicio

Busca la función `init()` y MODIFÍCALA así (al inicio):

```javascript
async function init() {
  // === NUEVO: verificar sesión ===
  const { data: { session } } = await window._supabase.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  // Verificar que tiene encryption key desbloqueada
  if (!window._encryptionKey || sessionStorage.getItem('encryption_unlocked') !== 'true') {
    window.location.href = 'login.html';
    return;
  }
  // === FIN NUEVO ===

  await loadData();
  initSelects();
  refrescarSelectClientes();
  // ... resto del init original
}
```

## Cambio 3: Importar cloudSync

Agrega ANTES del cierre de `</body>`:

```html
<script type="module">
import { initSync, markChanges, signOutAndCleanLocal } from './cloudSync.js';
import * as encryption from './encryption.js';

// Hacer disponible globalmente
window.cloudSync = { initSync, markChanges, signOutAndCleanLocal };
window.cloudCrypto = encryption;

// Inicializar sync engine cuando todo esté listo
window.addEventListener('load', () => {
  if (window._encryptionKey && window._supabase) {
    initSync(window._supabase, window._encryptionKey, {
      onStatusChange: (status) => actualizarIndicadorSync(status),
      onConflict: (info) => {
        const useRemote = confirm(
          'Se detectó un cambio en otro dispositivo más reciente que el local.\n' +
          '¿Quieres usar la versión más reciente? (Cancelar para mantener la local)'
        );
        return useRemote;
      },
      onError: (err) => {
        console.error('Sync error:', err);
        showToast('Error al sincronizar', true);
      }
    });
  }
});
</script>
```

## Cambio 4: Marcar cambios después de cada save

Busca todas las funciones `saveIngresos()`, `saveGastos()`, `saveClientes()`, `savePaquetes()` y agrega `markChanges()` al final.

Ejemplo:

```javascript
async function saveIngresos() {
  try { localStorage.setItem('resicodeo_ingresos', JSON.stringify(ingresos)); }
  catch (e) { showToast('Error al guardar', true); }
  
  // === NUEVO: marcar para sync ===
  if (window.cloudSync) window.cloudSync.markChanges();
}
```

Hacer lo mismo en las otras 3 funciones save.

## Cambio 5: Indicador visual de sync

Agrega en el HTML, dentro del `.header` o cerca del logo:

```html
<div id="sync-indicator" style="display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 4px 10px; border-radius: 100px; background: var(--bg-tertiary); margin-left: auto;">
  <div id="sync-dot" style="width: 8px; height: 8px; border-radius: 50%; background: var(--green);"></div>
  <span id="sync-text">Sincronizado</span>
</div>
```

Y la función:

```javascript
function actualizarIndicadorSync(status) {
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  if (!dot || !text) return;
  
  switch (status) {
    case 'synced':
      dot.style.background = 'var(--green)';
      text.textContent = 'Sincronizado';
      break;
    case 'syncing':
      dot.style.background = 'var(--orange)';
      text.textContent = 'Sincronizando...';
      break;
    case 'pending':
      dot.style.background = 'var(--orange)';
      text.textContent = 'Cambios pendientes';
      break;
    case 'error':
      dot.style.background = 'var(--red)';
      text.textContent = 'Error de sync';
      break;
  }
}
window.actualizarIndicadorSync = actualizarIndicadorSync;
```

## Cambio 6: Botón de cerrar sesión

En la pestaña "Ayuda", agrega:

```html
<button class="btn ghost" onclick="cerrarSesion()" style="margin-top: 12px;">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
  Cerrar sesión
</button>
```

Y la función:

```javascript
async function cerrarSesion() {
  if (!confirm('¿Cerrar sesión? Tus datos se quedan respaldados en la nube.')) return;
  if (window.cloudSync) {
    await window.cloudSync.signOutAndCleanLocal();
  } else {
    window.location.href = 'login.html';
  }
}
window.cerrarSesion = cerrarSesion;
```

## Cambio 7: Sincronización antes de cerrar pestaña

Agrega en algún lugar al final del script:

```javascript
// Si hay cambios pendientes, intentar sync antes de cerrar
window.addEventListener('beforeunload', (e) => {
  if (window.cloudSync && pendingChanges) {
    // Sync síncrono no es 100% confiable pero ayuda
    e.preventDefault();
    e.returnValue = 'Tienes cambios sin sincronizar. ¿Salir de todos modos?';
  }
});
```

## ✅ Verificación final

Después de hacer todos los cambios, prueba:

1. Abrir `login.html` → registrarse → setup frase secreta → debe llevarte a `index.html` (la app)
2. Crear un cobro → ver indicador "Cambios pendientes" → esperar 2 segundos → debe cambiar a "Sincronizado"
3. Cerrar pestaña → abrir en otra pestaña/dispositivo → login → debe descargar los datos
4. En el dashboard de Supabase, ver la tabla `encrypted_data` → debe haber un row con tu user_id y el blob cifrado (texto ilegible)

## Si algo falla

- Revisar la consola del navegador para errores
- Verificar que las URLs y keys de Supabase sean correctas
- Confirmar que `encryption.js` y `cloudSync.js` estén en la misma carpeta que `index.html`
- Verificar que estás corriendo desde un servidor (no `file://`)

## Tiempo estimado de integración

- **Manualmente:** 2-3 horas
- **Conmigo en próxima sesión:** 1 hora
