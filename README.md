# Detective Lab — walking skeleton

A single-screen skeleton that proves one risky mechanism end to end:

> a poster carries hidden colour seals → the child zooms in → `Win + Shift + S`
> → `Ctrl + V` → the app decodes the seal out of the pasted screenshot → verdict.

There are no missions, no scoring, no teacher panel and no puzzle here. Those
are only worth building once the mechanism above is known to work on a real
school machine.

## Running it

```bash
npm install
npm run dev      # http://localhost:5300
npm run build    # type-check + production bundle
npm test         # decoder round-trip suite (tsc + node --test, no test framework)
```

Node 22 / npm 11.

## Language convention

Code — identifiers, file names, types, comments — is English. Every string a
child reads is Spanish, neutral register, no regional slang. The two never mix.

## How the seal encoding works

A seal is five dots arranged in a plus:

```
        up
 left  centre  right
       down
```

At poster-native scale:

| Property                     | Value  |
| ---------------------------- | ------ |
| Arm distance from the centre | 15 px  |
| Dot core radius              | 7 px   |
| White ring width             | 2 px   |
| Total footprint              | 48 px  |

Each dot takes one of four reserved colours, which are the digits of a base-4
number. The centre is the most significant digit, then up, right, down, left:

```
code = centre * 256 + up * 64 + right * 16 + down * 4 + left
```

That is 4^5 = 1024 distinct codes. The eight poster objects use eight of them.

| Index | Colour  | Hex       | Hue  |
| ----- | ------- | --------- | ---- |
| 0     | magenta | `#FF00E5` | 306° |
| 1     | cyan    | `#00E5FF` | 186° |
| 2     | lime    | `#7CFF00` | 91°  |
| 3     | orange  | `#FF7A00` | 29°  |

### The white ring is not decoration

Every dot is drawn inside a 2 px white ring. It does two jobs:

1. It keeps scene colours from bleeding into the pure colour core when the
   screenshot is scaled (the OS snipping tool, the browser canvas and any
   display scaling all resample with bilinear-style interpolation).
2. It puts a *desaturated moat* between neighbouring dots. At the nominal
   geometry two adjacent cores are only 1 px apart, so without the ring two
   same-coloured neighbours would merge into a single blob and the code would
   be unreadable. Because the decoder rejects anything below 0.55 saturation,
   the blended ring pixels are dropped and the two cores stay separate.

Do not remove it, and do not paint the ring per dot interleaved with the cores —
paint all five rings first, then all five cores.

### The reserved-palette constraint

The four hues above are the decoder's only signal, so **the illustration must
never use them anywhere else**. This is enforced by construction in
`src/poster/sceneColor.ts`, which every scene colour in the poster — facade,
crowd, objects, smoke — goes through:

- `sceneColor()` throws if the hue falls within ±15° of a reserved hue (the same
  window the decoder accepts);
- it caps illustration saturation at 0.50 in HSL;
- and then caps it again at 0.45 in **HSV**, which is the space the decoder
  actually measures. The second cap is not redundant: `hsl(h, 50%, 50%)` has an
  HSV saturation of 0.67, well above the decoder's 0.55 floor.

The HSV cap is what survives antialiasing. Every rendered pixel is a convex
combination of the colours drawn into it, and by the mediant inequality the HSV
saturation of a blend never exceeds the highest saturation of its ingredients.
Cap every ingredient below 0.55 and no blended edge pixel — however antialiased,
however rescaled — can ever be classified as a seal dot.

Two tests hold the line. `test/posterRenderer.test.ts` renders against a stub
canvas, so a reserved hue throws. `test/poster.test.ts` rasterises the real
poster in software and scans all 3.84M pixels, asserting that no pixel outside a
seal footprint is saturated enough for the decoder to classify at all.

### Seals are everywhere, on purpose

All eight objects carry a seal, and so do 52 randomly chosen crowd figures
(`DECOY_SEAL_COUNT` in `posterData.ts`). If only the targets were marked,
children would learn to hunt for coloured dots instead of looking for the object
they were asked to find, and the pedagogy would collapse. Decoy codes are drawn
from the same 1024-code space but are guaranteed distinct from all eight target
codes.

Two placement rules keep the decoys honest:

- no decoy within `DECOY_EXCLUSION_RADIUS` (240 px) of a target centre, so a
  tight crop around a target reads cleanly;
- no two seals within `MIN_SEAL_SEPARATION` (70 px), so the decoder can never
  mistake one seal's dot for another seal's arm.

## How the decoder works

`src/validation/sealDecoder.ts` is pure TypeScript with no dependencies and no
DOM access, which is why it can be unit tested in plain Node.

1. Box-downscale the pasted image if its longest side exceeds 1600 px.
2. Convert every pixel to HSV; keep pixels with saturation > 0.55, value > 0.45
   and a hue within ±15° of one of the four reserved hues; tag the colour index.
3. Connected-component labelling (8-connectivity) per colour index. Each
   component gives a centroid, an area and a radius of `sqrt(area / π)`.
4. Reject blobs with radius < 2 px, or a bounding box that is not square-ish and
   well filled (a disc fills about π/4 of its box).
5. Try every blob as a seal centre and look for arms between 1.2× and 3.5× the
   centre's radius away — the seal's own arm-to-radius ratio of 15/7 ≈ 2.14 sits
   inside that window. A seal needs exactly four arms, equidistant within ±25%
   and 90° apart within ±25°.
6. Order the arms by angle, starting at the one nearest "up" and going clockwise.
7. Read the base-4 code.
8. Derive the capture scale: `scale = measuredArmDistance / 15`. Measurements are
   converted back out of any step-1 downscale first, so `scale` is always in
   pasted-image pixels.
9. If the measured core radius is below 3 px, return `too-small` instead of a
   code — the colours cannot be trusted at that size.

The result is a discriminated union: `decoded`, `no-seal`, `too-small`, or
`ambiguous` (more than one seal in the crop). Because decoy seals make
multi-seal crops the *ordinary* case, `ambiguous` carries per-seal measurements
(`seals: SealMeasurement[]`) alongside `codes`, so the caller can grade the seal
it was actually looking for.

### Known defect: the 0/360 arm-sort wrap

`findSeals` sorts the four arms by raw angle ascending and then requires the
first of them to be the "up" arm. Sub-pixel centroid drift from *any* resampling
of the screenshot puts that arm at ~359.7° roughly half the time, so it sorts
last, `neighbours[0]` becomes the "right" arm at ~90°, and a perfectly readable
seal is thrown away.

Measured over the real poster, seed 20260903, tight crops, 31 scales from 0.50×
to 2.00× in 0.05 steps: **189 of 248 decodes succeed (76%); only 12 of the 31
scales are clean.** At every failure all five dots are found, equidistant and 90°
apart — the geometry is fine, only the sort order is wrong.

It fails safe (false negative, never a false positive), and fixing it means
changing the decoder's detection logic. It is pinned as a `todo` test in
`test/poster.test.ts` rather than hidden.

### Measured behaviour

Round-tripping a synthesised, antialiased, resampled seal:

| Capture scale | Measured core radius | Result      |
| ------------- | -------------------- | ----------- |
| 0.25×         | —                    | `too-small` |
| 0.40×         | —                    | `too-small` |
| 0.50×         | 3.42 px              | decoded     |
| 1.00×         | 7.05 px              | decoded     |
| 2.00×         | 14.00 px             | decoded     |
| 3.00×         | 21.02 px             | decoded     |

The practical floor is around 0.45× poster-native. In normal use the child is
zoomed *in*, so the capture scale is above 1×.

## Verdict

`src/validation/verdict.ts` turns the decode result into a message:

```
capturedWidth = cropWidth  / scale
capturedHeight = cropHeight / scale
areaRatio = (capturedWidth * capturedHeight) / (target.width * target.height)
```

| Condition                     | Verdict        |
| ----------------------------- | -------------- |
| `areaRatio <= 4`              | `PRECISE`      |
| `areaRatio <= 25`             | `LOOSE`        |
| `areaRatio > 25`              | `TOO_WIDE`     |
| code belongs to another object| `WRONG_OBJECT` |
| several seals, one of them the target's | graded as above, using **that** seal's scale |
| several seals, none the target's | `AMBIGUOUS` |
| `no-seal`                     | `NO_SEAL`      |
| `too-small`                   | `TOO_SMALL`    |

Finding the target among a handful of decoys still counts as finding it — that
is the whole point of stamping decoys in the first place.

## Clipboard

The `paste` listener is bound to `document`, not to the drop-zone element:
after the Windows snipping overlay closes, focus returns to the window rather
than to any particular element, so an element-scoped handler never fires.

`navigator.clipboard.read()` is deliberately not used — it needs a permission
prompt and is unreliable on managed machines. The `paste` event's
`clipboardData.items` needs neither.

## Zoom

The viewer implements its own canvas zoom and pan (wheel, drag, and large `+` /
`−` buttons). Browser `Ctrl +` zoom is not used: the verdict maths needs a scale
the app controls and can read back.

## Seal reference sheet

"Ver hoja de sellos" renders all eight seals large with their codes and object
names. Screenshot a card from it and paste it back to exercise the decoder
without hunting through the poster.

## Layout

```
src/
  poster/posterData.ts        object catalogue (data; owns the layout)
  poster/posterRenderer.ts    draws the poster and stamps the seals
  poster/seal.ts              seal geometry + palette (shared source of truth)
  viewer/posterViewer.ts      zoom/pan canvas viewer
  clipboard/pasteListener.ts  paste event capture
  validation/sealDecoder.ts   decodes a seal from a pasted screenshot
  validation/verdict.ts       decode result -> verdict
  ui/app.ts                   wiring + DOM
  main.ts
```

## Still to validate

- [ ] **Test on a real Windows school machine.** Everything above is verified on
      synthetic pixels and on developer hardware. The open questions are
      Windows display scaling (125% / 150%) altering the effective capture
      scale, the exact bitmap format `Win + Shift + S` puts on the clipboard,
      whether the school browser build fires `paste` with `clipboardData.items`
      populated, and whether the thresholds in `sealDecoder.ts` survive that
      pipeline. Use the dev debug panel to read back the raw `DecodeResult`.
- [ ] Confirm children can find and frame an object without adult help.
- [ ] Check the seals stay visually unobtrusive at classroom projector sizes.
