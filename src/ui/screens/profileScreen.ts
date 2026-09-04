/**
 * The opening screen: a first name and a class code, and nothing else.
 *
 * No surnames, no email, no birthday, no avatar picker. The pair is used as the
 * `localStorage` key and the name is the only thing that ever leaves the
 * machine, inside the result code the child reads to their teacher. Anything
 * more would be personal data this game has no business holding.
 */

import { STORY_INTRO } from '../../game/missions';
import { loadLastProfile } from '../../game/progressStore';
import { button, element, textField } from '../dom';
import type { Screen } from './context';

export interface ProfileScreenOptions {
  onStart: (identity: { name: string; classCode: string }) => void;
  onTeacher: () => void;
}

export function createProfileScreen(options: ProfileScreenOptions): Screen {
  const remembered = loadLastProfile();

  const root = element('section', 'screen screen--profile');

  const hero = element('div', 'hero');
  hero.appendChild(element('h1', 'hero__title', '🔎 THE MYSTERY OF JAVIER'));
  hero.appendChild(element('p', 'hero__story', STORY_INTRO));
  root.appendChild(hero);

  const card = element('div', 'card');
  card.appendChild(element('h2', 'card__title', 'Who is investigating today?'));

  const name = textField('Your name', {
    placeholder: 'Ana',
    maxLength: 20,
    value: remembered?.name ?? '',
  });
  const classCode = textField('Class code', {
    placeholder: '3B',
    maxLength: 10,
    value: remembered?.classCode ?? '',
  });
  card.append(name.field, classCode.field);

  const notice = element('p', 'card__notice', '');
  notice.hidden = true;
  card.appendChild(notice);

  const start = button('Start the mission!', 'button button--primary button--big');
  card.appendChild(start);

  card.appendChild(
    element(
      'p',
      'card__hint',
      'If you played before, type the same name and the same code to carry on where you were.',
    ),
  );
  root.appendChild(card);

  const footer = element('div', 'screen__footer');
  const teacher = button('I am a teacher', 'button button--ghost');
  teacher.addEventListener('click', options.onTeacher);
  footer.appendChild(teacher);
  root.appendChild(footer);

  function fail(message: string, field: HTMLInputElement): void {
    notice.textContent = message;
    notice.hidden = false;
    field.focus();
  }

  function submit(): void {
    const typedName = name.input.value.trim();
    const typedCode = classCode.input.value.trim();

    if (typedName.length === 0) {
      fail('Type your name to start.', name.input);
      return;
    }
    if (!/\p{L}/u.test(typedName)) {
      fail('Your name needs at least one letter.', name.input);
      return;
    }
    if (typedCode.length === 0) {
      fail('Type the code your teacher gave you.', classCode.input);
      return;
    }

    notice.hidden = true;
    options.onStart({ name: typedName, classCode: typedCode });
  }

  start.addEventListener('click', submit);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') submit();
  };
  name.input.addEventListener('keydown', onKeyDown);
  classCode.input.addEventListener('keydown', onKeyDown);

  window.setTimeout(() => name.input.focus(), 0);

  return {
    root,
    destroy() {
      /* Nothing global was attached. */
    },
  };
}
