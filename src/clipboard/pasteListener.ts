/**
 * Clipboard capture for the Win+Shift+S -> Ctrl+V flow.
 *
 * Two hard constraints, both learned the hard way:
 *   1. The listener must sit on `document`. After the Windows snipping overlay
 *      closes, focus returns to the window, not to any particular element, so a
 *      handler bound to a drop zone `div` would never fire.
 *   2. We never call `navigator.clipboard.read()`. It needs a permission
 *      prompt, is blocked on many managed school machines, and fails silently.
 *      The `paste` event's `clipboardData` needs neither.
 *
 * There is a third path, added for the copy drill. When a child selects an
 * `<img>` on the page and presses Ctrl+C, Chrome does not put a file on the
 * clipboard: it puts an HTML fragment whose `src` is the image. So after the
 * file lookup fails we look for exactly that, and only when the `src` is a
 * `data:` URL - a page-relative or remote `src` would mean fetching something,
 * and a canvas drawn from a remote image is tainted and unreadable anyway.
 */

export interface PastedImage {
  image: ImageData;
  width: number;
  height: number;
}

export interface PasteHandlers {
  /** Called with the decoded pixels of the pasted screenshot. */
  onImage: (pasted: PastedImage) => void;
  /** Called when the clipboard held something that was not an image. */
  onNonImage: () => void;
  /** Called when the image could not be read at all. */
  onError: (error: unknown) => void;
}

function findImageFile(clipboardData: DataTransfer | null): File | null {
  if (!clipboardData) return null;
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/**
 * The `src` of the first `<img>` in a pasted HTML fragment, when it is inline
 * image data. Returns null for anything else.
 */
function findInlineImageSource(clipboardData: DataTransfer | null): string | null {
  if (!clipboardData) return null;
  let html = '';
  try {
    html = clipboardData.getData('text/html');
  } catch {
    return null;
  }
  if (!html) return null;

  const match = /<img\b[^>]*\bsrc\s*=\s*(["'])(data:image\/[^"']+)\1/i.exec(html);
  return match ? match[2] : null;
}

async function blobToImageData(source: Blob): Promise<PastedImage> {
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.drawImage(bitmap, 0, 0);
    return {
      image: ctx.getImageData(0, 0, bitmap.width, bitmap.height),
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}

/** Fetching a `data:` URL is a synchronous decode, not a network request. */
async function inlineSourceToImageData(source: string): Promise<PastedImage> {
  const response = await fetch(source);
  return blobToImageData(await response.blob());
}

/** Starts listening. Returns a function that detaches the listener. */
export function listenForPastedImages(handlers: PasteHandlers): () => void {
  const onPaste = (event: ClipboardEvent) => {
    const file = findImageFile(event.clipboardData);
    if (file) {
      event.preventDefault();
      blobToImageData(file).then(handlers.onImage).catch(handlers.onError);
      return;
    }

    const inline = findInlineImageSource(event.clipboardData);
    if (inline) {
      event.preventDefault();
      inlineSourceToImageData(inline).then(handlers.onImage).catch(handlers.onError);
      return;
    }

    handlers.onNonImage();
  };

  document.addEventListener('paste', onPaste);
  return () => document.removeEventListener('paste', onPaste);
}
