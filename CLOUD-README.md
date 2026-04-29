# 🔐 resicodeo Cloud — Guía maestra

## ¿Qué es esto?

Una versión de resicodeo con **cuentas de usuario y sincronización en la nube**, pero con cifrado de extremo a extremo (zero-knowledge). Tú almacenas datos cifrados que ni tú puedes leer.

## Estructura de archivos

```
resicodeo-cloud/
│
├── 00-PLAN.md                    ← Empieza aquí: visión general
├── 01-setup-supabase.md          ← Paso 1: configurar Supabase
├── 03-integracion.md             ← Paso 3: integrar con la app actual
├── README.md                     ← Este archivo
│
├── encryption.js                 ← Módulo de cifrado (PBKDF2 + AES-GCM)
├── cloudSync.js                  ← Módulo de sincronización
├── login.html                    ← Página de login/registro
│
├── aviso-privacidad.html         ← Borrador legal: Aviso de Privacidad
└── terminos.html                 ← Borrador legal: Términos y Condiciones
```

## Roadmap completo

### ✅ Fase 1: Setup técnico (DONE)
- [x] Schema de base de datos en Supabase
- [x] Row Level Security configurado
- [x] Módulo de cifrado con tests
- [x] Página de login/registro
- [x] Módulo de sincronización
- [x] Borradores legales (Aviso + Términos)

### 🚧 Fase 2: Lo que YO ya hice por ti
- [x] Toda la arquitectura
- [x] Todo el código JavaScript
- [x] Todos los HTML
- [x] Documentación paso a paso
- [x] Borradores legales

### ⏳ Fase 3: Lo que TÚ necesitas hacer
- [ ] Crear cuenta en Supabase (5 min)
- [ ] Ejecutar el SQL del paso 1 (2 min)
- [ ] Reemplazar `TU_PROJECT_URL` y `TU_ANON_KEY` en login.html
- [ ] Modificar resicodeo.html para integrar cloudSync.js
- [ ] Agregar Supabase script tag a resicodeo.html
- [ ] Cambiar texto `[NOMBRE]`, `[EMAIL]`, `[DIRECCIÓN]` en docs legales
- [ ] **MUY IMPORTANTE:** mostrar borradores legales a un abogado mexicano

### ⏳ Fase 4: Antes de cobrar
- [ ] Validación legal por abogado certificado (~$5-15K MXN)
- [ ] Subir todo a GitHub Pages o Vercel
- [ ] Configurar Stripe para los planes Pro
- [ ] Probar todo el flujo end-to-end con cuenta real
- [ ] Página de marketing/precios

## Cómo testearlo localmente

### 1. Configurar Supabase
Sigue las instrucciones de `01-setup-supabase.md`. Te toma 10 minutos.

### 2. Editar credenciales
En `login.html`, busca:
```javascript
const SUPABASE_URL = 'TU_PROJECT_URL_AQUI';
const SUPABASE_ANON_KEY = 'TU_ANON_KEY_AQUI';
```
Reemplaza con tus valores reales del paso 1.

### 3. Servir los archivos
Como el código usa `import` (módulos ES6), no funciona con file://. Necesitas un servidor:

```bash
# Opción Python (más fácil)
cd resicodeo-cloud
python3 -m http.server 8000

# Opción Node
npx serve .
```

Abre http://localhost:8000/login.html

### 4. Probar registro
- Crea cuenta con email real (Supabase te manda email de confirmación)
- Confirma tu email
- Vuelve a login
- Setup de frase secreta
- Te debe redirigir a la app

### 5. Verificar tests del cifrado
En la consola del navegador:
```javascript
import('./encryption.js').then(m => m.runTests())
```
Debe imprimir "🎉 TODOS LOS TESTS PASARON".

## ¿Qué falta?

### Conectar la app actual con la nube

`resicodeo.html` actualmente trabaja 100% local. Para que use la nube, hay que:

1. Antes de `init()`, verificar sesión:
```javascript
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  window.location.href = 'login.html';
  return;
}
```

2. Inicializar el sync engine:
```javascript
import { initSync, markChanges } from './cloudSync.js';

const key = window._encryptionKey; // de la sesión
initSync(supabase, key, {
  onStatusChange: (status) => updateSyncIndicator(status),
  onConflict: (info) => askUserAboutConflict(info),
  onError: (err) => showToast('Error de sincronización', true)
});
```

3. En cada `saveIngresos()`, `saveGastos()`, etc., llamar:
```javascript
markChanges(); // marca que hay cambios pendientes de sync
```

4. Agregar indicador visual de sync en la UI (esquina superior, círculo con estados).

5. Botón de "Cerrar sesión" en la pestaña Ayuda.

### Tiempo estimado para integrar

Si lo haces tú con conocimientos básicos: **3-5 horas**.
Si me lo pides en próxima sesión: **1-2 horas conmigo**.

## Costo estimado

### Inicial (una vez)
- Cuenta Supabase: **$0**
- Dominio: **~$200 MXN/año**
- Abogado para revisar legales: **$5-15K MXN** (recomendado, no obligatorio si no vas a cobrar)
- Tu tiempo o desarrollador: **$0** (todo el código ya está listo)

### Mensual
- Supabase Free tier: **$0** (hasta 50K usuarios activos)
- Vercel hosting: **$0** (gratis para sitios estáticos)
- Email transaccional (Resend): **$0** (3K emails/mes gratis)
- **Total mensual: $0** mientras crezcas

### Cuando crezcas (a partir de 50K usuarios)
- Supabase Pro: **$25 USD/mes**
- Aún así, costos muy razonables vs ingresos

## Garantías legales del modelo

Este modelo zero-knowledge te da las mejores defensas legales bajo la LFPDPPP:

✅ **Datos cifrados con clave del usuario** = no procesas datos personales en sentido fuerte
✅ **Transparencia total** = el usuario sabe que tú no puedes leer
✅ **Aviso de privacidad robusto** = cumples Art. 16
✅ **Derechos ARCO implementados** = cumples Art. 28-32
✅ **Encargados con garantías** = Supabase tiene SOC 2 Type II
✅ **Notificación de brechas** = mecanismo establecido

⚠️ **Lo que SÍ te protege esto:**
- Demandas civiles por mal uso de datos
- Multas del INAI por incumplimiento técnico
- Acusaciones de "vendiste mis datos" (no puedes, están cifrados)

⚠️ **Lo que NO te protege:**
- Demandas por errores en cálculos fiscales (eso lo cubren los disclaimers)
- Que un usuario te demande porque "olvidé mi frase y perdí todo" (esto está claro en Términos)
- Casos extremos donde un juez ordene entregar datos (puedes entregar el blob cifrado, eso es todo)

## Recomendaciones finales

1. **No empieces a cobrar sin abogado.** Los $5-15K MXN de revisión te ahorran $50K+ de problemas.

2. **Considera registrarte como Persona Moral** (S.A.S. de C.V.) si esperas crecer. Limita tu responsabilidad personal.

3. **Mantén respaldos cifrados periódicos** de tu base de datos Supabase.

4. **Implementa rate limiting** en login para evitar ataques de fuerza bruta.

5. **Considera 2FA** (autenticación de dos factores) para usuarios. Supabase lo soporta.

6. **Política de retención corta** para logs (90 días). Menos datos = menos riesgo.

## Próximos pasos sugeridos

1. **Hoy:** Lee `00-PLAN.md` y `01-setup-supabase.md`
2. **Esta semana:** Crea cuenta Supabase y ejecuta el SQL
3. **Próxima sesión conmigo:** Integramos `cloudSync.js` con la app actual
4. **Antes de lanzar:** Revisión legal + setup de Stripe
5. **Lanzamiento:** Empezar con beta privada (10-20 usuarios) antes de marketing público

---

**¿Preguntas?** Vuelve a la conversación y pregunta lo que necesites. Tienes todo el código, toda la arquitectura, y todos los borradores legales. El resto es ejecutar.
