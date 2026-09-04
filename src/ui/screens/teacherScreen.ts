/**
 * Stage 11: the teacher panel, reached at `#/profesor`.
 *
 * A separate screen with its own route, not a mode of the game: a child who
 * wanders in should find something that obviously is not theirs, and a teacher
 * with the class projected should never have a mission on screen.
 *
 * It reads result codes and nothing else. No screenshots are asked for, shown
 * or accepted here - the codes are the whole channel, which is what lets the
 * whole thing work with no backend and no images of a child's screen leaving
 * their machine.
 *
 * An unreadable line is reported by number and left in place rather than
 * silently skipped: a teacher who pastes twenty codes and gets nineteen rows
 * needs to know which one to retype.
 */

import { MISSIONS, MISSION_REWARDS, STORY_MISSIONS } from '../../game/missions';
import { decodeResultCode, type MissionResult } from '../../game/resultCode';
import {
  PRECISION_TIER_LABELS,
  maxTotalScore,
  scoreMission,
  type MissionRewards,
} from '../../game/scoring';
import { button, element } from '../dom';
import type { Screen } from './context';

const MAX_SCORE = maxTotalScore(MISSION_REWARDS);

interface Badge {
  label: string;
  className: string;
}

/** Bands chosen to describe effort, not to rank children against each other. */
function badgeFor(percent: number): Badge {
  if (percent >= 90) return { label: '🏆 Expert detective', className: 'is-gold' };
  if (percent >= 70) return { label: '🥇 Detective', className: 'is-silver' };
  if (percent >= 40) return { label: '🔍 Apprentice', className: 'is-bronze' };
  return { label: '🌱 On the way', className: 'is-start' };
}

interface Row {
  name: string;
  percent: number;
  storyFound: number;
  score: number;
  attempts: number;
  badge: Badge;
  trouble: string[];
}

/**
 * Turns one decoded code into a table row.
 *
 * The code carries the missions positionally, so a code from an older or newer
 * catalogue is read against whatever overlaps and the rest is treated as not
 * attempted - which is the honest reading, and better than refusing the whole
 * line over a mission that no longer exists.
 */
function toRow(name: string, missions: readonly MissionResult[]): Row {
  const completed = missions.filter((mission) => mission.found).length;
  const percent = MISSIONS.length === 0 ? 0 : Math.round((completed / MISSIONS.length) * 100);

  let score = 0;
  let attempts = 0;
  let storyFound = 0;
  const trouble: string[] = [];

  MISSIONS.forEach((mission, index) => {
    const result = missions[index];
    if (!result) return;
    attempts += result.attempts;

    const rewards: MissionRewards = mission.rewards;
    score += scoreMission(rewards, {
      found: result.found,
      attempts: result.attempts,
      precision: result.precision,
    });

    if (mission.kind !== 'story') return;
    if (result.found) storyFound += 1;
    if (!result.found || result.attempts >= 3) {
      const detail = result.found
        ? `${result.attempts} tries, ${PRECISION_TIER_LABELS[result.precision]}`
        : 'not found';
      trouble.push(`${mission.objective.replace(/^Find /, '')} (${detail})`);
    }
  });

  return { name, percent, storyFound, score, attempts, badge: badgeFor(percent), trouble };
}

export interface TeacherScreenOptions {
  onBack: () => void;
}

export function createTeacherScreen(options: TeacherScreenOptions): Screen {
  const root = element('section', 'screen screen--teacher');

  const header = element('div', 'screen__header');
  const heading = element('div', 'screen__heading');
  heading.appendChild(element('h1', 'screen__title', 'Teacher panel'));
  heading.appendChild(
    element(
      'p',
      'screen__subtitle',
      'Paste one result code per line here. Everything is processed on this ' +
        'computer: nothing is sent to the internet.',
    ),
  );
  header.appendChild(heading);

  const back = button('Back to the game', 'button button--ghost');
  back.addEventListener('click', options.onBack);
  header.appendChild(back);
  root.appendChild(header);

  const input = element('textarea', 'teacher__input');
  input.rows = 8;
  input.spellcheck = false;
  input.placeholder = 'ANA-5F3K-92Q1-…\nJAVIER-7MTP-3XQ2-…';
  input.setAttribute('aria-label', 'Result codes, one per line');
  root.appendChild(input);

  const actions = element('div', 'teacher__actions');
  const read = button('Read the codes', 'button button--primary');
  const clearButton = button('Clear', 'button button--ghost');
  actions.append(read, clearButton);
  root.appendChild(actions);

  const errors = element('div', 'teacher__errors');
  root.appendChild(errors);

  const output = element('div', 'teacher__output');
  root.appendChild(output);

  const summary = element('p', 'teacher__summary', '');
  root.appendChild(summary);

  function renderTable(rows: readonly Row[]): void {
    output.textContent = '';
    if (rows.length === 0) return;

    const table = element('table', 'results');
    const head = element('thead');
    const headRow = element('tr');
    for (const label of [
      'Student',
      'Progress',
      'Missions',
      'Score',
      'Result',
      'Tries',
      'Where they struggled',
    ]) {
      headRow.appendChild(element('th', undefined, label));
    }
    head.appendChild(headRow);
    table.appendChild(head);

    const bodyNode = element('tbody');
    for (const row of rows) {
      const tr = element('tr');
      tr.appendChild(element('td', 'results__name', row.name));

      const progressCell = element('td');
      const bar = element('div', 'results__bar');
      const fill = element('div', 'results__bar-fill');
      fill.style.width = `${row.percent}%`;
      bar.appendChild(fill);
      progressCell.append(bar, element('span', 'results__percent', `${row.percent}%`));
      tr.appendChild(progressCell);

      tr.appendChild(
        element('td', undefined, `${row.storyFound}/${STORY_MISSIONS.length}`),
      );
      tr.appendChild(element('td', undefined, `${row.score} / ${MAX_SCORE}`));

      const badgeCell = element('td');
      badgeCell.appendChild(element('span', `badge ${row.badge.className}`, row.badge.label));
      tr.appendChild(badgeCell);

      tr.appendChild(element('td', undefined, String(row.attempts)));
      tr.appendChild(
        element(
          'td',
          'results__trouble',
          row.trouble.length === 0 ? 'No trouble' : row.trouble.join(' · '),
        ),
      );

      bodyNode.appendChild(tr);
    }
    table.appendChild(bodyNode);
    output.appendChild(table);
  }

  function run(): void {
    errors.textContent = '';
    summary.textContent = '';

    const lines = input.value
      .split('\n')
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter((entry) => entry.line.length > 0);

    if (lines.length === 0) {
      renderTable([]);
      errors.appendChild(
        element('p', 'teacher__error', 'Paste at least one code so it can be read.'),
      );
      return;
    }

    const rows: Row[] = [];
    let rejected = 0;

    for (const entry of lines) {
      const parsed = decodeResultCode(entry.line);
      if (!parsed.ok) {
        rejected += 1;
        errors.appendChild(
          element(
            'p',
            'teacher__error',
            `Line ${entry.number} ("${entry.line}"): ${parsed.error}`,
          ),
        );
        continue;
      }
      rows.push(toRow(parsed.value.name, parsed.value.missions));
    }

    renderTable(rows);
    summary.textContent =
      `${rows.length} code${rows.length === 1 ? '' : 's'} read` +
      (rejected === 0 ? '.' : `, ${rejected} with problems.`);
  }

  read.addEventListener('click', run);
  clearButton.addEventListener('click', () => {
    input.value = '';
    errors.textContent = '';
    summary.textContent = '';
    renderTable([]);
    input.focus();
  });

  return {
    root,
    destroy() {
      /* Nothing global was attached. */
    },
  };
}
