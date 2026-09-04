/**
 * The "pega aquí tu evidencia" panel, plus the feedback line under it.
 *
 * Every screen that accepts a crop uses this one, so the child meets the same
 * box in the tutorial, in the drills and in all fifteen missions. Learning
 * where to paste should happen once.
 *
 * The paste listener lives on `document` (see `pasteListener.ts` for why), so
 * this component owns attaching and detaching it rather than leaving fifteen
 * screens to remember.
 */

import { listenForPastedImages, type PastedImage } from '../clipboard/pasteListener';
import { element, keyHint, showImageData } from './dom';

export type FeedbackTone = 'neutral' | 'success' | 'warning' | 'error';

export interface EvidenceBoxOptions {
  /** Spanish title over the box. */
  title?: string;
  /** Spanish line under the title. */
  hint?: string;
  /**
   * One tight row instead of a tall panel.
   *
   * The mission screen has to hold the picture and the paste target on screen
   * at once on a 1366x768 school laptop - snipping and pasting are two ends of
   * one gesture, and a scroll between them breaks it - so there the box gets
   * the small version.
   */
  compact?: boolean;
  onImage: (pasted: PastedImage) => void;
  /** Something was pasted, but it was not an image. */
  onNonImage?: () => void;
}

export interface EvidenceBox {
  root: HTMLElement;
  showPreview(pasted: PastedImage): void;
  say(message: string, tone?: FeedbackTone): void;
  /** Extra lines under the feedback, for the "what the reader saw" detail. */
  showFacts(entries: ReadonlyArray<[string, string]>): void;
  setEnabled(enabled: boolean): void;
  destroy(): void;
}

const TONE_CLASS: Record<FeedbackTone, string> = {
  neutral: '',
  success: 'is-success',
  warning: 'is-warning',
  error: 'is-error',
};

export function createEvidenceBox(options: EvidenceBoxOptions): EvidenceBox {
  const root = element('section', `evidence${options.compact ? ' evidence--compact' : ''}`);

  const header = element('div', 'evidence__header');
  header.appendChild(
    element('p', 'evidence__title', options.title ?? 'Pega aquí tu evidencia'),
  );
  header.appendChild(keyHint(['Ctrl', 'V']));
  root.appendChild(header);

  if (options.hint !== '') {
    root.appendChild(
      element(
        'p',
        'evidence__hint',
        options.hint ?? 'Recorta con Windows + Shift + S y luego pega aquí.',
      ),
    );
  }

  const preview = element('img', 'evidence__preview');
  preview.alt = 'Tu recorte';
  preview.hidden = true;
  root.appendChild(preview);

  const feedback = element('p', 'evidence__feedback', '');
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  root.appendChild(feedback);

  const facts = element('dl', 'evidence__facts');
  root.appendChild(facts);

  let enabled = true;

  const detach = listenForPastedImages({
    onImage(pasted) {
      if (!enabled) return;
      options.onImage(pasted);
    },
    onNonImage() {
      if (!enabled) return;
      if (options.onNonImage) {
        options.onNonImage();
        return;
      }
      api.say(
        'No encontré ninguna imagen en el portapapeles. Recorta la pantalla con ' +
          'Windows + Shift + S y vuelve a pegar aquí.',
        'warning',
      );
    },
    onError(error) {
      console.error('Paste failed', error);
      api.say('No pude leer tu recorte. Inténtalo otra vez, con calma.', 'error');
    },
  });

  const api: EvidenceBox = {
    root,
    showPreview(pasted) {
      showImageData(preview, pasted.image);
    },
    say(message, tone = 'neutral') {
      feedback.textContent = message;
      feedback.className = `evidence__feedback ${TONE_CLASS[tone]}`.trim();
    },
    showFacts(entries) {
      facts.textContent = '';
      for (const [label, value] of entries) {
        facts.appendChild(element('dt', 'evidence__label', label));
        facts.appendChild(element('dd', 'evidence__value', value));
      }
    },
    setEnabled(next) {
      enabled = next;
      root.classList.toggle('is-disabled', !next);
    },
    destroy() {
      detach();
    },
  };

  return api;
}
