/**
 * The one question "is an adult debugging this?" is answered from.
 *
 * `?dev=1` rather than the dev build, because the two questions are different:
 * "am I running Vite" is not "should a nine year old see this", and the
 * authoring and diagnostic surfaces are genuinely useful against a production
 * build too - which is where the classroom reports come from.
 */

export function isDevToolsRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('dev');
  } catch {
    // A window without a parseable location is not a reason to fail a screen.
    return false;
  }
}
