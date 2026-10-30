# Life Reset 66 — motor de reglas (TypeScript)

Motor puro (sin dependencias) que implementa la especificación v1.0. Es **event-sourced**: se le pasa un `DayInput` por día
y calcula XP, piso, estadísticas, rachas, puertas y mascotas. Todo el historial se puede recalcular con `replay()`.

- `src/engine/engine.ts` — clase `Engine` (`processDay`, `statOk`, `floor`, `petLevels`) y `replay`.
- `src/engine/config.ts` — todos los valores del diseño (A = 5150, puertas 2/4/6/8, mascotas 10/13/17/20/30).
- `src/engine/calendar.ts` — semanas lunes→domingo, mes = el de su jueves.
- `test/golden.test.ts` — 22 pruebas contra el simulador Python (`tools/export_golden.py` regenera `test/golden.json`).

Correr: `npm test` (usa `tsx`) · `npm run typecheck`.
Regla de mascota: solo la **equipada** aporta a la puerta (`petsMustBeEquipped`).
