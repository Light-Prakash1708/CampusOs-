/**
 * MALWARE SCANNING — adapter interface.
 *
 *   MALWARE_SCANNER=none       no scanning; files are recorded NOT_SCANNED
 *                              (never CLEAN — we do not claim what we did not check)
 *   MALWARE_SCANNER=signature  built-in basic checks: the EICAR test signature
 *                              and executable headers (PE/ELF/Mach-O) hidden
 *                              behind a document extension. This is NOT an
 *                              antivirus engine.
 *
 * A production deployment handling untrusted uploads should add a ClamAV (clamd
 * INSTREAM) or cloud-scanner adapter implementing `MalwareScanner`.
 */
export interface ScanResult {
  status: 'CLEAN' | 'INFECTED' | 'NOT_SCANNED';
  engine: string;
  detail?: string;
}

export interface MalwareScanner {
  readonly name: string;
  scan(bytes: Uint8Array): Promise<ScanResult>;
}

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export const noScanner: MalwareScanner = {
  name: 'none',
  async scan() {
    return { status: 'NOT_SCANNED', engine: 'none' };
  },
};

export const signatureScanner: MalwareScanner = {
  name: 'signature',
  async scan(bytes) {
    const head = Buffer.from(bytes.subarray(0, 4));
    if (head.subarray(0, 2).toString('latin1') === 'MZ') return { status: 'INFECTED', engine: 'signature', detail: 'Windows executable' };
    if (head.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return { status: 'INFECTED', engine: 'signature', detail: 'ELF executable' };
    const magic = head.readUInt32BE(0);
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(magic)) {
      return { status: 'INFECTED', engine: 'signature', detail: 'Mach-O executable' };
    }
    if (Buffer.from(bytes).includes(EICAR)) return { status: 'INFECTED', engine: 'signature', detail: 'EICAR test signature' };
    return { status: 'CLEAN', engine: 'signature' };
  },
};

export function getScanner(): MalwareScanner {
  return process.env.MALWARE_SCANNER === 'signature' ? signatureScanner : noScanner;
}
