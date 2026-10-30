# Imágenes de Pure Discipline

Poné los PNG en esta carpeta con el **nombre exacto**. Si un archivo no está, la app usa un dibujo provisorio.
Fondo transparente en los sprites, sin suavizado (pixel art puro). La app los muestra ×2.

| Archivo | Tamaño | Qué es |
|---|---|---|
| `heroe_t1_e1.png` … `heroe_t4_e3.png` (12) | 32×40 | Héroe quieto. `t` = armadura 1-4, `e` = etapa 1-3. Cambia en los pisos 1/10/20, 25/35/45, 50/60/70, 75/85/95 |
| `heroe_tX_eY_diaria.png`, `_semanal.png`, `_mensual.png` | 32×40 | Festejo al cumplir una misión diaria / semanal / mensual (36 en total). Si falta, el héroe salta |
| `heroe_tX_eY_mueca.png` (12) | 32×40 | Mueca de decepción al registrar una sesión de videojuegos o violar un antiobjetivo |
| `mascota_behemot_n0.png` … `n5.png` | 32×32 | Fuerza. `n0` = huevo, `n5` = adulto |
| `mascota_esfinge_n0..n5.png` | 32×32 | Inteligencia |
| `mascota_fenix_n0..n5.png` | 32×32 | Vitalidad |
| `mascota_grifo_n0..n5.png` | 32×32 | Disciplina |
| `mascota_qilin_n0..n5.png` | 32×32 | Orden |
| `icono_fuerza.png`, `icono_inteligencia.png`, `icono_vitalidad.png`, `icono_disciplina.png`, `icono_orden.png` | 16×16 | Íconos de estadísticas |
| `torre_cerrada.png`, `torre_abierta.png` | 240×64 | Escena de la torre con la puerta cerrada / abierta (antes del inicio) |
| `torre_apertura_1.png` … `_6.png` (opcionales) | 240×64 | Cuadros intermedios de la puerta abriéndose (se usan los que existan, ~0,5 s cada uno) |
| `fondo_01.png` … `fondo_12.png` | 240×64 | Fondos. 01: pisos 1-10 · 02: 11-24 · 03: 25 · 04: 26-35 · 05: 36-49 · 06: 50 · 07: 51-60 · 08: 61-74 · 09: 75 · 10: 76-85 · 11: 86-99 · 12: 100 |
| `jefe_25.png`, `jefe_50.png`, `jefe_75.png`, `jefe_100.png` | 48×48 | Jefes (aparecen a la derecha) |

Los pies del héroe, de la mascota y del jefe se apoyan en la misma línea del suelo (unos 6 px sobre el borde inferior del fondo).
Para ver un cambio en el iPhone, cerrá y abrí la app dos veces (usa caché).
| `marco.png` (opcional) | 24×24 | Marco de los paneles: se estira en 9 partes, con esquinas de 6 px. Si no existe, la app usa un marco dibujado por código |
| `ambiente_cocina.png`, `ambiente_bano.png`, `ambiente_habitacion.png`, `ambiente_living.png`, `ambiente_oficina.png`, `ambiente_patio.png` | 48×48 | Cuadritos para elegir el ambiente que ordenaste (misión de Orden) |
