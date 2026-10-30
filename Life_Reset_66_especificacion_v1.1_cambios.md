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
