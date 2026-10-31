# Generar las imágenes con PixelLab (instrucciones para Claude Code)

Objetivo: producir los PNG de `public/img/` con los **nombres y tamaños exactos** de `public/img/LEEME.md`, usando las herramientas MCP de PixelLab (`create_character`, `animate_character`, `create_image_pro_flash`, etc.).

## Reglas generales
- **Antes de empezar**, llamá a `get_balance`. Hacé siempre **una prueba** antes de cada tanda y mostrámela; seguí solo si apruebo.
- Trabajá **por tandas** y pará al final de cada una: 1) héroe, 2) mascotas, 3) jefes e íconos, 4) fondos. No generes todo de golpe.
- **No sobrescribas** ningún PNG existente de `public/img/` sin preguntarme. Ya existe `heroe_t1_e1.png` (aprobado).
- Cámara **de lado** (side / sidescroller). El juego solo usa la dirección **east** (mirando a la derecha): no gastes créditos en otras direcciones ni animaciones de otras direcciones.
- Las creaciones son asíncronas (2-5 min): consultá con el `get_*` correspondiente y descargá con el enlace.
- Cada imagen descargada se ajusta con `python3 tools/ajustar.py ENTRADA SALIDA ANCHO ALTO` (recorta sin reescalar).
- Anotá en `GENERADO.md` qué se creó (nombre, id de PixelLab, fecha) y qué falló o hay que repetir.
- No hagas commit: lo hago yo después de revisar.

## Tanda 1: héroe (32×40 final; en PixelLab: tamaño 40×40)
Mismo personaje en las 12 versiones: hombre adulto musculoso, piel bronceada típica de espartano, pelo castaño y barba corta (solo visibles cuando no hay casco). Usá `heroe_t1_e1.png` como referencia visual y mantené proporciones.
Nombres: `heroe_tT_eE.png` (quieto, vista east). Animación **Walking de 6 cuadros**, solo east → `heroe_tT_eE_correr_1.png` … `_6.png`.
Pruebas: primero t1_e2 y t1_e3; recién con mi OK seguí con t2, t3, t4.

Prompts (en inglés, repetir la base en cada uno):
- **t1_e1 (ya hecho):** Gladiator. Leather sandals, arm guards, and loincloth. No breastplate, shoulder guards, or helmet. A short, one-handed sword, held in a resting position (pointing toward the ground and forward). Facial features and skin tone typical of a Spartan.
- **t1_e2:** Gladiator, side view, same character: muscular adult man, tanned skin typical of a Spartan, brown hair and short beard. Leather sandals and loincloth. Short one-handed sword held resting, pointing toward the ground and forward. New: a single large gladiator shoulder guard (manica) covering the entire sword arm from shoulder to wrist, dark leather with metal rivets; steel bracers on the forearms replacing the leather arm guards; steel shin guards (greaves). No breastplate, no helmet, bare chest.
- **t1_e3:** Gladiator, side view, same character: muscular adult man, tanned skin typical of a Spartan. Leather sandals and loincloth. Short one-handed sword held resting, pointing toward the ground and forward. Large gladiator shoulder guard (manica) covering the entire sword arm, dark leather with metal rivets. New: golden bracers and golden shin guards replacing the steel ones; a gladiator helmet with visor and crest (so no face details needed); a small round golden buckler held in the other hand, close to the torso. No breastplate, bare chest.
- **t2 (espartano) e1–e3, t3 (caballero) e1–e3, t4 (dragón) e1–e3:** BORRADOR, proponeme los prompts y esperá mi aprobación antes de generar. Ideas: espartano = coraza de bronce, casco corintio con cresta roja, capa roja, escudo hoplon, lanza o espada corta; caballero = armadura de placas de acero, yelmo cerrado, tabardo, espada larga y escudo heráldico; dragón = armadura de escamas con detalles dorados y rojos, casco con cuernos de dragón, capa, espada con filo flamígero. Cada etapa (e1, e2, e3) suma piezas o brillo respecto a la anterior de la misma armadura.
- **Poses (festejos `_diaria`, `_semanal`, `_mensual`, `_mueca`):** opcionales, dejalas para el final. Si PixelLab permite animar con texto, probá con t1_e1: diaria = puño en alto, semanal = brazos en alto, mensual = salto con espada en alto, mueca = cara de decepción con hombros caídos. Si el resultado no sirve, no las generes (la app usa un salto provisorio).

## Tanda 2: mascotas (32×32)
Una especie por estadística, 6 niveles: `mascota_<clave>_n0.png` (huevo) … `n5.png` (adulto). Mismo animal creciendo; cada nivel más grande y detallado.
Claves: behemot (Fuerza), esfinge (Inteligencia), fenix (Vitalidad), grifo (Disciplina), qilin (Orden).
Quietas: n0 a n5. Corriendo: `mascota_<clave>_nN_correr_1..4.png` para N=1 a 5 (el huevo no corre), vista east, mínimo 2 cuadros.
Mostrame primero Behemot n0, n1 y n5 para aprobar el estilo.

## Tanda 3: jefes (48×48) e íconos (16×16)
- `jefe_25` gladiador enorme y musculoso con un hacha · `jefe_50` León de Nemea gigante · `jefe_75` dragón gris · `jefe_100` Zeus rodeado de ángeles. Miran a la izquierda (el héroe viene de la izquierda).
- `icono_fuerza`, `icono_inteligencia`, `icono_vitalidad`, `icono_disciplina`, `icono_orden`: 16×16.
- Opcionales: `ambiente_cocina/bano/habitacion/living/oficina/patio.png` (48×48).

## Tanda 4: fondos (240×64)
`fondo_01.png` … `fondo_12.png`: paisaje de lado con suelo, **se repite sin cortes hacia los lados** (el borde izquierdo debe empalmar con el derecho). Zonas: 01 ruinas quemadas, oscuridad y fuego · 02 ruinas destruidas de día · 03 coliseo destruido · 04 campo de batalla con soldados peleando · 05 campo de batalla con soldados muertos y lanzas clavadas · 06 campo de batalla abierto · 07 montaña baja con nubes oscuras · 08 montaña alta sobre las nubes, soleado · 09 cima de la montaña · 10 camino en el cielo · 11 camino en el cielo con ángeles · 12 trono de Zeus rodeado de ángeles.
Probá primero con `fondo_01`. Si la herramienta no logra que empalme, repará los bordes con un script (por ejemplo espejando o mezclando 8-16 px del borde) y avisame.
