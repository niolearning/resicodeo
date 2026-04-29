/**
 * resicodeo Cloud — Módulo de sincronización
 *
 * Maneja la subida y descarga de datos cifrados con Supabase.
 *
 * Estrategia:
 * - Local-first: la app sigue funcionando 100% local
 * - Sync automático cada N segundos cuando hay cambios
 * - Si hay conflicto, gana la versión más reciente
 * - Indicador visual de estado
 */

const SYNC_INTERVAL_MS = 30000; // 30 segundos
const SYNC_DEBOUNCE_MS = 2000;   // Esperar 2s después del último cambio

let syncTimer = null;
let lastLocalSave = null;
let lastRemoteSync = null;
let currentEncryptionKey = null;
let syncInProgress = false;
let pendingChanges = false;

// ============================================================
// API pública del módulo
// ============================================================

/**
 * Inicializa el sync engine. Llamar una vez al cargar la app.
 *
 * @param {object} supabase - Cliente Supabase autenticado
 * @param {CryptoKey} encryptionKey - Llave de cifrado (de la sesión)
 * @param {object} callbacks - { onStatusChange, onConflict, onError }
 */
export function initSync(supabase, encryptionKey, callbacks = {}) {
  currentEncryptionKey = encryptionKey;
  window._supabase = supabase;
  window._syncCallbacks = callbacks;

  // Sync inicial al cargar
  pullFromCloud().catch(e => {
    console.error('Sync inicial falló:', e);
    callbacks.onError?.(e);
  });

  // Sync periódico
  startPeriodicSync();

  // Sync antes de cerrar la pestaña
  window.addEventListener('beforeunload', () => {
    if (pendingChanges) {
      pushToCloud();
    }
  });
}

/**
 * Marca que hay cambios locales pendientes de sincronizar.
 * Llamar después de cada save local.
 */
export function markChanges() {
  pendingChanges = true;
  lastLocalSave = Date.now();

  // Debounce: esperar a que el usuario termine de hacer cambios
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    if (pendingChanges) pushToCloud();
  }, SYNC_DEBOUNCE_MS);

  // Actualizar UI
  window._syncCallbacks?.onStatusChange?.('pending');
}

/**
 * Forzar sync inmediato.
 */
export async function forceSync() {
  if (pendingChanges) {
    await pushToCloud();
  } else {
    await pullFromCloud();
  }
}

// ============================================================
// PUSH (subir al servidor)
// ============================================================

async function pushToCloud() {
  if (syncInProgress) return;
  if (!currentEncryptionKey) return;

  syncInProgress = true;
  window._syncCallbacks?.onStatusChange?.('syncing');

  try {
    // Recolectar datos locales
    const data = collectLocalData();

    // Cifrar
    const { encryptForUpload } = await import('./encryption.js');
    const encrypted = await encryptForUpload(currentEncryptionKey, data);

    // Verificar tamaño
    if (encrypted.size > 4 * 1024 * 1024) { // 4MB
      throw new Error('Tus datos son demasiado grandes para sincronizar (>4MB)');
    }

    // Obtener user_id de la sesión
    const { data: { user } } = await window._supabase.auth.getUser();
    if (!user) throw new Error('Sesión expirada');

    // Verificar si ya existe registro
    const { data: existing } = await window._supabase
      .from('encrypted_data')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      // Actualizar (también copiar a historial)
      await window._supabase
        .from('encrypted_data_history')
        .insert({
          user_id: user.id,
          ciphertext: existing.ciphertext,
          iv: existing.iv,
          data_hash: existing.data_hash,
          blob_size: existing.blob_size
        });

      const { error } = await window._supabase
        .from('encrypted_data')
        .update({
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          data_hash: encrypted.hash,
          blob_size: encrypted.size
        })
        .eq('user_id', user.id);

      if (error) throw error;
    } else {
      // Crear primer registro
      const { error } = await window._supabase
        .from('encrypted_data')
        .insert({
          user_id: user.id,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          data_hash: encrypted.hash,
          blob_size: encrypted.size
        });

      if (error) throw error;
    }

    // Marcar como sincronizado
    pendingChanges = false;
    lastRemoteSync = Date.now();

    // Log de actividad
    logActivity('sync_upload', { size: encrypted.size });

    window._syncCallbacks?.onStatusChange?.('synced');
  } catch (e) {
    console.error('Push falló:', e);
    window._syncCallbacks?.onStatusChange?.('error');
    window._syncCallbacks?.onError?.(e);
  } finally {
    syncInProgress = false;
  }
}

// ============================================================
// PULL (descargar del servidor)
// ============================================================

async function pullFromCloud() {
  if (syncInProgress) return;
  if (!currentEncryptionKey) return;

  syncInProgress = true;
  window._syncCallbacks?.onStatusChange?.('syncing');

  try {
    const { data: { user } } = await window._supabase.auth.getUser();
    if (!user) throw new Error('Sesión expirada');

    const { data: remote, error } = await window._supabase
      .from('encrypted_data')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    if (!remote) {
      // Primera vez sincronizando, no hay nada en el servidor
      window._syncCallbacks?.onStatusChange?.('synced');
      return;
    }

    // Verificar si la versión remota es más nueva que la local
    const localUpdated = parseInt(localStorage.getItem('resicodeo_last_sync') || '0');
    const remoteUpdated = new Date(remote.updated_at).getTime();

    if (remoteUpdated > localUpdated && lastLocalSave && remoteUpdated > lastLocalSave) {
      // Conflicto: ambos lados tienen cambios. Notificar al usuario.
      const acceptRemote = window._syncCallbacks?.onConflict?.({
        local: localUpdated,
        remote: remoteUpdated
      });

      if (!acceptRemote) {
        // Usuario eligió mantener local; subir
        await pushToCloud();
        return;
      }
    }

    // Descifrar
    const { decryptFromServer } = await import('./encryption.js');
    const decrypted = await decryptFromServer(
      currentEncryptionKey,
      remote.ciphertext,
      remote.iv,
      remote.data_hash
    );

    // Aplicar a la app
    applyDataToApp(decrypted);

    // Marcar timestamp
    localStorage.setItem('resicodeo_last_sync', remoteUpdated.toString());
    lastRemoteSync = remoteUpdated;

    logActivity('sync_download', { size: remote.blob_size });

    window._syncCallbacks?.onStatusChange?.('synced');
  } catch (e) {
    console.error('Pull falló:', e);
    window._syncCallbacks?.onStatusChange?.('error');
    window._syncCallbacks?.onError?.(e);
  } finally {
    syncInProgress = false;
  }
}

// ============================================================
// HELPERS
// ============================================================

/** Recolecta todos los datos locales para subir */
function collectLocalData() {
  return {
    ingresos: JSON.parse(localStorage.getItem('resicodeo_ingresos') || '[]'),
    gastos: JSON.parse(localStorage.getItem('resicodeo_gastos') || '[]'),
    clientes: JSON.parse(localStorage.getItem('resicodeo_clientes') || '[]'),
    paquetes: JSON.parse(localStorage.getItem('resicodeo_paquetes') || '[]'),
    schemaVersion: 1,
    deviceId: getOrCreateDeviceId(),
    lastModified: Date.now()
  };
}

/** Aplica datos descargados a la app */
function applyDataToApp(data) {
  if (data.ingresos) {
    localStorage.setItem('resicodeo_ingresos', JSON.stringify(data.ingresos));
    if (window.ingresos !== undefined) window.ingresos = data.ingresos;
  }
  if (data.gastos) {
    localStorage.setItem('resicodeo_gastos', JSON.stringify(data.gastos));
    if (window.gastos !== undefined) window.gastos = data.gastos;
  }
  if (data.clientes) {
    localStorage.setItem('resicodeo_clientes', JSON.stringify(data.clientes));
    if (window.clientes !== undefined) window.clientes = data.clientes;
  }
  if (data.paquetes) {
    localStorage.setItem('resicodeo_paquetes', JSON.stringify(data.paquetes));
    if (window.paquetes !== undefined) window.paquetes = data.paquetes;
  }

  // Re-renderizar la vista actual
  if (window.renderResumenMes) window.renderResumenMes();
  if (window.refrescarSelectClientes) window.refrescarSelectClientes();
}

/** Genera o recupera ID único del dispositivo */
function getOrCreateDeviceId() {
  let id = localStorage.getItem('resicodeo_device_id');
  if (!id) {
    id = 'dev-' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('resicodeo_device_id', id);
  }
  return id;
}

/** Log de actividad (no sensible) */
async function logActivity(eventType, metadata = {}) {
  try {
    const { data: { user } } = await window._supabase.auth.getUser();
    if (!user) return;

    await window._supabase.from('activity_log').insert({
      user_id: user.id,
      event_type: eventType,
      metadata: metadata
    });
  } catch (e) {
    // No critical, ignorar
    console.warn('Activity log falló:', e);
  }
}

/** Inicia el timer de sync periódico */
function startPeriodicSync() {
  setInterval(() => {
    if (pendingChanges && !syncInProgress) {
      pushToCloud();
    }
  }, SYNC_INTERVAL_MS);
}

// ============================================================
// CIERRE DE SESIÓN
// ============================================================

export async function signOutAndCleanLocal() {
  // Sync final antes de cerrar
  if (pendingChanges) {
    await pushToCloud();
  }

  // Limpiar TODO local (si el usuario lo pide)
  if (confirm('¿Quieres también borrar tus datos locales de este dispositivo? (Se mantienen en la nube)')) {
    localStorage.removeItem('resicodeo_ingresos');
    localStorage.removeItem('resicodeo_gastos');
    localStorage.removeItem('resicodeo_clientes');
    localStorage.removeItem('resicodeo_paquetes');
  }

  await window._supabase.auth.signOut();
  delete window._encryptionKey;
  sessionStorage.clear();

  window.location.href = 'login.html';
}
