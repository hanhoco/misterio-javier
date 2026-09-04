/**
 * The result code: how a finished run travels from the child's screen to the
 * teacher's, with no backend, no network and no account.
 *
 * Shape: `ANA-5F3K-92Q1-...` - an uppercase name prefix, then the payload in
 * dash separated groups of four.
 *
 * On the alphabet. The brief asks for base32 with no ambiguous characters, and
 * those two things cannot both be true: striking `0`, `O`, `1`, `I` and `L` out
 * of the 36 alphanumerics leaves exactly 31 symbols, one short of the 32 a
 * five-bits-per-character encoding needs. Rather than smuggle a confusable
 * character back in, the payload is a base-31 big-integer encoding over those
 * 31 symbols. Everything the brief actually wanted survives: uppercase,
 * transcribable, grouped in fours, and impossible to misread a `0` for an `O`.
 * It costs about 2% more characters than base32 would.
 *
 * The payload carries, per mission, whether it was found, how many attempts it
 * took and how tight the crop was, plus a CRC-32 over the name and the whole
 * body. A single mistyped character changes the integer, which changes the
 * bytes, which fails the checksum - so a bad code is rejected out loud instead
 * of quietly decoding into somebody else's results.
 *
 * Pure and DOM free.
 */

import { PRECISION_TIERS, type PrecisionTier } from './scoring';

/** The 31 unambiguous alphanumerics, in digit order. */
export const RESULT_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Characters deliberately kept out, because they are read as one another. */
export const AMBIGUOUS_CHARACTERS = '01IOL';

/** How many payload characters go in a dash separated group. */
export const RESULT_CODE_GROUP_SIZE = 4;

/** Bumped when the payload layout changes. Old codes are then rejected. */
export const RESULT_CODE_VERSION = 1;

/** Longest name prefix. Long enough for the names in a class list. */
export const MAX_NAME_LENGTH = 8;

/** Attempts are stored in four bits, so this is both the cap and the ceiling. */
export const MAX_ENCODED_ATTEMPTS = 15;

/** Bits spent per mission: 1 found + 2 precision + 4 attempts. */
const BITS_PER_MISSION = 7;

/** Shown instead of a name when nothing usable was typed. */
const FALLBACK_NAME = 'DETECTIV';

const ALPHABET_BASE = BigInt(RESULT_CODE_ALPHABET.length);

export interface MissionResult {
  found: boolean;
  attempts: number;
  precision: PrecisionTier;
}

export interface ResultCodeData {
  /** Already normalised or not; `encodeResultCode` normalises either way. */
  name: string;
  missions: readonly MissionResult[];
}

export type ResultCodeParse =
  | { ok: true; value: ResultCodeData }
  /** `error` is shown to the teacher verbatim. */
  | { ok: false; error: string };

/* -------------------------------------------------------------------------- */
/* Name                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Strips accents, uppercases, drops everything that is not A-Z and truncates.
 *
 * Accent stripping is what keeps "Sofía" and "Sofia" producing the same prefix,
 * which matters because the teacher types the code back in by hand.
 */
export function normalizeName(raw: string): string {
  const folded = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return folded.slice(0, MAX_NAME_LENGTH);
}

/* -------------------------------------------------------------------------- */
/* Bit packing                                                                */
/* -------------------------------------------------------------------------- */

function packMissions(missions: readonly MissionResult[]): Uint8Array {
  const bytes = new Uint8Array(Math.ceil((missions.length * BITS_PER_MISSION) / 8));
  let bit = 0;

  const writeBits = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i -= 1) {
      if ((value >> i) & 1) bytes[bit >> 3] |= 0x80 >> (bit & 7);
      bit += 1;
    }
  };

  for (const mission of missions) {
    const tierIndex = Math.max(0, PRECISION_TIERS.indexOf(mission.precision));
    const attempts = Math.max(0, Math.min(MAX_ENCODED_ATTEMPTS, Math.trunc(mission.attempts)));
    writeBits(mission.found ? 1 : 0, 1);
    writeBits(tierIndex, 2);
    writeBits(attempts, 4);
  }

  return bytes;
}

function unpackMissions(bytes: Uint8Array, count: number): MissionResult[] {
  const missions: MissionResult[] = [];
  let bit = 0;

  const readBits = (width: number): number => {
    let value = 0;
    for (let i = 0; i < width; i += 1) {
      const isSet = (bytes[bit >> 3] >> (7 - (bit & 7))) & 1;
      value = (value << 1) | isSet;
      bit += 1;
    }
    return value;
  };

  for (let i = 0; i < count; i += 1) {
    const found = readBits(1) === 1;
    const tierIndex = readBits(2);
    const attempts = readBits(4);
    missions.push({ found, attempts, precision: PRECISION_TIERS[tierIndex] });
  }

  return missions;
}

/* -------------------------------------------------------------------------- */
/* Checksum                                                                    */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

/** Standard CRC-32. Thirty-two bits, so an accidental pass is a 1-in-4-billion. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function nameBytes(name: string): Uint8Array {
  const out = new Uint8Array(name.length);
  for (let i = 0; i < name.length; i += 1) out[i] = name.charCodeAt(i) & 0xff;
  return out;
}

/* -------------------------------------------------------------------------- */
/* Base 31                                                                     */
/* -------------------------------------------------------------------------- */

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function bigIntToBytes(value: bigint): Uint8Array {
  const out: number[] = [];
  let remaining = value;
  while (remaining > 0n) {
    out.unshift(Number(remaining & 0xffn));
    remaining >>= 8n;
  }
  return Uint8Array.from(out);
}

function toBase31(value: bigint): string {
  if (value === 0n) return RESULT_CODE_ALPHABET[0];
  let remaining = value;
  let out = '';
  while (remaining > 0n) {
    out = RESULT_CODE_ALPHABET[Number(remaining % ALPHABET_BASE)] + out;
    remaining /= ALPHABET_BASE;
  }
  return out;
}

function fromBase31(text: string): bigint | null {
  let value = 0n;
  for (const character of text) {
    const digit = RESULT_CODE_ALPHABET.indexOf(character);
    if (digit === -1) return null;
    value = value * ALPHABET_BASE + BigInt(digit);
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* Encode                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Builds the code a child reads out to their teacher.
 *
 * Byte layout, before the base conversion:
 *   [0]        0x01 sentinel, so the integer can never start with a zero byte
 *   [1]        format version
 *   [2]        mission count
 *   [3..]      the packed missions
 *   [last 4]   CRC-32 over name + version + count + packed missions
 */
export function encodeResultCode(data: ResultCodeData): string {
  const name = normalizeName(data.name) || FALLBACK_NAME;
  const packed = packMissions(data.missions);
  const header = Uint8Array.from([RESULT_CODE_VERSION, data.missions.length & 0xff]);
  const checksum = crc32(concatBytes(nameBytes(name), header, packed));
  const checksumBytes = Uint8Array.from([
    (checksum >>> 24) & 0xff,
    (checksum >>> 16) & 0xff,
    (checksum >>> 8) & 0xff,
    checksum & 0xff,
  ]);

  const body = concatBytes(Uint8Array.from([0x01]), header, packed, checksumBytes);

  // Leading zero digits do not change a base-31 value, so padding to a whole
  // number of groups is free and keeps every group exactly four characters.
  let payload = toBase31(bytesToBigInt(body));
  const remainder = payload.length % RESULT_CODE_GROUP_SIZE;
  if (remainder !== 0) {
    payload = RESULT_CODE_ALPHABET[0].repeat(RESULT_CODE_GROUP_SIZE - remainder) + payload;
  }

  const groups: string[] = [];
  for (let i = 0; i < payload.length; i += RESULT_CODE_GROUP_SIZE) {
    groups.push(payload.slice(i, i + RESULT_CODE_GROUP_SIZE));
  }

  return [name, ...groups].join('-');
}

/* -------------------------------------------------------------------------- */
/* Decode                                                                     */
/* -------------------------------------------------------------------------- */

function fail(error: string): ResultCodeParse {
  return { ok: false, error };
}

/** Reads a code back. Every failure path returns a plain explanation. */
export function decodeResultCode(code: string): ResultCodeParse {
  const cleaned = code.trim().toUpperCase().replace(/\s+/g, '');
  if (cleaned.length === 0) return fail('The code is empty.');

  const groups = cleaned.split('-').filter((group) => group.length > 0);
  if (groups.length < 2) {
    return fail('The code must have a name and then groups separated by dashes.');
  }

  const [name, ...payloadGroups] = groups;
  if (!/^[A-Z]{1,8}$/.test(name)) {
    return fail(`The name "${name}" can only have letters (${MAX_NAME_LENGTH} at most).`);
  }

  const payload = payloadGroups.join('');
  const stray = [...payload].find((character) => !RESULT_CODE_ALPHABET.includes(character));
  if (stray !== undefined) {
    return fail(`The code has a character the game does not use: "${stray}".`);
  }

  const value = fromBase31(payload);
  if (value === null) return fail('The code has invalid characters.');

  const body = bigIntToBytes(value);
  // Sentinel + version + count + at least one checksum-sized tail.
  if (body.length < 7 || body[0] !== 0x01) {
    return fail('The code is incomplete or damaged.');
  }

  const version = body[1];
  if (version !== RESULT_CODE_VERSION) {
    return fail(`The code is from another version of the game (version ${version}).`);
  }

  const count = body[2];
  const packedLength = Math.ceil((count * BITS_PER_MISSION) / 8);
  if (body.length !== 3 + packedLength + 4) {
    return fail('The code is incomplete or damaged.');
  }

  const packed = body.slice(3, 3 + packedLength);
  const expected =
    (body[3 + packedLength] << 24) |
    (body[4 + packedLength] << 16) |
    (body[5 + packedLength] << 8) |
    body[6 + packedLength];

  const header = Uint8Array.from([version, count]);
  const actual = crc32(concatBytes(nameBytes(name), header, packed));
  if (actual !== (expected >>> 0)) {
    return fail('The code failed its check. See if it was copied correctly.');
  }

  return { ok: true, value: { name, missions: unpackMissions(packed, count) } };
}
