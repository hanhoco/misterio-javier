import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createRandom } from '../src/poster/random';
import { MISSIONS } from '../src/game/missions';
import { PRECISION_TIERS } from '../src/game/scoring';
import {
  AMBIGUOUS_CHARACTERS,
  MAX_ENCODED_ATTEMPTS,
  MAX_NAME_LENGTH,
  RESULT_CODE_ALPHABET,
  RESULT_CODE_GROUP_SIZE,
  decodeResultCode,
  encodeResultCode,
  normalizeName,
  type MissionResult,
} from '../src/game/resultCode';

const NAMES = ['ANA', 'JAVIER', 'SOFIA', 'B', 'MARIAJOSE', 'Álvaro', 'juan pablo'];

function randomMissions(random: () => number, count: number): MissionResult[] {
  const missions: MissionResult[] = [];
  for (let i = 0; i < count; i += 1) {
    missions.push({
      found: random() < 0.7,
      attempts: Math.floor(random() * (MAX_ENCODED_ATTEMPTS + 1)),
      precision: PRECISION_TIERS[Math.floor(random() * PRECISION_TIERS.length)],
    });
  }
  return missions;
}

describe('result code alphabet', () => {
  test('contains no ambiguous characters', () => {
    for (const character of AMBIGUOUS_CHARACTERS) {
      assert.equal(
        RESULT_CODE_ALPHABET.includes(character),
        false,
        `alphabet must not contain "${character}"`,
      );
    }
  });

  test('is uppercase, alphanumeric and free of duplicates', () => {
    assert.match(RESULT_CODE_ALPHABET, /^[A-Z0-9]+$/);
    assert.equal(new Set(RESULT_CODE_ALPHABET).size, RESULT_CODE_ALPHABET.length);
    assert.equal(RESULT_CODE_ALPHABET, RESULT_CODE_ALPHABET.toUpperCase());
  });

  test('holds exactly the 31 unambiguous alphanumerics', () => {
    const expected = [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter(
      (character) => !AMBIGUOUS_CHARACTERS.includes(character),
    );
    assert.deepEqual([...RESULT_CODE_ALPHABET].sort(), expected.sort());
    assert.equal(RESULT_CODE_ALPHABET.length, 31);
  });
});

describe('result code shape', () => {
  test('is a name prefix followed by groups of four', () => {
    const code = encodeResultCode({ name: 'Ana', missions: randomMissions(createRandom(7), 18) });
    const groups = code.split('-');
    assert.equal(groups[0], 'ANA');
    assert.ok(groups.length > 1);
    for (const group of groups.slice(1)) {
      assert.equal(group.length, RESULT_CODE_GROUP_SIZE);
      for (const character of group) assert.ok(RESULT_CODE_ALPHABET.includes(character));
    }
  });

  test('normalises the name: accents folded, uppercase, letters only, truncated', () => {
    assert.equal(normalizeName('Álvaro'), 'ALVARO');
    assert.equal(normalizeName('juan pablo'), 'JUANPABL');
    assert.equal(normalizeName('  Ana-Sofía 3 '), 'ANASOFIA');
    assert.equal(normalizeName('123'), '');
    assert.ok(normalizeName('abcdefghijkl').length <= MAX_NAME_LENGTH);
  });

  test('falls back to a name when nothing usable was typed', () => {
    const code = encodeResultCode({ name: '123', missions: [] });
    const parsed = decodeResultCode(code);
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.match(parsed.value.name, /^[A-Z]+$/);
  });
});

describe('result code round trip', () => {
  test('round-trips every field over many random progress states', () => {
    const random = createRandom(20260904);
    for (let run = 0; run < 400; run += 1) {
      const name = NAMES[Math.floor(random() * NAMES.length)];
      const missions = randomMissions(random, MISSIONS.length);
      const parsed = decodeResultCode(encodeResultCode({ name, missions }));

      assert.equal(parsed.ok, true, `run ${run} failed to decode`);
      if (!parsed.ok) return;
      assert.equal(parsed.value.name, normalizeName(name));
      assert.deepEqual(parsed.value.missions, missions);
    }
  });

  test('round-trips every mission count from zero to the full catalogue', () => {
    const random = createRandom(11);
    for (let count = 0; count <= MISSIONS.length; count += 1) {
      const missions = randomMissions(random, count);
      const parsed = decodeResultCode(encodeResultCode({ name: 'ANA', missions }));
      assert.equal(parsed.ok, true, `count ${count} failed to decode`);
      if (parsed.ok) assert.deepEqual(parsed.value.missions, missions);
    }
  });

  test('round-trips the extremes of every field', () => {
    const missions: MissionResult[] = [
      { found: false, attempts: 0, precision: 'none' },
      { found: true, attempts: MAX_ENCODED_ATTEMPTS, precision: 'precise' },
      { found: true, attempts: 0, precision: 'wide' },
      { found: false, attempts: MAX_ENCODED_ATTEMPTS, precision: 'close' },
    ];
    const parsed = decodeResultCode(encodeResultCode({ name: 'ZZZZZZZZ', missions }));
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.deepEqual(parsed.value.missions, missions);
  });

  test('is tolerant of lowercase and stray spaces when read back', () => {
    const missions = randomMissions(createRandom(3), 18);
    const code = encodeResultCode({ name: 'Ana', missions });
    const parsed = decodeResultCode(`  ${code.toLowerCase()} `);
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.deepEqual(parsed.value.missions, missions);
  });
});

describe('result code corruption', () => {
  test('a single changed payload character is rejected', () => {
    const random = createRandom(4242);
    let checked = 0;

    for (let run = 0; run < 8; run += 1) {
      const missions = randomMissions(random, MISSIONS.length);
      const code = encodeResultCode({ name: 'ANA', missions });

      for (let position = 0; position < code.length; position += 1) {
        const original = code[position];
        if (!RESULT_CODE_ALPHABET.includes(original)) continue;
        // Only the payload here; the name is covered by its own test.
        if (position < code.indexOf('-')) continue;

        for (const replacement of ['3', 'K', 'Z', '9']) {
          if (replacement === original) continue;
          const corrupted =
            code.slice(0, position) + replacement + code.slice(position + 1);
          const parsed = decodeResultCode(corrupted);
          assert.equal(parsed.ok, false, `accepted a corrupted code: ${corrupted}`);
          checked += 1;
        }
      }
    }

    assert.ok(checked > 500, `expected a broad sweep, only checked ${checked}`);
  });

  test('a changed name is rejected, because the checksum covers it', () => {
    const missions = randomMissions(createRandom(9), MISSIONS.length);
    const code = encodeResultCode({ name: 'ANA', missions });
    const parsed = decodeResultCode(code.replace(/^ANA/, 'ANO'));
    assert.equal(parsed.ok, false);
  });

  test('a dropped character is rejected', () => {
    const missions = randomMissions(createRandom(10), MISSIONS.length);
    const code = encodeResultCode({ name: 'ANA', missions });
    const withoutLast = code.slice(0, -1);
    assert.equal(decodeResultCode(withoutLast).ok, false);
  });

  test('two swapped characters are rejected', () => {
    const missions = randomMissions(createRandom(12), MISSIONS.length);
    const code = encodeResultCode({ name: 'ANA', missions });
    const chars = [...code];
    const first = code.indexOf('-') + 1;
    // Find the first neighbouring pair that actually differs.
    for (let i = first; i < chars.length - 1; i += 1) {
      if (chars[i] === '-' || chars[i + 1] === '-') continue;
      if (chars[i] === chars[i + 1]) continue;
      const swapped = [...chars];
      swapped[i] = chars[i + 1];
      swapped[i + 1] = chars[i];
      assert.equal(decodeResultCode(swapped.join('')).ok, false);
      return;
    }
    assert.fail('no differing neighbouring pair to swap');
  });
});

describe('result code rejection messages', () => {
  test('names the problem in plain English for every malformed input', () => {
    const cases = ['', '   ', 'ANA', 'AN4-2222-2222', 'ANA-2O22-2222', 'ANA-2222'];
    for (const input of cases) {
      const parsed = decodeResultCode(input);
      assert.equal(parsed.ok, false, `expected "${input}" to be rejected`);
      if (!parsed.ok) {
        assert.ok(parsed.error.length > 0);
        assert.match(parsed.error, /code|name/i);
      }
    }
  });
});
