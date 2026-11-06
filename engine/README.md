# Motor de reglas de Rise

`src/engine/rise.ts` calcula todo a partir de las entradas diarias (event-sourced): `new Rise(config).run(...)`.
`src/engine/calendar.ts` convierte día ↔ fecha. Pruebas: `npm test` desde la raíz del repo.
