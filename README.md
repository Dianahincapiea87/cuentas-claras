# Cuentas Claras

App para organizar los gastos del hogar en pesos colombianos.

- Compras con sus artículos, cada uno marcado como **Solo yo** o **Repartir ÷N**.
- Foto del recibo en cada compra.
- **Gastos fijos** (arriendo, servicios, internet…) que se suman solos cada mes, con pagado, valor del mes y omitir.
- Vistas **Por categoría** y **Por tipo** (Básico, Fijo, Extra).
- Resumen del mes: ingreso, mi gasto y lo disponible.
- **Cuaderno de la semana** para anotar cómo mejorar y los gastos inesperados.
- Exportar a Excel (CSV).
- Se instala en el celular y en el computador, y funciona sin internet.

## Dónde quedan los datos

Las compras, notas y fotos se guardan **solo en el dispositivo** donde usas la app, no en este repositorio.
Para pasarlas de un dispositivo a otro, o para no perderlas, usa **Guardar respaldo** y **Cargar respaldo**.

> No subas tus archivos de respaldo (`cuentas-claras-respaldo-*.json`) a este repositorio: tienen tus compras y las fotos de tus recibos.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app |
| `almacen.js` | Guarda los datos y fotos en el dispositivo |
| `manifest.webmanifest` | Nombre, colores e íconos para instalarla |
| `sw.js` | Permite usarla sin internet |
| `icon-*.png`, `apple-touch-icon.png` | Íconos |

## Publicar una versión nueva

1. Reemplaza los archivos que cambiaron en el repositorio.
2. En `sw.js`, sube el número de `CACHE` (por ejemplo, de `cuentas-claras-v1` a `cuentas-claras-v2`).
3. Abre la app con internet; la versión nueva carga al abrirla de nuevo.
