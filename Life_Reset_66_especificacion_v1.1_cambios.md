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
Objetivo: con juego perfecto desde el lunes 2-nov-2026, el piso 100 se abre alrededor del 31-dic-2027 y solo así; la curva arranca rápida y termina mucho más lenta; jugar bien nunca pierde XP. Simulado con el motor real (`engine/test/v13.test.ts`).

- **Curva:** `costo(n → n+1) = 605 · 1,039^(n−1)` (605 XP el primer piso, ~26.000 el último). Antes 5.000 · 1,015^(n−1).
- **Multiplicador de racha con tope, también para las diarias:** racha 1 mes ×1,5 · 2 ×2 · 3 ×2,5 · 4 o más ×3 (`multStep` 0,5, `multMax` 3, `dailyMult`). Con racha 0 sigue el bonus semanal ×1,0…×1,5. Antes 1 + racha sin tope y diarias sin multiplicar: era lo que hacía que la curva fuera lenta al principio y rápida al final.
- **Un piso por día:** el XP se suma completo el mismo día; el piso sube como máximo uno por día y alcanza al XP en los días siguientes (`dayFloorCap` = 1, campo `fl` del estado). La app avisa cuando el XP ya cubre pisos que todavía no se subieron.
- **Puertas de estadísticas** (lo que un jugador perfecto ya tiene dos semanas antes de llegar, máximo 90 % del tope): 10 → 1 · 20 → 2 · 30 → 4 · 40 → 7 · 50 → 12 · 60 → 15 · 70 → 20 · 80 → 29 · 90 → 40 · 100 → 45 (`statReq`). Combinaciones y topes sin cambios.
- **Puertas de racha:** 25 → 1 mes · 50 → 2 · 75 → 3 · 100 → 4.
- **Recompensas base sin cambios:** diaria 50 (L–V), semanal 300, mensual 1.500.
- **Orden semanal:** hay 6 ambientes; la semanal se cumple con 5 distintos (`namb` = 5, pago 300/5 por ambiente).
- **Armadura:** cambia después de vencer a cada jefe (pisos 26, 51 y 76).

| Piso | Juego perfecto | Días por piso en el tramo |
|---|---|---|
| 10 | día 9 (11-nov-2026) | 0,9 |
| 25 | día 32 (4-dic-2026) | 1,5 |
| 50 | día 93 (3-feb-2027) | 2,4 |
| 75 | día 185 (6-may-2027) | 3,7 |
| 100 | día 421 (28-dic-2027) | 9,4 |

Escenarios (motor real; el día del libro y del arreglo dentro del mes mueve el final entre el 21 y el 28-dic-2027, siempre sin perder XP):
falla un día por semana → 12-ene-2028 · falla el gimnasio un día por semana → 3-ene-2028 · cada misión al azar con 97 % → 6-ene-2028 · con 93 % → 5-jul-2028 · pierde 3 % de los días enteros → 28-mar-2028 · 7 % → 31-jul-2028 · nunca el libro → 30-ene-2028 · romper la racha en el mes 6 → 27-mar-2028 · falla 2 días por semana → 14-ene-2028 · ignorar Orden, o no hacer ninguna mensual → bloqueado para siempre (piso 20 / 25).
Las pruebas de paridad con el simulador v7 usan `LEGACY_CONFIG` (balance v1.2).

## v1.4 — alimentación por tipo de comida
- **Registro diario:** carne, verduras y basura (se puede marcar más de una; campos `meat`, `veg`, `junk`, y `meals` = registro confirmado). La diaria se cumple con carne o verduras; la basura sola no la cumple.
- **Semanal:** 3 o más días con carne, 3 o más con verduras y hasta 3 con basura (`foodRule`); 4 días con basura la hacen fallar. Al cierre del domingo alimenta a la mascota equipada (+10 XP de mascota); la penalidad por semanas falladas no cambia. No da XP de torre ni puntos de estadística.
- **Registro obligatorio:** si un día ya terminado quedó sin registrar, al abrir la app aparece un cartel que no se puede cerrar hasta registrar y confirmar ese día (de a uno, empezando por el más viejo).
- El campo `food` de la v1.1 sigue aceptándose como día aprobado (compatibilidad).

## v1.5 — Mediciones nuevas (fase 1: la app)

**Curva de XP sin cambios.** Simulación del juego perfecto (5 días por semana): el piso 100 se abre el 28-dic-2027 (día 421), 0 XP perdido, sin bloqueos. Con 4 gimnasios por semana termina el 3-ene-2028; con 3, el 19-ene-2028.

- **Compensación de fin de semana** (Fuerza, Vitalidad, Inteligencia, Orden): sábado y domingo pagan la diaria solo si faltó un día de lunes a viernes; máximo 5 diarias pagadas por semana y categoría. Nunca hay XP extra.
- **Fuerza:** semanal ≥ 3 sesiones; mensual 16 sesiones (promedio de 4 por semana). La detección por ubicación (≥ 40 min en el gimnasio) llega en la fase 2; por ahora es manual.
- **Orden:** 6 ambientes, se pueden marcar varios por día, alcanza con 5 de 6 por semana.
- **Disciplina:** solo horas de videojuegos por semana. Tope 15 h; avisos al 80 % y 95 %; hasta 100 % suma el punto (300 XP el domingo); entre 100 % y 120 % no suma; más de 120 % resta 1 de Disciplina. Las 2 primeras semanas se miden sin premio ni castigo. Se elimina el formulario del domingo, los objetivos de trabajo y el antiobjetivo del celular.
- **Inteligencia:** los libros se cargan en Estadísticas › Libros; el primero del mes cumple la misión al instante (el XP se reparte en 6 días).
- **Alimentación** (pestaña nueva, con Hoy · Semana · Mascotas): comidas por foto (guardadas en el teléfono hasta enviarlas) o texto; el veredicto de Claude se pega a mano. «Parcial» es un consejo; solo aprobado / no aprobado cierra el día. Un día sin veredicto bloquea la app al día siguiente. Supuesto a confirmar: la semana alimenta a la mascota con **5 días aprobados de 7**. No da XP de torre. La consigna para Claude es un primer borrador.
- **Estadísticas:** subpestañas Stats · Récords · Logros · Libros. Récords: esta semana vs. histórico (mejor y total) para gimnasio, aeróbico, lectura, ambientes, horas de juego (menos es mejor) y XP; calorías, distancia y pasos quedan para cuando se conecte el reloj.
- **Pendiente (fase 2+):** gimnasio por ubicación (Atajos de iPhone), Steam, datos del reloj (IMILAB KW66 → GloryFit → Salud), meta diaria de Vitalidad, modo viaje/enfermedad/lesión. Las fotos y el registro de comidas son locales (no se sincronizan).
