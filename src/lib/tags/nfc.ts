"use client";

import { parseTagCode, tagUrl } from "@/lib/tags/code";

// Web NFC, wrapped so the rest of the app never touches the raw API.
//
// The constraints that shape everything here: NDEFReader is Chrome-on-Android
// only, needs HTTPS, a user gesture, and a foreground tab. Everything else falls
// back to the printed QR — which is why the tag's payload is a plain URL and not
// a private record format. iOS opens that URL in Safari with no NFC API at all,
// so /t/<code> has to work as a cold, unauthenticated entry point.

// Minimal typings: Web NFC isn't in lib.dom yet.
type NDEFRecordLike = {
  recordType: string;
  mediaType?: string;
  encoding?: string;
  lang?: string;
  data?: DataView;
};
type NDEFMessageLike = { records: NDEFRecordLike[] };
type NDEFReadingEventLike = { serialNumber?: string; message: NDEFMessageLike };

type NDEFReaderLike = {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(
    message: { records: { recordType: string; data: string }[] },
    options?: { signal?: AbortSignal; overwrite?: boolean },
  ): Promise<void>;
  makeReadOnly(options?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((event: NDEFReadingEventLike) => void) | null;
  onreadingerror: ((event: Event) => void) | null;
};

type NDEFReaderCtor = new () => NDEFReaderLike;

function readerCtor(): NDEFReaderCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { NDEFReader?: NDEFReaderCtor }).NDEFReader;
  return ctor ?? null;
}

// The single branch the whole platform story hangs off: NFC path, or QR path.
export function isNfcSupported(): boolean {
  return readerCtor() !== null;
}

export type ScannedTag = {
  // The code, when the tag carried one of ours. Null for a blank or foreign tag
  // — which is not an error: a blank tag is exactly what field-encode wants.
  code: string | null;
  // The chip's factory UID, when the reader exposes it. A tamper check only,
  // never a lookup key: UID cloning is trivial.
  chipUid: string | null;
  // Raw payload, kept so an unknown tag can be reported honestly.
  raw: string | null;
};

function decodeRecords(message: NDEFMessageLike): string | null {
  for (const record of message.records) {
    if (!record.data) continue;
    try {
      if (record.recordType === "url" || record.recordType === "absolute-url") {
        return new TextDecoder().decode(record.data);
      }
      if (record.recordType === "text") {
        return new TextDecoder(record.encoding || "utf-8").decode(record.data);
      }
    } catch {
      // A record we can't decode is not a reason to drop the whole read.
    }
  }
  return null;
}

export type ScanSession = {
  stop: () => void;
};

// Keep one scan session open for a whole walk: one permission prompt, then
// scan-walk-scan. Re-arming per tube would put a prompt between the crew and
// every single tree.
export async function startScanning(handlers: {
  onTag: (tag: ScannedTag) => void;
  onError?: (message: string) => void;
}): Promise<ScanSession> {
  const Ctor = readerCtor();
  if (!Ctor) throw new Error("This device or browser can't read NFC tags.");

  const reader = new Ctor();
  const controller = new AbortController();

  reader.onreading = (event) => {
    const raw = decodeRecords(event.message);
    handlers.onTag({
      code: raw ? parseTagCode(raw) : null,
      chipUid: event.serialNumber ?? null,
      raw,
    });
  };
  reader.onreadingerror = () => {
    handlers.onError?.("That tag couldn't be read — try holding the phone steadier.");
  };

  await reader.scan({ signal: controller.signal });
  return { stop: () => controller.abort() };
}

// Write the tag's one NDEF record, then lock it.
//
// makeReadOnly() CANNOT BE UNDONE. It runs only after the caller has committed
// the record the code points at, and never in bulk — a locked chip with no row
// behind it is scrap.
export async function writeTag(
  code: string,
  origin: string,
  options: { lock?: boolean } = {},
): Promise<void> {
  const Ctor = readerCtor();
  if (!Ctor) throw new Error("This device or browser can't write NFC tags.");

  const reader = new Ctor();
  await reader.write({
    records: [{ recordType: "url", data: tagUrl(code, origin) }],
  });

  if (options.lock !== false) {
    await reader.makeReadOnly();
  }
}

// The reader gives no proximity feedback of its own. A short buzz is what tells
// a gloved hand, holding a phone against a tube it cannot see, that the tag took.
export function buzz(pattern: number | number[] = 40): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Vibration is a courtesy; never let it break a write.
    }
  }
}
