# resicodeo · Tu negocio creativo, en orden

> Aplicación web para que videógrafos independientes en México lleven el control de sus cobros, gastos e impuestos en RESICO sin contador.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-MVP-green.svg)
![Platform](https://img.shields.io/badge/platform-Web-purple.svg)

## ✨ Características

- 📥 **Registro de cobros** con cálculo automático de subtotal, IVA y retenciones
- 💸 **Registro de gastos deducibles** con acreditación de IVA
- 📊 **Resumen mensual** con cálculo automático de ISR e IVA según las tasas RESICO 2026
- 📅 **Reportes anuales** con gráfica de ingresos y monitoreo del límite RESICO ($3.5M)
- 🎯 **Soporte multi-cliente**: personas físicas, morales (con retenciones), extranjeros
- 💾 **Almacenamiento local** entre sesiones
- 📤 **Exportación de datos** en formato JSON
- 🌙 **Diseño dark mode** con identidad visual propia

## 🎨 Identidad visual

- **Tipografía:** Plus Jakarta Sans
- **Color primario:** `#7B6DFF` (morado vibrante)
- **Fondo:** `#0F1115` (negro profundo)
- **Tagline:** *Menos estrés fiscal, más historias que contar.*

## 🚀 Cómo usar

### Opción 1 — Online
Abre [https://tuusuario.github.io/resicodeo](https://tuusuario.github.io/resicodeo) en cualquier navegador moderno.

### Opción 2 — Local
```bash
git clone https://github.com/tuusuario/resicodeo.git
cd resicodeo
# Abre index.html en cualquier navegador
# O sirve con un servidor local:
python3 -m http.server 8000
# Visita http://localhost:8000
```

## 📂 Estructura del proyecto

```
resicodeo/
├── index.html          # Aplicación completa (HTML + CSS + JS)
├── README.md           # Este archivo
├── LICENSE             # Licencia MIT
├── .gitignore          # Archivos ignorados por Git
└── docs/
    ├── ROADMAP.md      # Plan a futuro
    ├── DEPLOYMENT.md   # Cómo publicar en stores
    └── images/         # Capturas de pantalla
```

## 🧮 Lógica de cálculo

### ISR mensual RESICO

| Ingresos mensuales | Tasa |
|---|---|
| Hasta $25,000 | 1.00% |
| Hasta $50,000 | 1.10% |
| Hasta $83,333.33 | 1.50% |
| Hasta $208,333.33 | 2.00% |
| Hasta $3,500,000 anual | 2.50% |

### IVA mensual

```
IVA a pagar = IVA cobrado − IVA acreditable (gastos con factura) − IVA retenido
```

### Retenciones de personas morales (servicios profesionales)

- ISR retenido: 10% del subtotal
- IVA retenido: 2/3 del IVA trasladado (10.6667% del subtotal)

## ⚠️ Disclaimer legal

Esta aplicación es una herramienta de control personal. **NO** presenta declaraciones ante el SAT ni emite CFDI. Los cálculos son una guía basada en las reglas vigentes a 2026; siempre verifica en sat.gob.mx antes de declarar. Ante dudas, consulta con un contador o llama a PRODECON al 55 1205 9000 (asesoría gratuita).

## 🛣️ Roadmap

Ver [docs/ROADMAP.md](docs/ROADMAP.md) para el plan detallado:

- [ ] Backend con cuentas de usuario (Supabase / Firebase)
- [ ] Sincronización entre dispositivos
- [ ] App móvil nativa (React Native / Capacitor)
- [ ] Integración con CFDI XML para autocompletar
- [ ] Recordatorios push antes del día 17
- [ ] Modo claro alternativo
- [ ] Multi-régimen (no solo RESICO)
- [ ] Modelo freemium con suscripción

## 🤝 Contribuir

Las pull requests son bienvenidas. Para cambios mayores, abre un issue primero para discutir qué te gustaría cambiar.

## 📄 Licencia

[MIT](LICENSE) — eres libre de usar, modificar y distribuir este código.

## 👤 Autor

Hecho con ❤️ para la comunidad de creadores audiovisuales en México.

---

*resicodeo no está afiliado, ni avalado por el SAT.*
