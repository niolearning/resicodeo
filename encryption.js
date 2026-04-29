/**
 * resicodeo Cloud — Módulo de cifrado Zero-Knowledge
 *
 * Usa Web Crypto API (nativo del navegador, sin dependencias externas).
 *
 * Algoritmos:
 * - PBKDF2 con SHA-256, 600,000 iteraciones para derivar la llave
 * - AES-GCM 256-bit para cifrar los datos
 * - SHA-256 para verificar integridad
 *
 * Garantías:
 * - La frase secreta del usuario NUNCA se envía al servidor
 * - El servidor solo ve blobs cifrados que no puede descifrar
 * - Usar una frase fuerte hace inviable la fuerza bruta
 */

const ITERATIONS = 600000;
const KEY_LENGTH = 256; // bits
const ALGORITHM = 'AES-GCM';
const HASH = 'SHA-256';
const IV_LENGTH = 12; // 96 bits (estándar para GCM)
const SALT_LENGTH = 16; // 128 bits

// ============================================================
// Helpers de codificación
// ============================================================

/** Convierte ArrayBuffer a string base64 */
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Convierte string base64 a ArrayBuffer */
function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Convierte string a Uint8Array (UTF-8) */
function stringToBytes(str) {
  return new TextEncoder().encode(str);
}

/** Convierte Uint8Array a string (UTF-8) */
function bytesToString(bytes) {
  return new TextDecoder().decode(bytes);
}

// ============================================================
// Generación de aleatorios criptográficamente seguros
// ============================================================

/** Genera un salt aleatorio para PBKDF2 */
function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/** Genera un IV aleatorio para AES-GCM */
function generateIV() {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

// ============================================================
// Derivación de llave (PBKDF2)
// ============================================================

/**
 * Convierte la frase secreta del usuario en una llave criptográfica.
 *
 * Esta operación es INTENCIONALMENTE LENTA (~1 segundo) para hacer
 * inviable la fuerza bruta sobre el password.
 *
 * @param {string} password - La frase secreta del usuario
 * @param {Uint8Array} salt - Salt único por usuario
 * @returns {Promise<CryptoKey>} - Llave para cifrar/descifrar
 */
async function deriveKey(password, salt) {
  // Importar el password como material crudo
  const baseKey = await crypto.subtle.importKey(
    'raw',
    stringToBytes(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Derivar llave AES-GCM usando PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: ITERATIONS,
      hash: HASH
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // No exportable (más seguro)
    ['encrypt', 'decrypt']
  );
}

// ============================================================
// Cifrado y descifrado
// ============================================================

/**
 * Cifra un objeto JS con la llave derivada.
 *
 * @param {CryptoKey} key - Llave derivada del password
 * @param {object} data - Datos a cifrar (se serializa como JSON)
 * @returns {Promise<{ciphertext: string, iv: string, hash: string}>}
 */
async function encryptData(key, data) {
  // Serializar como JSON
  const jsonStr = JSON.stringify(data);
  const jsonBytes = stringToBytes(jsonStr);

  // Generar IV único para esta operación
  const iv = generateIV();

  // Cifrar con AES-GCM (provee también autenticación/integridad)
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv
    },
    key,
    jsonBytes
  );

  // Calcular hash de los datos originales para verificar integridad
  const hashBuffer = await crypto.subtle.digest(HASH, jsonBytes);

  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv),
    hash: bufferToBase64(hashBuffer),
    size: jsonBytes.byteLength
  };
}

/**
 * Descifra un blob con la llave derivada.
 *
 * @param {CryptoKey} key - Llave derivada del password
 * @param {string} ciphertext - Datos cifrados en base64
 * @param {string} iv - IV en base64
 * @param {string} expectedHash - Hash esperado para verificación
 * @returns {Promise<object>} - Los datos originales descifrados
 */
async function decryptData(key, ciphertext, iv, expectedHash) {
  try {
    // Descifrar
    const plaintext = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: base64ToBuffer(iv)
      },
      key,
      base64ToBuffer(ciphertext)
    );

    // Verificar integridad
    const actualHash = await crypto.subtle.digest(HASH, plaintext);
    if (bufferToBase64(actualHash) !== expectedHash) {
      throw new Error('Los datos fueron alterados o corrompidos');
    }

    // Deserializar JSON
    const jsonStr = bytesToString(new Uint8Array(plaintext));
    return JSON.parse(jsonStr);
  } catch (e) {
    if (e.message.includes('alterados')) throw e;
    throw new Error('No se pudo descifrar. Frase secreta incorrecta.');
  }
}

// ============================================================
// Verificación de password (sin descifrar todos los datos)
// ============================================================

/**
 * Crea un "check" para verificar si una frase secreta es la correcta.
 *
 * Cuando el usuario configura su frase por primera vez, generamos un
 * check token. Después, en cada login, podemos verificar la frase
 * sin tener que descargar y descifrar todos sus datos.
 *
 * @param {CryptoKey} key - Llave derivada
 * @returns {Promise<{check: string, iv: string}>}
 */
async function createPasswordCheck(key) {
  const checkValue = 'resicodeo-password-check-' + Date.now();
  const iv = generateIV();

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv },
    key,
    stringToBytes(checkValue)
  );

  return {
    check: bufferToBase64(ciphertext) + ':' + bufferToBase64(iv),
    plaintext: checkValue
  };
}

/**
 * Verifica si una llave puede descifrar el check.
 *
 * @param {CryptoKey} key - Llave derivada
 * @param {string} check - Check guardado (formato "ciphertext:iv")
 * @returns {Promise<boolean>}
 */
async function verifyPasswordCheck(key, check) {
  try {
    const [ciphertextB64, ivB64] = check.split(':');
    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: base64ToBuffer(ivB64) },
      key,
      base64ToBuffer(ciphertextB64)
    );
    const decoded = bytesToString(new Uint8Array(plaintext));
    return decoded.startsWith('resicodeo-password-check-');
  } catch (e) {
    return false;
  }
}

// ============================================================
// API pública del módulo
// ============================================================

/**
 * Setup inicial: el usuario crea su frase secreta por primera vez.
 *
 * @param {string} password - La frase secreta elegida
 * @returns {Promise<{salt: string, check: string, key: CryptoKey}>}
 */
export async function setupNewUser(password) {
  if (!password || password.length < 12) {
    throw new Error('La frase secreta debe tener al menos 12 caracteres');
  }

  const salt = generateSalt();
  const key = await deriveKey(password, salt);
  const checkData = await createPasswordCheck(key);

  return {
    salt: bufferToBase64(salt),
    check: checkData.check,
    key: key // No guardes la llave en disco, solo en memoria de la sesión
  };
}

/**
 * Login: el usuario ingresa su frase secreta y verificamos que sea correcta.
 *
 * @param {string} password - La frase ingresada
 * @param {string} saltB64 - Salt almacenado del usuario
 * @param {string} check - Check almacenado del usuario
 * @returns {Promise<CryptoKey>} - Llave para descifrar datos
 */
export async function loginUser(password, saltB64, check) {
  const salt = new Uint8Array(base64ToBuffer(saltB64));
  const key = await deriveKey(password, salt);

  const isValid = await verifyPasswordCheck(key, check);
  if (!isValid) {
    throw new Error('Frase secreta incorrecta');
  }

  return key;
}

/**
 * Cifra los datos del usuario para subir al servidor.
 *
 * @param {CryptoKey} key - Llave de la sesión
 * @param {object} data - Datos a cifrar
 * @returns {Promise<object>} - Blob listo para enviar
 */
export async function encryptForUpload(key, data) {
  return encryptData(key, data);
}

/**
 * Descifra datos descargados del servidor.
 *
 * @param {CryptoKey} key - Llave de la sesión
 * @param {string} ciphertext - Datos cifrados del servidor
 * @param {string} iv - IV del servidor
 * @param {string} hash - Hash de integridad
 * @returns {Promise<object>} - Datos descifrados
 */
export async function decryptFromServer(key, ciphertext, iv, hash) {
  return decryptData(key, ciphertext, iv, hash);
}

/**
 * Cambia la frase secreta del usuario.
 * Re-cifra todos los datos con la nueva llave.
 *
 * @param {object} currentData - Los datos actuales descifrados
 * @param {CryptoKey} oldKey - Llave actual
 * @param {string} newPassword - Nueva frase secreta
 * @returns {Promise<{newSalt: string, newCheck: string, newKey: CryptoKey, newEncrypted: object}>}
 */
export async function changePassword(currentData, oldKey, newPassword) {
  const setup = await setupNewUser(newPassword);
  const reEncrypted = await encryptData(setup.key, currentData);

  return {
    newSalt: setup.salt,
    newCheck: setup.check,
    newKey: setup.key,
    newEncrypted: reEncrypted
  };
}

/**
 * Estima la fortaleza de una frase secreta.
 *
 * @param {string} password
 * @returns {{score: number, label: string, color: string}}
 *   score: 0-4
 *   label: descripción
 *   color: color sugerido
 */
export function estimatePasswordStrength(password) {
  if (!password) return { score: 0, label: 'Vacía', color: '#F87171' };

  let score = 0;

  // Longitud
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (password.length >= 20) score++;

  // Variedad de caracteres
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  if (/\s/.test(password)) score++; // Frase con espacios = más entropía

  // Penalizar passwords comunes
  const commonPatterns = /^(123|abc|qwerty|password|admin|letmein|welcome)/i;
  if (commonPatterns.test(password)) score = Math.max(0, score - 3);

  // Normalizar a 0-4
  score = Math.min(4, Math.floor(score / 2));

  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte'];
  const colors = ['#F87171', '#FB923C', '#FBBF24', '#22C55E', '#10B981'];

  return {
    score,
    label: labels[score],
    color: colors[score]
  };
}

// ============================================================
// Tests del módulo (correr en consola para verificar)
// ============================================================

/**
 * Test completo del módulo. Llama esto en la consola del navegador
 * para verificar que todo funciona.
 */
export async function runTests() {
  console.log('🧪 Iniciando tests del módulo de cifrado...');

  try {
    // Test 1: Setup nuevo usuario
    console.log('Test 1: Setup nuevo usuario...');
    const password = 'mi-frase-super-secreta-2024';
    const setup = await setupNewUser(password);
    console.assert(setup.salt && setup.check && setup.key, 'Setup debe retornar salt, check y key');
    console.log('  ✓ Setup OK');

    // Test 2: Login con password correcto
    console.log('Test 2: Login con password correcto...');
    const loginKey = await loginUser(password, setup.salt, setup.check);
    console.assert(loginKey, 'Login debe retornar key');
    console.log('  ✓ Login correcto OK');

    // Test 3: Login con password incorrecto
    console.log('Test 3: Login con password incorrecto debe fallar...');
    try {
      await loginUser('frase-incorrecta', setup.salt, setup.check);
      console.error('  ✗ Login incorrecto NO falló (debería haber fallado)');
      return false;
    } catch (e) {
      console.assert(e.message.includes('incorrecta'), 'Error debe ser por password incorrecto');
      console.log('  ✓ Login incorrecto rechazado OK');
    }

    // Test 4: Cifrar y descifrar
    console.log('Test 4: Cifrar y descifrar...');
    const datosOriginales = {
      ingresos: [
        { id: 1, desc: 'Boda Pérez', monto: 25000, fecha: '2026-03-15' }
      ],
      clientes: [
        { id: 1, nombre: 'Productora XYZ', rfc: 'PMX190215XYZ' }
      ]
    };

    const cifrado = await encryptForUpload(setup.key, datosOriginales);
    console.assert(cifrado.ciphertext && cifrado.iv && cifrado.hash, 'Debe retornar ciphertext, iv y hash');
    console.log('  ✓ Cifrado OK, tamaño:', cifrado.size, 'bytes');

    const descifrado = await decryptFromServer(setup.key, cifrado.ciphertext, cifrado.iv, cifrado.hash);
    console.assert(JSON.stringify(descifrado) === JSON.stringify(datosOriginales), 'Datos descifrados deben ser iguales a originales');
    console.log('  ✓ Descifrado OK, datos coinciden');

    // Test 5: Detectar tampering (modificación de datos)
    console.log('Test 5: Detectar tampering...');
    try {
      // Modificar un byte del ciphertext
      const modificado = cifrado.ciphertext.slice(0, -4) + 'XXXX';
      await decryptFromServer(setup.key, modificado, cifrado.iv, cifrado.hash);
      console.error('  ✗ Tampering NO detectado (debería haber fallado)');
      return false;
    } catch (e) {
      console.log('  ✓ Tampering detectado correctamente');
    }

    // Test 6: Cambio de password
    console.log('Test 6: Cambio de password...');
    const newPassword = 'nueva-frase-aun-mejor-2024';
    const changed = await changePassword(datosOriginales, setup.key, newPassword);
    const newKey = await loginUser(newPassword, changed.newSalt, changed.newCheck);
    const reDescifrado = await decryptFromServer(newKey, changed.newEncrypted.ciphertext, changed.newEncrypted.iv, changed.newEncrypted.hash);
    console.assert(JSON.stringify(reDescifrado) === JSON.stringify(datosOriginales), 'Datos deben ser iguales después de cambio de password');
    console.log('  ✓ Cambio de password OK');

    // Test 7: Estimación de fortaleza
    console.log('Test 7: Estimación de fortaleza...');
    const strengths = [
      'abc',
      'password123',
      'frase-corta',
      'mi-frase-secreta-fuerte-2024!',
      'Una frase muy larga con espacios y números 1234 y símbolos !@#'
    ];
    strengths.forEach(p => {
      const s = estimatePasswordStrength(p);
      console.log(`  "${p.substring(0, 30)}..." → ${s.label} (${s.score}/4)`);
    });

    console.log('🎉 TODOS LOS TESTS PASARON');
    return true;
  } catch (e) {
    console.error('❌ Test falló:', e);
    return false;
  }
}
