# Cambios v1.1 (sobre la especificación v1.0)

Todos los campos nuevos son aditivos: el motor sigue aceptando las entradas v1.0 (pruebas de paridad intactas).

- **Disciplina:** sin misión diaria. La semanal se confirma el domingo con un formulario (`dweek`), con texto según la semana del mes (1: objetivos y prioridades; 2: proyectos iniciados; 3: proyectos cerrados o pendientes; 4: reportes y mes entrante planificado; 5: revisión general). Paga las 3 unidades (300 XP base) de una vez. La mensual de Disciplina se cumple si se cumplieron todas las semanales del mes; paga Mp/semanas cada domingo cumplido.
- **Antiobjetivos:** videojuegos se registran por sesión durante la semana (`gaming`, más de 3 = violado); celular > 5 h se responde en el formulario del domingo (`phone`).
- **Mascotas:** la alimentación es una misión diaria (`food`); 4 días en la semana (`foodDays`) cumplen la semanal y alimentan a la mascota equipada en el cierre del domingo (+10 XP de mascota). No da XP de torre.
- **Verificado (año perfecto, modo v1.1):** piso 100 abierto el día 365 (12,0 m), pico diario 0,70 del costo del piso siguiente, ningún día con +2 pisos.

## v1.2
- **Inteligencia mensual:** "Libro terminado" (una sola unidad, campo `book`). **Orden mensual:** "Arreglo en la casa" (`repair`). La misión se cumple el día en que se marca; el pozo de 1.500 XP base se paga en 6 cuotas diarias (`dripDays`), porque pagarlo de una vez producía 10 días de más de un piso. Aparecen en el cierre del último domingo del mes y en la pestaña Mensuales.
- **Orden semanal:** se limpia un ambiente por misión diaria (cocina, baño, habitación, living, oficina, patio); cada uno cuenta una vez por semana (`room`). Seis distintos completan la semanal.
- **Calibración:** A = 5.000 (antes 5.150). Año perfecto: piso 100 el día 364, pico diario 0,76 del costo del piso siguiente, 0 días con más de un piso.

## v1.3 — curva nueva (rápida al principio, lenta al final)
Objetivo: con juego perfecto desde el lunes 2-nov-2026, el piso 100 se abre alrededor del 31-dic-2027; la curva arranca rápida y termina mucho más lenta; jugar bien nunca pierde XP. Simulado con el motor real (`engine/test/v13.test.ts`).

- **Curva:** `costo(n → n+1) = 638 · 1,036^(n−1)` (638 XP el primer piso, ~20.300 el último; acumulado ~575.000). Antes 5.000 · 1,015^(n−1).
- **Multiplicador de racha con tope:** racha 1 mes ×1,5 · 2 ×2 · 3 ×2,5 · 4 o más ×3 (`multStep` 0,5, `multMax` 3). Antes 1 + racha, sin tope: era lo que hacía que la curva fuera lenta al principio y rápida al final.
- **Un piso por día, sin pérdida:** si un día ya subió un piso, el XP que sobra se cobra al día siguiente (`dayFloorCap` = 1, eventos tipo `C`). Antes la regla se cumplía solo por calibración y obligaba a que los primeros pisos fueran caros.
- **Puertas de estadísticas** (lo que un jugador perfecto ya tiene dos semanas antes de llegar, máximo 90 % del tope): 10 → 1 · 20 → 2 · 30 → 4 · 40 → 8 · 50 → 12 · 60 → 16 · 70 → 22 · 80 → 30 · 90 → 40 · 100 → 45 (`statReq`). Combinaciones y topes sin cambios.
- **Puertas de racha:** 25 → 1 mes · 50 → 2 · 75 → 5 · 100 → 8.
- **Recompensas sin cambios:** diaria 50 (L–V, nunca multiplicada), semanal 300, mensual 1.500.
- **Armadura:** cambia después de vencer a cada jefe (pisos 26, 51 y 76), no al llegar al jefe.

| Piso | Juego perfecto | Días por piso en el tramo |
|---|---|---|
| 10 | día 9 (11-nov-2026) | 1,0 |
| 25 | día 34 (6-dic-2026) | 1,7 |
| 50 | día 95 (5-feb-2027) | 2,4 |
| 75 | día 191 (12-may-2027) | 3,8 |
| 100 | día 422 (29-dic-2027) | 9,2 |

Escenarios (motor real): falla 1 día por semana → 5-ene-2028 · 97 % de cumplimiento al azar → 5-ene-2028 · 93 % → 9-ene-2028 · 88 % → 8-feb-2028 · nunca el libro → 15-feb-2028 · romper la racha en el mes 6 → 10-may-2028 · ignorar Orden, o no hacer ninguna mensual → bloqueado para siempre (piso 20 / 25).
Las pruebas de paridad con el simulador v7 usan `LEGACY_CONFIG` (balance v1.2).
