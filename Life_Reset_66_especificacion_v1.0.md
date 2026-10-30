# LIFE RESET 66 — Especificación de lógica v1.0 (XP, pisos, estadísticas, puertas, rachas, mascotas)

Documento para el desarrollador (Programa B). Todo número sale de `lr66_sim_v7.py` (simulador diario determinista, calendario real desde el lunes 2-nov-2026); `escenarios_v7.py` reproduce los resultados. Es la versión final con todas las decisiones del diseñador.

## 1. Requisitos inamovibles y su estado

| Requisito | Estado |
|---|---|
| Diaria = 50 XP base, nunca multiplicada | Cumple |
| Año perfecto → piso 100 abierto en 12 meses (día más/menos) | Día 364 (12,0 m) |
| Dificultad exponencial por nivel | Costo ×1,015 por nivel |
| Nunca más de un piso por día; único freno = puerta sin cumplir | 0 días con +2 pisos en todas las simulaciones; cociente máx. XP del día / costo del nivel siguiente = 0,81 |
| Gimnasio mensual = 18 sesiones | Cumple |

## 2. Curva de nivel (piso = nivel)

- `costo(n → n+1) = 5150 · 1,015^(n−1)`. XP acumulada para estar en el nivel L: `5150 · (1,015^(L−1) − 1) / 0,015`.
- Referencias: nivel 1→2 = 5.150 · nivel 10→11 = 5.888 · 50→51 = 10.682 · 100 = 22.488 (acumulada para llegar al 100: 1.155.848).
- **A debe recalibrarse (`calibrate()`) y redondearse hacia abajo a múltiplos de 50 cada vez que cambie cualquier valor de XP, multiplicador o puerta.** A = 5.150 da el piso 100 el día 364; A = 5.200 se pasa del año.

## 3. Recompensas de XP (valores base)

Toda misión semanal o mensual paga por **unidades de avance fechadas**, máximo 1 unidad por misión y por día. Esto es lo que garantiza estructuralmente el límite de un piso por día. Fallar una misión no quita lo ya cobrado.

| Estadística | Diaria (L–V) | Semanal (pozo 300) | Mensual (pozo 1.500) |
|---|---|---|---|
| Fuerza | 50 | 3 sesiones × 100 | 18 sesiones × 83,3 |
| Inteligencia | 50 | 3 sesiones × 100 | libro en 10 tramos × 150 (1 tramo cada 10 %, máx. 1 por día) |
| Vitalidad | 50 | 3 sesiones × 100 | 12 sesiones × 125 |
| Disciplina | — | 3 días de trabajo × 100 | 2 chequeos semanales (miér. y dom.) × 1.500/(2·semanas); cumplido si el último chequeo está "al día" |
| Orden | 50 | 6 ambientes × 50 (máx. 1 por día) | mejora en 6 días de trabajo × 250 |

Día pico teórico (una unidad de cada misión): 1.258 XP base.

## 4. Calendario, multiplicador y rachas

- Semana = lunes a domingo, perteneciente al mes de su jueves (4 o 5 semanas por mes).
- `s` = meses consecutivos cerrados con ≤1 categoría mensual fallada.
- Si `s ≥ 1`: unidades semanales y mensuales ×(1 + s), sin tope. Si `s = 0`: bonus semanal ×1,0/1,2/1,3/1,4/1,5 según semanas consecutivas previas en el mes; mensuales ×1. **Las diarias nunca se multiplican.**
- Cierre de mes: ≥2 categorías mensuales falladas → `s = 0`; si no, `s += 1`.
- **Mes bloqueado** (bloqueado por estadísticas al cierre, o más de 14 días bloqueado por estadísticas en el mes): `s` no suma ni se reinicia. Un bloqueo solo por falta de racha NO congela la racha (si no, nunca se desbloquearía).
- Cierre de semana: ≥2 categorías semanales falladas → racha semanal a 0.

## 5. Estadísticas (5: Fuerza, Inteligencia, Vitalidad, Disciplina, Orden)

- Sin XP propia. Semanal cumplida: +1 punto. Objetivo mensual fallado: −1 (mínimo 0). Mensual cumplido: solo XP.
- **Tope** = ⌊piso de la próxima visagra no superada / 2⌋ (5, 10, 15 … 50). Los puntos por encima del tope se pierden. Superada la visagra 100, no hay tope.
- Con el XP congelado, una estadística por debajo del tope **sigue subiendo**; una que está en el tope no.
- Las penalizaciones siguen aplicando durante un bloqueo.
- Ignorar una estadística por completo bloquea para siempre (simulación: clavado en el piso 20).

### Disciplina: prueba semanal y antiobjetivos
- Antiobjetivos: más de 3 sesiones de videojuegos en la semana, o promedio semanal de celular > 5 h. Violar cualquiera cuenta como fallo.
- Prueba semanal = 3 días de trabajo del objetivo.
- Prueba cumplida y sin antiobjetivo violado → +1 punto. Prueba cumplida con antiobjetivo violado → sin punto. Prueba fallada sin antiobjetivo violado → sin punto.
- **Prueba fallada Y antiobjetivo violado → −1 punto de Disciplina** (mínimo 0) [el punto "cumplida + antiobjetivo violado = sin punto" fue un supuesto mío].

## 6. Puertas

Al llegar al umbral de una puerta, el XP se recorta justo en el umbral del piso y el sobrante se pierde. El personaje queda bloqueado hasta cumplir **todas** las condiciones. Lo registrado durante el bloqueo queda en el historial sin XP y no es retroactivo. Se desbloquea en el instante en que se cumple todo, y el XP de la unidad que desbloquea sí se cobra.

### 6.1 Puertas visagra (estadísticas), cada 10 pisos
| Piso | Combinación | Tope | Requisito (90 % redondeado ↓) |
|---|---|---|---|
| 10 | Fuerza + Inteligencia | 5 | 4 |
| 20 | Inteligencia + Orden | 10 | 9 |
| 30 | Orden + Disciplina | 15 | 13 |
| 40 | Disciplina + Vitalidad | 20 | 18 |
| 50 | Vitalidad + Fuerza | 25 | 22 |
| 60 | Fuerza + Orden | 30 | 27 |
| 70 | Inteligencia + Disciplina | 35 | 31 |
| 80 | Orden + Vitalidad | 40 | 36 |
| 90 | Disciplina + Fuerza | 45 | 40 |
| 100 | Fuerza + Inteligencia | 50 | 45 |

Cada estadística de la combinación cumple con `propia + aporte de la mascota ≥ requisito`. La mascota equipada solo aporta a su propia estadística, así que una de las dos estadísticas debe cumplirse por mérito propio.

### 6.2 Puertas de racha
| Piso | Racha mensual activa requerida |
|---|---|
| 25 | 2 meses |
| 50 | 4 meses |
| 75 | 6 meses |
| 100 | 8 meses |

El piso 100 exige además su visagra (§6.1).

## 7. Mascotas

- 5 mascotas, una por estadística, todas disponibles desde el día 1. Solo se equipa una a la vez; rotarlas es libre y no les quita nivel. Las no equipadas conservan nivel y no se alimentan ni bajan.
- Niveles 0 a 5. Alimentación semanal perfecta → +10 XP de mascota a la equipada. Costos de nivel: 10, 13, 17, 20, 30 XP (≈9 semanas por mascota; las cinco al nivel 5 en la semana 45 con juego perfecto). Si la equipada ya está al máximo, el XP se pierde.
- **Aporte en una visagra** = mín(nivel de la mascota, ⌊10 % del tope⌋) = 0,1,1,2,2,3,3,4,4,5 para las visagras 10…100.
- **Penalidad por racha de semanas falladas** (cierre de domingo, contador de la cuenta, no de la mascota): semana perfecta → sube y el contador vuelve a 0 · 1ª fallada → no sube, sin pérdida · 2ª fallada seguida → baja 1 nivel (queda al inicio del nivel anterior) · cada fallada seguida siguiente → baja 1 nivel más, hasta 0. Una semana perfecta corta la racha. Aplica a la mascota equipada ese domingo.

## 8. Orden de procesamiento (diario)

Por cada evento registrado:
1. Calcular el multiplicador del período.
2. Si la unidad completa una semanal, otorgar el punto de estadística respetando el tope; si completa un objetivo mensual, marcarlo.
3. Si el personaje está bloqueado y las condiciones de la puerta ya se cumplen, desbloquear antes de pagar.
4. Bloqueado → registrar XP perdido por bloqueo (motivo: estadísticas o racha). No bloqueado → acreditar; si cruza el umbral de una puerta, recortar y evaluar.
5. Registrar evento auditable (XP base, multiplicador, estado, XP otorgado o perdido, estadística, motivo).

Cierres: domingo → pruebas semanales de Disciplina, rachas semanales, alimentación y penalidad de mascota. Fin de mes → −1 por mensual fallado, racha mensual.

## 9. Resultados verificados (simulación v7)

**Año perfecto (A = 5.150):** piso 100 abierto el día 364 (12,0 m) · 0 días bloqueado · 0 % de XP perdido · estadísticas finales F 52, I 52, V 52, D 53, O 53 · las cinco mascotas al nivel 5 en la semana 45. Llegadas: 10 → día 55 · 20 → 95 · 25 → 112 · 30 → 128 · 40 → 157 · 50 → 191 · 60 → 223 · 70 → 253 · 75 → 274 · 80 → 289 · 90 → 324 · 100 → 364.

| Escenario | Piso 100 abierto | vs. perfecto |
|---|---|---|
| Saltar Fuerza 6 sem. (desde sem. 10 / 25 / 40) con mascotas alimentadas | 12,7 / 12,7 / 12,1 m | +0,7 / +0,7 / +0,1 |
| Idem sin alimentar mascotas | 13,4 / 13,5 / 13,0 m | +1,4 / +1,5 / +1,0 |
| Saltar Orden 8 sem. desde la sem. 20 | 13,4 m | +1,4 |
| Disciplina: 6 sem. con prueba fallada, sin antiobjetivo | 12,1 m | +0,1 |
| Disciplina: 6 sem. con prueba fallada Y antiobjetivo | 13,8 m | +1,8 (6 penalidades) |
| Disciplina: 3 sem. con antiobjetivo violado, prueba cumplida | 12,0 m | +0,0 |
| Romper racha al llegar al piso 60 / 80 | 18,7 / 18,9 m | +6,7 / +6,9 |
| Romper racha en el mes 6 / 9 / 11 | 16,6 / 18,7 / 18,9 m | +4,6 / +6,7 / +6,9 |
| Ignorar una estadística todo el año | nunca | — |
| Mascotas sin alimentar con todo lo demás perfecto | 12,0 m | 0 (las mascotas solo cubren faltas de estadísticas) |

Monte Carlo (100 usuarios; p = probabilidad de cumplir cada actividad): p = 97 % → 100/100 terminan, mediana 12,3 m · p = 93 % → 100/100, mediana 21,8 m (P10 13,6; P90 44,0) · p = 88 % → solo 29/100 terminan, mediana 48,1 m.

**Un piso por día:** 0 días con +2 pisos en todos los escenarios y simulaciones. Cociente máximo 0,81.

## 10. Pendientes menores (no cambian el balance)

1. Disciplina semana 5 de un mes: sin objetivo mensual en el modelo.
2. Ambiente agregado a mitad de semana: propuesta, cuenta desde la semana siguiente.
3. Cómo se registran en la app las misiones binarias como unidades (chequeos de Disciplina, días de mejora de Orden, tramos del libro): definir en el diseño de la app.
4. Política de recálculo del historial si cambian los valores de XP y manejo de zona horaria (propuesta: America/Buenos_Aires fija por usuario, día cierra a las 00:00 local).
5. Las penalidades siguen aplicando durante un bloqueo [PROV, supuesto mío].
