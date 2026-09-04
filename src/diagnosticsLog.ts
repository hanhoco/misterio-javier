/**
 * Everything the console needs to diagnose a failure from across a classroom.
 *
 * Reports from the room arrive as a photograph of a screen, and for a week the
 * answer to "why did that crop fail?" was a guess. Three of those guesses were
 * wrong and each one cost a lesson. The decoder always knew exactly where it
 * stopped; nothing was ever asked to say so out loud.
 *
 * So: every decode attempt prints one collapsed group with every number that
 * could matter, every uncaught error prints with the build stamp attached, and
 * the whole run is kept in `window.__javierLog` so a teacher can copy the lot
 * with one command instead of photographing the console.
 *
 * English, like all identifiers here. The console is read by an adult.
 */

import { BUILD_COMMIT, buildLabel } from './buildInfo';

/** One decode attempt, flattened into the numbers that explain it. */
export interface DecodeLogEntry {
  kind: 'decode';
  at: string;
  build: string;
  mission: string;
  target: string;
  expectedCode: number;
  crop: { width: number; height: number };
  zoom: { css: number; devicePixelRatio: number; effective: number };
  readable: boolean;
  reader: {
    saturatedPixels: number;
    classifiedPixels: number;
    blobs: number;
    undersizedBlobs: number;
    sealsFound: number;
    codesRead: number[];
    dotRadiusPx: number | null;
    armDistancePx: number | null;
    measuredScale: number | null;
  };
  result: string;
  verdict: string;
  success: boolean;
  areaRatio: number | null;
}

export interface ErrorLogEntry {
  kind: 'error';
  at: string;
  build: string;
  where: string;
  message: string;
  stack?: string;
}

export type LogEntry = DecodeLogEntry | ErrorLogEntry;

declare global {
  interface Window {
    /** Every decode attempt and error this session, oldest first. */
    __javierLog?: LogEntry[];
    /** Copies the whole log to the clipboard as JSON. */
    __javierCopyLog?: () => void;
  }
}

function store(entry: LogEntry): void {
  if (typeof window === 'undefined') return;
  window.__javierLog ??= [];
  window.__javierLog.push(entry);
}

const STYLE_OK = 'background:#1F7A4C;color:#fff;padding:1px 6px;border-radius:3px';
const STYLE_BAD = 'background:#B3402F;color:#fff;padding:1px 6px;border-radius:3px';
const STYLE_ERR = 'background:#7A1F1F;color:#fff;padding:1px 6px;border-radius:3px';

/**
 * The one line that explains the failure, in words rather than fields.
 *
 * Ordered by where the pipeline died, earliest stage first, so the first line
 * that matches is the real cause and not a downstream symptom.
 */
export function explainDecode(entry: DecodeLogEntry): string {
  const r = entry.reader;
  if (!entry.readable) return 'the poster was too zoomed out for any crop to be readable';
  if (r.saturatedPixels === 0) return 'no seal ink in the crop at all - the seal was not inside it';
  if (r.classifiedPixels === 0) {
    return (
      `${r.saturatedPixels} bright pixels but none in a reserved hue - the colours ` +
      'arrived shifted (monitor colour profile, or the crop caught something else bright)'
    );
  }
  if (r.blobs === 0) {
    return `${r.classifiedPixels} seal-coloured pixels but no usable dots - too small or misshapen`;
  }
  if (r.sealsFound === 0) return `${r.blobs} dots found but none formed a cross`;
  if (!entry.success) return `read code ${r.codesRead.join(', ')}, needed ${entry.expectedCode}`;
  return 'read the expected code';
}

/** Log one decode attempt, successful or not. */
export function logDecode(entry: Omit<DecodeLogEntry, 'kind' | 'at' | 'build'>): void {
  const full: DecodeLogEntry = {
    kind: 'decode',
    at: new Date().toISOString(),
    build: BUILD_COMMIT,
    ...entry,
  };
  store(full);

  const label = full.success ? 'FOUND' : 'MISSED';
  const style = full.success ? STYLE_OK : STYLE_BAD;
  console.groupCollapsed(
    `%c${label}%c ${full.target} - ${explainDecode(full)}`,
    style,
    'color:inherit',
  );
  console.log('build      ', buildLabel());
  console.log('mission    ', full.mission, '- target', full.target, '- expects code', full.expectedCode);
  console.log('crop       ', `${full.crop.width} x ${full.crop.height} px`);
  console.log(
    'zoom       ',
    `css ${full.zoom.css.toFixed(3)}x`,
    `- dpr ${full.zoom.devicePixelRatio}`,
    `- effective ${full.zoom.effective.toFixed(3)}x`,
    full.readable ? '(readable)' : '(BELOW the readable floor)',
  );
  console.log('reader     ', full.reader);
  console.log('result     ', full.result, '- verdict', full.verdict);
  if (full.areaRatio !== null) console.log('crop size  ', `${full.areaRatio.toFixed(1)}x the object`);
  console.groupEnd();
}

/** Log anything that went wrong that is not a decode. */
export function logError(where: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  store({ kind: 'error', at: new Date().toISOString(), build: BUILD_COMMIT, where, message, stack });
  console.log(`%cERROR%c ${where}: ${message}`, STYLE_ERR, 'color:inherit');
  if (stack) console.log(stack);
}

/**
 * Catch what never reaches a try/catch: uncaught exceptions and rejected
 * promises. Without this a crash inside a listener leaves a dead screen and an
 * empty console, which is exactly the report that is impossible to act on.
 */
export function installGlobalErrorLogging(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    const where = event.filename
      ? `${event.filename}:${event.lineno}:${event.colno}`
      : 'uncaught error';
    logError(where, event.error ?? event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    logError('unhandled promise rejection', event.reason);
  });

  window.__javierCopyLog = () => {
    const text = JSON.stringify(window.__javierLog ?? [], null, 2);
    navigator.clipboard?.writeText(text).then(
      () => console.log('Log copied. Paste it wherever you are reporting from.'),
      () => console.log(text),
    );
  };

  console.log(
    'Diagnostics on. Every crop is logged here. Type __javierCopyLog() to copy the whole run.',
  );
}
