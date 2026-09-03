import { customAlphabet } from "nanoid";

// The identifier written to a tag and printed beside it. One code serves three
// readers — the NFC URL, the printed QR, and a human typing it off the label
// when the radio fails — so the alphabet drops the characters people confuse on
// a weathered tag: 0/O, 1/I/l. Uppercase only, because that is what someone
// squinting at a zip-tied disc will type.
const TAG_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const TAG_CODE_LENGTH = 8;

const generate = customAlphabet(TAG_CODE_ALPHABET, TAG_CODE_LENGTH);

// Codes mint on the device, not the server, so writing a tag never waits on a
// round trip. 32^8 ≈ 1.1e12 keeps collisions negligible at farm scale, and the
// unique index on tags.tag_code is the backstop if one ever happens.
export function generateTagCode(): string {
  return generate();
}

export function isValidTagCode(code: string): boolean {
  if (code.length !== TAG_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!TAG_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

// Tolerate how the code actually arrives: lowercase from a keyboard, spaced or
// hyphenated off a label, and the characters the alphabet deliberately excludes
// typed anyway because that is what the reader saw.
export function normalizeTagCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    // Now fold the ambiguous pair back onto the characters the alphabet uses.
    .replace(/0/g, "O")
    .replace(/1/g, "I");
}

// The URL written to the tag as its single NDEF record. It resolves in any
// phone's browser with no app installed, which is what makes the iOS path work
// at all: iOS opens the URL in Safari without ever handing us an NFC API.
export function tagUrl(code: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/t/${code}`;
}

// Pull a code back out of whatever a reader hands us: the full URL from an NDEF
// record or a QR scan, or a bare code someone typed. Returns null when the text
// isn't one of ours.
export function parseTagCode(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const fromUrl = /\/t\/([^/?#\s]+)/.exec(raw);
  const candidate = fromUrl ? fromUrl[1] : raw;

  const upper = candidate.trim().toUpperCase().replace(/[\s-]/g, "");
  if (isValidTagCode(upper)) return upper;

  // Second pass for a hand-typed code that used the excluded lookalikes.
  const folded = normalizeTagCode(candidate);
  return isValidTagCode(folded) ? folded : null;
}
