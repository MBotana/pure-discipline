# Imágenes generadas con PixelLab

## Rehecho de animaciones t1_e3 y caminar t1_e2 (2026-11-01)
El quieto `heroe_t1_e3.png` no se tocó. Todo lo demás de e3 se rehízo copiando el **movimiento** de e1/e2 y poniéndole el **atuendo** de e3 con `transfer_outfit` (referencia: `heroe_t1_e3.png`). Reemplaza a las animaciones de e3 de la tabla de más abajo.

| Archivos | Movimiento base | Job(s) PixelLab | Notas |
|---|---|---|---|
| `heroe_t1_e3_correr_1..8` | `heroe_t1_e2_correr_1..8` | `d2edf79c-4c75-4e97-ac5d-22a19adeb779` | seed 42. La rodela no se ve en 2-5 (brazo detrás del cuerpo, como en e2) |
| `heroe_t1_e3_sprint_1..8` | `heroe_t1_e1_sprint_1..8` | `46e6d5b7-3cb1-4596-9bb3-3bf53de28da9` | seed 42 |
| `heroe_t1_e2_caminar_1..8` (antes 5 cuadros) | `heroe_t1_e1_caminar_1..8` | `d2df511d-e793-49b2-bf3b-6ba502eec84e` + cuadro 3 con `edit_image` `02d04c0a-60c1-461e-9bc7-bee51c834b4a` | El cuadro 3 había perdido la manica |
| `heroe_t1_e3_caminar_1..8` | `heroe_t1_e2_caminar` nuevo | `891fdbfd-2757-423e-a49f-ae17da36a7ac` | seed 42. Partir de e1 salía raro (botas doradas, manica perdida); desde e2 solo cambian casco, dorado, falda y rodela |
| `heroe_t1_e3_respirar_1..8` | ritmo de `heroe_t1_e2_respirar` | cuadro 1 de `0a6d41f1-c2fd-4f23-961d-2e8c05a260bc` | Animado por código: cabeza (filas 0-8) y piernas (33-39) fijas; filas 9-32 suben 1 px en los cuadros 4-7, igual que e2. La transferencia directa movía todo el cuerpo |

Lección: `transfer_outfit` sobre una animación ya aprobada del mismo personaje es lo más fiable (≈10 generaciones por animación de 8 cuadros). Conviene partir de la etapa con el atuendo más parecido. `sw.js`: caché `pd-v21`.

## Integración en la app (2026-10-31)
- `public/img/`: 92 PNG nuevos de t1 (quietos `heroe_t1_e2.png` y `heroe_t1_e3.png`; `_respirar_N` 32×40; `_caminar_N`, `_correr_N`, `_sprint_N` 48×40). `heroe_t1_e1.png` no se tocó.
- `assets.js`: `gaitFor(racha)` elige la marcha (0 → caminar, 1-2 → correr, 3+ → sprint), `runFrames` busca la marcha pedida y si falta usa la más cercana; `heroTag` muestra la respiración en la franja chica y Estadísticas.
- `app.js`: la escena pasa la marcha, usa 48 px de ancho y el ritmo de cada marcha (110/80/60 ms por cuadro); el festejo vuelve a 32 px.
- `style.css`: `.hero.wide` compensa el ancho extra para que el héroe no se corra. `sw.js`: caché `pd-v15`.
- `img/LEEME.md`: nombres y tamaños nuevos. Ojo: `_correr_N` ahora es 48×40 (antes 32×40).

## Tanda 1: héroe (gladiador)
Personaje base en PixelLab: `cd8e2f3f-2b58-4a10-9484-cf6d2c7e914e` (estado "Idle", 48×48, vista side). Es `heroe_t1_e1.png` (coincide pixel por pixel).
Las etapas se crean como estados (`create_character_state`) para conservar cara y proporciones.

| Etapa | Id PixelLab | Fecha | Estado |
|---|---|---|---|
| t1_e1 | `cd8e2f3f-2b58-4a10-9484-cf6d2c7e914e` | (previo) | Aprobada, ya en `public/img/` |
| t1_e2 | `12302bc1-5c3a-4bf0-bfbb-49e0c14a4b53` | 2026-10-31 | Aprobada. Falta copiar a `public/img/` |
| t1_e3 v3 | `48199f83-dd2f-4327-b9d2-025e352bcbf4` | 2026-10-31 | Descartada: piel todavía amarillenta y casco con cresta roja |
| t1_e3 v4b | `c7f65efd-43be-4bd7-be34-ae75a95d1247` | 2026-10-31 | **Elegida.** Desde t1_e2, casco de gladiador sin cresta, seed 42, piel como t1_e1. (v4a, v3 y la original las borró el usuario) |
| t1_e3 (original) | `4dbed9ba-c047-44b2-a9f8-d69733bdcc0e` | 2026-10-31 | Reemplazada por v3 (piel amarillenta). Sin animaciones; borrar cuando se apruebe v3 |

Estados viejos sin tocar: `6b98597b-…` y `8b0eb4ea-…` ("Gladiator, side view", anteriores a esta sesión).

### Animaciones (todas con pixminimax salvo donde se indica; las descartadas se borraron de PixelLab)
Respirar = vista frontal (south), solo para las vistas del personaje. Caminar/correr/sprint = east, para el mapa.

| Etapa | Respirar | Caminar | Correr | Sprint |
|---|---|---|---|---|
| t1_e1 | `f25240ba-…` (aprobada) | `1ee3e1fe-…` | `18966775-…` | `85396499-…` (aprobada) |
| t1_e2 | `d4dfe9e0-…` (aprobada) | `38b7eee7-…`, solo cuadros 8,1,2,3,4 (los 5-7 giraban el torso) | `8f0c2f86-…` (aprobada) | `b8a5f94d-…`, solo cuadros 2-6 |
| t1_e3 v4b | `1fe5b0c8-…` (respirar-a, mismo prompt que e1/e2) | `4db11fa2-…` (caminar-n2): pixminimax con inicio=fin en el cuadro 2 de correr-c, pasos con rodilla y pie levantados, 8 cuadros | `558b872f-…` (correr-c), 8 cuadros, molde de referencia | `f6365220-…` (sprint-7): movimiento de sprint-7 + atuendo de correr-c (`transfer_outfit` job `df400ac6-…`) + 1 cuadro intermedio entre 4 y 5 (pixminimax interpolando) − el cuadro 8 casi duplicado + cresta del casco borrada (`edit_image` job `865f712f-…`, cuadros realineados por código), 8 cuadros, guardado con `save_to_asset` |

Atuendo de t1_e3 en caminar/sprint corregido con `transfer_outfit` usando como referencia el perfil del sprite base editado (`edit_image` job `5c7ff193-…`): pteryges de cuero marrón, grebas doradas solo en la canilla, rodela chica redonda dorada. Los cuadros finales son imágenes de esos jobs (galería de PixelLab), no animaciones del personaje.

t1_e3: todo con pixminimax y los prompts de t1_e2 adaptados. Colores ajustados por código a la paleta exacta del sprite base v4b (26 colores): sin rojos ni amarillos. En correr el escudo asoma cuando el brazo libre va adelante (balanceo natural).

Cuadros recortados en el scratchpad de la sesión (`salida/heroe_t1_eE_<anim>_N.png`): respirar 32×40, el resto 48×40 (el sprint mide hasta 39 px de ancho).

Problemas conocidos:
- t1_e3 sprint: pixminimax gira el torso o tiñe el taparrabos de rojo; v3 pierde las grebas o amarillea la piel (4 intentos). Se usa la carrera acelerada.
- t1_e3 correr: en los cuadros 4-6 el escudo asoma un poco por delante.

Lecciones:
- Las plantillas (`walking-6-frames`, `running-6-frames`, `breathing-idle`) redibujan al personaje: pierden barba, manica y escudo.
- `skeleton-v3` sale casi estático a 48 px. `v3` deforma la cara en la respiración, pero sirve con casco.
- pixminimax con `custom_start_frame_url` (un cuadro ya en movimiento) y `keep_first_frame=false` evita los cuadros de arranque.

Nota: `tools/ajustar.py` alinea con el borde inferior del lienzo y corta filas de la cabeza. Recorté con ventana fija por animación, pies 2 px sobre el borde.

## Tanda 3: crías de Esfinge, Grifo, Fénix y Qilin (2026-11-01, pendiente de aprobación)
Postura del cachorro de Behemot (caminando, patas traseras un poco más cortas). El Fénix vuela; el Qilin camina.
Primero se probó `create_character_pro_flash` 32×32 (con el cachorro como `style_image`): la vista east salía sentada o enredada. Se rehízo con `edit_image` **sobre el cachorro de Behemot** (conserva la pose) usando como referencia de aspecto esa vista east.

| Archivo (n1 y n2 iguales, 32×32) | Origen | Notas |
|---|---|---|
| `mascota_esfinge_n1/n2.png` | `edit_image` modo referencia `30d32632-…`, seed 42 (ref: imagen del usuario, esfinge cría con nemes, cuernos dorados y alas) | Versión A, elegida por el usuario. Reemplaza a `44bce480-…`. Descartada la B (seed 7 `182aaff4-…`). Subido 1 px |
| `mascota_grifo_n1/n2.png` | `edit_image` modo referencia `f9a544dc-…` (ref: east de `b90ee60d-…`) | Cabeza de águila, garras amarillas. Bajado 1 px |
| `mascota_qilin_n1/n2.png` | `edit_image` modo referencia `ede64198-…`, seed 42 (ref: imagen del usuario, qilin verde oliva con astas y llamas doradas) | Versión A, elegida por el usuario. Reemplaza a `f4bc7f22-…` y `1d836a2f-…`. Descartada la B (seed 7 `e4cdb471-…`). Subido 2 px: las astas tocan el borde superior sin cortarse |
| `mascota_fenix_n1/n2.png` | `edit_image` modo texto `06a07571-…` sobre la east de `b97f7a64-…` | Volando, alas arriba. Sin bajar (flota) |

Caminatas (pixminimax, 8 cuadros, east/side, seed 42, igual que Behemot; pies ya a 2 px, sin retoques), guardadas como `mascota_<clave>_n1_correr_1..8` y `n2_correr_1..8`: esfinge `210cbdbf-04d2-4edc-b2fc-9a7c0e6dbe33`, grifo `705155f8-379b-41d8-9c04-b6123b7ad9a1`, qilin `95ef254c-7a87-488f-9991-10abceb5f86a`.
Fénix (vuelo, 8 cuadros porque pixminimax pide múltiplos de 4): A `9cefff6b-…` (alas poco visibles, se endereza) y B `20970bf2-6ade-4558-ba6d-c03d965a873b` seed 7 (aleteo amplio). **Elegida la B** por el usuario, guardada como `mascota_fenix_n1_correr_1..8` y `n2_correr_1..8` (vuela: sin alinear pies).

Personajes pro_flash de prueba (solo sirvieron de referencia): crías `c5d1ad4c-…`, `b90ee60d-…`, `b97f7a64-…`, `1dfbb912-…`; adultos 64×64 lanzados antes del cambio de pedido: `67b7da29-…` (esfinge), `7957481e-…` (grifo), `90c116a7-…` (fénix), `d5bbabe2-…` (qilin), sin usar.

## Tanda 2: mascotas — Behemot (2026-11-01, pendiente de aprobación)
Tamaños definidos por el usuario: n0 huevo 32×32 · n1-n2 chica 24×24 · n3-n4 intermedia 40×40 · n5 grande 64×64 (el `LEEME.md` y la app todavía usan 32×32 para todas).
Todas de perfil mirando a la derecha, en pose de caminar, pies a 2 px del borde inferior. Recorte con `tools/ajustar.py ... pies` y luego ajuste de altura por código.

| Archivo | Origen | Notas |
|---|---|---|
| `mascota_behemot_n5.png` (64×64) | `edit_image` job `70e4e879-…` sobre el adulto v1 (`de6cc3db-…`) | Más morado, patas delanteras más macizas, cola completa levantada, caminando. Por código: saturación del violeta ×0,5 y luz ×0,95 (había salido demasiado morado), corrido 2 px a la derecha (la cola tocaba el borde) y bajado 4 px |
| `mascota_behemot_n3.png`, `n4.png` (40×40, iguales) | `edit_image` job `f315c052-…` sobre el n5 centrado en un lienzo de 76×76 | Joven más tranquilo, mismo diseño. Toca los bordes laterales sin cortarse. Subido 1 px |
| `mascota_behemot_n1.png`, `n2.png` (32×32, iguales) | combinación por código: cuerpo de `c85e5ce3-7745-4144-86e8-362538276239` (create_character modo pro, perro, con la foto de un bully como concepto) + cabeza de `ef93fd2b-52f5-465f-9b10-caadd5012f6a` (pro_flash, plantilla dog) | Cachorro estilo bully, elegido por el usuario. Por código: contorno oscuro agregado a la cabeza, cola levantada dibujada (6 px) en lugar del muñón, pies a 2 px. Lienzo 32×32 (el contenido mide 30×28). Al ser una combinación no es un personaje de PixelLab: para animarlo hay que crear uno a partir de esta imagen |

Técnica que funcionó: `edit_image` respeta la composición de la entrada, así que para achicar se pone el adulto con aire alrededor en un lienzo grande y se pide la salida en el tamaño final. Pedirle "que entre en N píxeles" no funciona (llena el lienzo).
Descartados: v1 (adulto `de6cc3db-…`, joven `a0cbb195-…`, cachorro `19dbabf0-…`, reemplazados), pro_flash `8294e4c2-…` y `5bd1ab9b-…` (adulto), `443bfcb8-…`, `f2e476ad-…` (joven sin cuernos / hocico de caballo), `0d2b1846-…`, `caba191a-…` (cachorros de 26 px), ediciones `b6a74b46-…`, `d4760c23-…` (cortadas en los bordes), `3bdba873-…`, `301079c3-…`, `3ddd3f3a-…` (cachorros demasiado anchos).
| `mascota_behemot_n1_correr_1..8`, `n2_correr_1..8` (32×32, iguales) | `animate_image_pixminimax` job `90ef5fbe-b021-4c23-bdd8-e0cf103890f5` sobre `mascota_behemot_n1.png` (subido), east/side, seed 42 | Caminata A, elegida por el usuario. Sin retoques: pies ya a 2 px. Alternativa B descartada: `animate_image` `0d1cc7ee-…` (pasos cortos). La app hoy lee hasta 4 cuadros |

Pendiente: cuadros de caminar de n3-n5. Los personajes pro_flash admiten `walk-4/6/8-frames`; las versiones finales salieron de `edit_image` (son imágenes sueltas), así que para animarlas hay que crear el personaje a partir de cada imagen.
Saldo: 1573 → 1405 generaciones (168 en total; esta ronda 116). Cachorro: caminatas descartadas del v2a (8) + tres cachorros bully (22) → ~1373.
