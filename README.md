# Set ∞

PWA de hábitos gamificada (un solo usuario). Cloudflare Worker + D1, sin dependencias de ejecución.

- `engine/src/engine/rise.ts` — motor de reglas: reproduce desde la fecha de inicio todos los días registrados (XP, niveles 1–99, estadísticas, semanas de carga/descarga, bestia). Tests en `engine/test/`.
- `engine/src/engine/calendar.ts` — semanas de lunes a domingo.
- `public/` — la app (`app.js`, `style.css`, `phrases.js`, `assets.js`) y `rise.js`, generado con `npm run build:rise`.
- `src/worker.ts` — API: sincronización, gimnasio, alimentación y plan de cargas con Gemini, notificaciones, Steam, Telegram.
- `test/` — pruebas del servidor y servidor de desarrollo (`npx tsx test/devserver.ts`).

Correr pruebas: `npm test`. Publicar: push a `main` (se despliega solo).

Imágenes en `public/img/`: `sombra_heroe.png`, `sombra_bestia.png` (personajes de fondo), `icono_*.png` (íconos), y opcionalmente `ambiente_<id>.png` para los ambientes de Orden.
