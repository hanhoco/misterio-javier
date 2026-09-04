# De ilustración a póster jugable

Cómo una imagen cualquiera se convierte en un póster que el juego puede validar.

```
ilustracion.png              ← generada por un modelo de imagen, encargada o comprada
      │
      ▼
[1] sanitizador de paleta    ← automático, una vez
      │                         corre todo píxel de tono reservado y alta
      │                         saturación al tono seguro más cercano
      ▼
poster-limpio.png
      │
      ▼
[2] marcado de objetos       ← manual, una vez, ~3 min para 12 objetos
      │                         arrastrás cajas sobre la imagen y las nombrás
      ▼
posterData.json              ← { id, name, x, y, width, height, sealCode }
      │
      ▼
[3] estampador de sellos     ← automático
      │                         estampa el sello de cada objeto encima del objeto,
      │                         más 40-60 sellos señuelo sobre el fondo
      ▼
poster-final.png             ← esto es lo que carga el juego
```

## De dónde salen realmente las coordenadas

Solo hay dos fuentes posibles, y ninguna es un modelo de imagen:

- **Generador procedural** — el código sabe dónde dibujó cada cosa, así que la
  metadata sale gratis y exacta.
- **Marcado humano** — alguien arrastra cajas sobre una imagen ya hecha.

Un modelo de imagen genera píxeles y no tiene registro de dónde quedó nada. Si
le pedís un JSON con `bounding_box`, te lo va a entregar inventado.

## Por qué la validación no puede ser por posición

Cuando el estudiante presiona `Ctrl + V`, a la aplicación le llega **un PNG
suelto**. Píxeles y nada más. No trae metadata de origen, y no existe API de
portapapeles que la provea.

Validar por posición exigiría que el recorte lo hiciera la propia aplicación con
una selección sobre el canvas — y ahí se pierde `Win + Shift + S`, que es la
habilidad que el ejercicio existe para enseñar.

El sello resuelve exactamente eso: viaja **dentro de los píxeles**. Es la única
vía para obtener identidad y escala a partir de un pantallazo desnudo.

## El intercambio es gratis

El juego lee los pósters desde datos. Pasar del póster procedural a uno
ilustrado no toca una línea del código del juego: solo cambia el `posterData` y
el PNG.
