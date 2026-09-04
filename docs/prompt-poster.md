# Prompt de dirección de arte — póster de búsqueda visual

> Este archivo contiene **únicamente dirección de arte**. No pide coordenadas,
> ni cuadrículas, ni JSON. Un modelo de imagen no puede producir esa información:
> genera píxeles y no sabe dónde quedó nada. Las coordenadas salen del marcado
> manual (`docs/pipeline-poster.md`), y la validación del recorte sale del sello,
> nunca de la posición.

Reemplazá `[TEMA]` / `[THEME]` y `[LISTA]` / `[LIST]` antes de usarlo.

**Usá la versión en inglés.** Los modelos de imagen están entrenados casi
enteramente con descripciones en inglés y siguen las instrucciones bastante
mejor en ese idioma. La versión en español está abajo por si la necesitás.

---

## Prompt (inglés — recomendado)

```
Role: you are a children's editorial illustrator. Your only job is the image.

FORMAT AND RESOLUTION (non-negotiable)
- Landscape, 3:2 or 4:3.
- Maximum possible resolution. 4000 px minimum on the long side.
- If you must choose, favour resolution over amount of detail.

NO TEXT, NO FRAME (critical)
- No title, no header, no legend, no target list, no side panel, no border,
  no frame.
- No readable text anywhere in the illustration. Signs and banners inside the
  scene show symbols or shapes only, never words.

SUBJECT
[THEME]

AUDIENCE
Children aged 7 to 9.

VIEW AND COMPOSITION
- Elevated three-quarter view, as if looking down from a second floor. The
  ground unfolds toward the back.
- Divide the scene into five or six zones with different activities, separated
  naturally by paths, fences, water or planting. Each zone has its own activity
  and its own group of characters.
- Fill nearly the whole surface. No large empty areas, no simple patches.
- Spread the visual load evenly edge to edge. Do not cluster everything at the
  centre.
- Foreground, middle ground and background, with characters at different sizes
  for depth.
- Vary the directions: not everyone facing the same way.
- Some elements partly hidden behind others.

FINDABLE OBJECTS
Place 12 isolated, clearly recognisable everyday objects across the scene.
- Each object must be shown COMPLETE, never cropped or half-covered.
- Each object must be LARGE: at least 1/25 of the image height. Nothing tiny.
- One per zone where possible, well separated, never overlapping each other.
- Resting or held naturally, integrated into the scene.
- Unambiguous when looked at closely, but camouflaged within the bustle.

Object list: [LIST]

CAMOUFLAGE
Hide them through natural composition: crowds, overlap, similar colours,
characters in similar clothing, furniture, planting, groups of people.
NEVER use arrows, circles, halos, glows, outlines, artificial contrast, special
lighting or text pointing at them. The object must look like part of the scene.

DECOYS
For each findable object, add three or four elements that could confuse at first
glance: the same object in another colour, a similar object in the right colour,
a partly covered version. There must be exactly ONE correct answer, but finding
it should cost effort.

SMALL STORIES
Scatter independent comic situations across the scene: someone chasing a
balloon, an animal stealing food, someone carrying far too much, two characters
arguing, a vendor asleep, someone photographing something absurd. Every zone
should tell something.

STYLE
Clean bright children's vector illustration. Thin uniform black outline on
everything. Flat vivid colours with soft shading. Characters small but perfectly
legible, with clear silhouettes. Modern search-and-find picture book look.
Favour every character and object being readable on its own over piling on
quantity. Density must never destroy legibility.

COLOUR CONSTRAINT
Avoid highly saturated or fluorescent magenta, cyan, lime green and orange. If
you need those colours, use them muted. The rest of the palette: free and lively.

ORIGINALITY
Do not reproduce characters, costumes, compositions or distinctive traits from
any existing work. Everything original.

ADDITIONAL DELIVERABLE
Alongside the image, return a numbered list of the 12 findable objects you
actually placed, each with a plain-words description of where it ended up
("top left, on the roof of the fruit stall"). No numeric coordinates.
```

---

## Prompt (español)

```
Rol: sos un ilustrador editorial infantil. Tu único trabajo es la imagen.

FORMATO Y RESOLUCIÓN (no negociable)
- Apaisado, 3:2 o 4:3.
- Máxima resolución posible. Mínimo 4000 px en el lado largo.
- Si tenés que elegir, priorizá resolución por encima de cantidad de detalle.

SIN TEXTO NI MARCO (crítico)
- Sin título, sin encabezado, sin leyenda, sin lista de objetivos, sin panel
  lateral, sin borde, sin marco.
- Sin ningún texto legible en la ilustración. Los carteles y letreros dentro de
  la escena muestran solo símbolos o formas, nunca palabras.

TEMA
[TEMA]

PÚBLICO
Niños de 7 a 9 años.

VISTA Y COMPOSICIÓN
- Vista en tres cuartos desde una posición elevada, como si miraras desde un
  segundo piso. El terreno se despliega hacia el fondo.
- Dividí la escena en cinco o seis zonas con actividades distintas, separadas de
  forma natural por caminos, cercas, agua o vegetación. Cada zona tiene su
  propia actividad y su propio grupo de personajes.
- Llená prácticamente toda la superficie. Sin grandes vacíos ni zonas simples.
- Distribuí la carga visual de manera uniforme de borde a borde. No concentres
  todo en el centro.
- Primer plano, plano medio y fondo, con personajes de distintos tamaños para
  dar profundidad.
- Variá las direcciones: que no miren todos hacia el mismo lado.
- Algunos elementos parcialmente ocultos detrás de otros.

OBJETOS BUSCABLES
Distribuí por la escena 12 objetos cotidianos, aislados y claramente
reconocibles.
- Cada objeto debe verse COMPLETO, nunca recortado ni tapado a medias.
- Cada objeto debe ser GRANDE: como mínimo 1/25 del alto de la imagen.
  Nada diminuto.
- Uno por zona cuando se pueda, bien separados, nunca solapados entre sí.
- Apoyados o sostenidos de forma natural, integrados en la escena.
- Identificables sin ambigüedad cuando se los mira de cerca, pero camuflados
  dentro del movimiento.

Lista de objetos: [LISTA]

CAMUFLAJE
Escondelos por composición natural: multitudes, superposición, colores
parecidos, personajes con ropa similar, mobiliario, vegetación, grupos de gente.
NUNCA uses flechas, círculos, halos, brillos, resplandores, bordes, contraste
artificial, iluminación especial ni texto que los señale. El objeto tiene que
parecer parte de la escena.

FALSOS POSITIVOS
Por cada objeto buscable, agregá tres o cuatro elementos que puedan confundir a
primera vista: el mismo objeto en otro color, un objeto parecido en el color
correcto, una versión parcialmente tapada. Debe existir UNA sola respuesta
correcta, pero encontrarla tiene que costar.

MICROHISTORIAS
Repartí por toda la escena pequeñas situaciones independientes y cómicas:
alguien persiguiendo un globo, un animal robando comida, alguien cargando algo
demasiado grande, dos personajes discutiendo, un vendedor dormido, alguien
fotografiando algo absurdo. Cada zona tiene que contar algo.

ESTILO
Ilustración vectorial infantil, limpia y luminosa. Contorno negro fino y
uniforme en todo. Colores planos y vivos con sombreado suave. Personajes
pequeños pero perfectamente legibles, con siluetas claras. Estética de libro
ilustrado de búsqueda visual moderno.
Priorizá que cada personaje y objeto se entienda por sí solo por encima de
acumular cantidad. La densidad nunca debe destruir la legibilidad.

RESTRICCIÓN DE COLOR
Evitá el magenta, el cian, el verde lima y el naranja en versiones muy saturadas
o fluorescentes. Si necesitás esos colores, usalos apagados. El resto de la
paleta, libre y viva.

ORIGINALIDAD
No reproduzcas personajes, vestuario, composiciones ni rasgos distintivos de
ninguna obra existente. Todo original.

ENTREGA ADICIONAL
Además de la imagen, devolvé una lista numerada de los 12 objetos buscables que
efectivamente colocaste, con una descripción en palabras de dónde quedó cada uno
("arriba a la izquierda, sobre el techo del puesto de frutas"). No des
coordenadas numéricas.
```

---

## Qué cambió al ver la imagen de referencia

La referencia del parque ("FIND THE MISSING PARKTICIPANTS") ajustó tres cosas:

1. **El panel lateral con la lista tiene que desaparecer.** Va horneado en la
   imagen, y eso rompe la progresión del juego: la app muestra las misiones de a
   una. Además el texto sale mal escrito — "carries carries a sketchpad",
   "wearing by the main picnic tree". Por eso el prompt ahora prohíbe todo texto
   de forma explícita.

2. **El formato apaisado está bien.** Yo había recomendado vertical; la
   referencia me corrigió. Lo que fuerza el zoom no es la proporción sino que la
   resolución del póster supere ampliamente a la de la pantalla. Con 4000 px de
   lado largo sobre un monitor de 1920, apaisado obliga a hacer zoom igual.

3. **La densidad de la referencia es mejor que la de un Wally.** El caos máximo
   pelea contra el sistema de sellos: si no hay aire alrededor del objeto, el
   sello queda ilegible. Zonas separadas por caminos, agua y cercas es
   exactamente la estructura correcta.

Lo que la referencia hace mal y el prompt ahora corrige: los objetivos son
diminutos (el silbato, el aro, la ardilla). A esa escala no entra un sello de
48 px encima.

---

## Niveles de dificultad

La dificultad **no** se controla con la cantidad de objetivos. Se controla con
densidad, camuflaje y falsos positivos. Doce objetivos alcanzan en los tres
niveles.

| Nivel | Multitud | Objetos | Falsos positivos |
|---|---|---|---|
| 1 — Fácil | Moderada, con aire entre grupos | Grandes, a la vista | 1 por objeto |
| 2 — Medio | Densa, poco fondo visible | Integrados en grupos | 3 por objeto |
| 3 — Difícil | Máxima, sin fondo visible | Camuflados por color con el entorno | 5 por objeto, más zonas repetidas |

---

## Por qué 12 objetivos y no 40

1. **Cada objetivo se marca a mano.** Cuarenta cajas son entre diez y quince
   minutos de marcado por póster. Doce son tres.
2. **Cada objetivo lleva un sello encima.** El sello mide 48 px nativos. En una
   panorámica de 2048 px con cuarenta objetivos, cada objeto queda en 50–100 px
   y el sello no entra.
3. **Los modelos de imagen degradan.** Pasadas las 80–100 figuras pequeñas las
   caras salen deformes. Pedir cuarenta objetivos legibles empuja al modelo
   justo hacia donde falla.

---

## Restricciones que no se negocian

| Restricción | Valor | Por qué |
|---|---|---|
| Lado largo mínimo | 4000 px | El sello se lee hasta 0.45× del nativo; con imagen chica el zoom lo destruye |
| Tamaño de objetivo | ≥ 1/25 del alto | Tiene que caber un sello de 48 px encima sin taparlo |
| Tonos reservados | magenta, cian, lima, naranja saturados | Son propiedad exclusiva del decodificador |
| Texto en la imagen | ninguno | La app maneja las misiones; el texto generado sale mal escrito |
| Formato | apaisado 3:2 o 4:3 | Confirmado por la referencia; el zoom lo fuerza la resolución, no la proporción |
