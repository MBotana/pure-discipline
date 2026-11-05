# Rise — especificación v2.0 (sistema de estadísticas con XP)

Reemplaza el modelo de misiones/pisos/mascotas de v1.x. Simulador: `tools/sim_v2.py` y `tools/sim_v2_scenarios.py` (`python3 tools/sim_v2_scenarios.py`).
Inicio: lunes 2-nov-2026. Semana = lunes a domingo. Nada baja nunca (niveles, estadísticas, XP) y el XP ganado no se pierde aunque haya una puerta cerrada.

## 1. Estadísticas y nivel
- 5 estadísticas: Fuerza, Inteligencia, Vitalidad, Disciplina, Orden. Nivel de cada una: 0–20.
- Costo del nivel n→n+1: `1000 · 1,10^(n−1)` XP (1.000 el primero, ~6.100 el último; ~57.300 en total por estadística).
- Nivel del héroe = suma de las cinco (máx. 100) = piso máximo accesible.
- Una semana perfecta rinde ~1.000 XP por estadística (parejo entre ellas).
- Las estadísticas **no** llevan multiplicador de racha.

## 2. Ganancia de XP
| Estadística | Diario | Semanal (todo o nada, se cobra el domingo) | Mensual (todo o nada) |
|---|---|---|---|
| Fuerza (gimnasio + boxeo) | 1,6 XP/min presente, tope 120 min/día | +250 si ≥ 6 h | +650 si ≥ 24 h |
| Inteligencia | 60 por día leído (casilla) | — | Libro: el 1º del mes 2.500, los siguientes 1.250 |
| Vitalidad | Comida L–V: 105 × % de Gemini (0 si no cargó). Agua (todos los días, meta 2,5 L): +15 | +250 si el promedio L–V ≥ 80 % | +650 si el promedio del mes ≥ 80 % |
| Orden | 1ª limpieza del día 100 (máx. 5 días/semana pagados); cada ambiente extra el mismo día 40 (solo la 1ª vez en la semana) | +250 si limpió ≥ 5 de los 6 ambientes distintos | Arreglo: el 1º del mes 1.100, los siguientes 550 |
| Disciplina | — | +750 si las horas de juego ≤ tope (15 h) | +1.100 si cumplió todas las semanas del mes |

Gimnasio y boxeo: presencia detectada por ubicación (llegada/salida); una sesión cuenta desde 40 min.
Comida: fin de semana libre (no puntúa). Los registros no se editan ni se borran.

## 3. Mascota (sombra; por ahora «Bahamut»)
- 100 niveles. Costo del nivel n: `369,1 · 1,03^(n−1)` XP. Cada nivel = 1 punto de estadística a elección, máx. 20 por estadística, sin reasignar. Los puntos se suman a los del héroe para las puertas.
- Solo gana XP del gimnasio:
  - Sesión: 100 × multiplicador (máx. 5 pagadas por semana; boxeo cuenta).
  - Progreso: semana de carga = más peso que tu mejor marca en un ejercicio (con repeticiones ≥ piso del rango); semana de descarga = más repeticiones con el mismo peso que la última vez en descarga; peso nuevo en descarga = base, no cuenta. Cada progreso 150 × multiplicador. Bono semanal +300 si hubo al menos un progreso (si no, solo se pierde ese bono).
  - Ciclo de 4 semanas (3 carga + 1 descarga): +1.000 si progresó en 4 ejercicios distintos.
- Racha de semanas (multiplicador, no se suman los escalones):
  - Semana 1: 5 sesiones mínimas; escalón de sesión x1,0 → x1,125 → x1,25 → x1,375 → x1,5.
  - Semanas 2/3/4: x2 / x2,25 / x2,5, mínimo 4 sesiones.
  - Desde el mes 2: x3, +0,5 por mes, tope x6, mínimo 3 sesiones.
  - No llegar al mínimo corta la racha (reinicio en semana 1, vuelve a exigir 5). El XP ya ganado no se pierde.
- Retos y calorías/Strava/Salud: fuera de alcance (se elimina la misión aeróbica).

## 4. Puertas (cada 10 pisos)
Mínimo en CADA estadística, sumando héroe + mascota: 10→3, 20→6, 30→9, 40→13, 50→16, 60→20, 70→24, 80→27, 90→32, 100→40.
Parado en una puerta, el piso no sube hasta cumplir el requisito; el XP se sigue acumulando.

## 5. Pantallas
- Barra inferior: Objetivos · Torre (centro) · Campamento. Ajustes = engranaje arriba a la derecha.
- Objetivos: tablero del día. Automático (gimnasio, juegos) solo se muestra; Comidas (carga + % en vivo); Agua; 6 ambientes tocables; casilla «Leí hoy»; «Confirmar día» (cierra a mano, permite «Reabrir», y se re-chequea al día siguiente; si no se confirma, la sincronización de la mañana lo cierra con lo cargado). Semana y Mes como hoy.
- Torre: escena + próxima puerta con barras + Registro (rachas, libros, arreglos) + camino de puertas + diario.
- Campamento: Héroe (nivel, 5 estadísticas, Récords, Logros), Mascota (nivel arriba con barra de XP; al tocarlo se despliegan sus estadísticas, con punto titilante si hay un punto sin asignar; área tamagochi con escenas al azar) y Gimnasio (rutina y pesos).

## 6. Resultados de la simulación (200 corridas por escenario, 31-dic-2027 como referencia)
| Escenario | Piso 100 | Al 31/12/2027 |
|---|---|---|
| Perfecto | 20/12/2027 | piso 100, mascota 100 |
| Perfecto con 4 semanas sin entrenar (sem. 30–33) | 19/03/2028 | piso 99, mascota 92 |
| 80 % | ago. 2028 | piso 88, mascota 91 |
| 60 % | después de 2030 | piso 72, mascota 62 |

## 7. Migración
Se recalcula desde el 2-nov-2026 con los datos guardados (gym min, comidas aprobadas, lecturas, ambientes, horas de juego). Las estadísticas empiezan de cero con ese XP.

## 8. Pendiente / por decidir
- Rutina (ejercicios, rangos de repeticiones, días) y detección de boxeo por ubicación.
- Modo enfermedad/viaje: postergado.
- Escenario del 60 %: la racha casi nunca arranca (5 de 5 la primera semana); decidir si se suaviza.
