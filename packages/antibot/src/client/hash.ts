// FNV-1a 32-bit. Cheap, non-cryptographic; we only need stable fingerprints.
export function fnv1a(input: string | Uint8Array): string {
  let hash = 0x811c9dc5 >>> 0;
  if (typeof input === 'string') {
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
  } else {
    for (let i = 0; i < input.length; i++) {
      hash ^= input[i]!;
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

export function safeNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
