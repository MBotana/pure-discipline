# Imágenes generadas con PixelLab

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
