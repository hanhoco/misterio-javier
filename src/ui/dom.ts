/**
 * The three or four DOM chores every screen repeats.
 *
 * Kept here rather than in each screen so that a change to how, say, a key hint
 * looks is one edit and not seven.
 */

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(label: string, className = 'button'): HTMLButtonElement {
  const node = element('button', className, label);
  node.type = 'button';
  return node;
}

export function clear(node: HTMLElement): void {
  node.textContent = '';
}

/**
 * A row of key caps, e.g. Ctrl + V.
 *
 * Every shortcut the game asks for gets one of these next to the instruction.
 * A seven year old has usually never been told where `Ctrl` is, and a sentence
 * that only names the key assumes they already know.
 */
export function keyHint(keys: readonly string[]): HTMLElement {
  const row = element('span', 'keys');
  row.setAttribute('aria-label', `Keys: ${keys.join(' plus ')}`);
  keys.forEach((key, index) => {
    if (index > 0) row.appendChild(element('span', 'keys__plus', '+'));
    row.appendChild(element('kbd', 'keys__cap', key));
  });
  return row;
}

/** A labelled text field, big enough for small fingers. */
export function textField(
  labelText: string,
  options: { placeholder?: string; maxLength?: number; value?: string } = {},
): { field: HTMLLabelElement; input: HTMLInputElement } {
  const field = element('label', 'field');
  field.appendChild(element('span', 'field__label', labelText));
  const input = element('input', 'field__input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.maxLength) input.maxLength = options.maxLength;
  if (options.value) input.value = options.value;
  field.appendChild(input);
  return { field, input };
}

/** Draws an `ImageData` into an `<img>` as a data URL. */
export function showImageData(preview: HTMLImageElement, image: ImageData): void {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(image, 0, 0);
  preview.src = canvas.toDataURL('image/png');
  preview.hidden = false;
}
