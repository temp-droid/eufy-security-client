import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from "crypto";

// Extracted from Eufy Security APK — IotSdkManager / MegaAppDomain (not account-specific)
export const PRESET_KEYS = {
  MEGA_PR: "2500a7d5617812f9d52515b2c8f20a3d",
  SECURITY_PR: "118c12c81e211149304bd70a0c071d01",
} as const;

export interface EcdhKeyExchangeResult {
  signingKey: string;
  xKeyIdent: string;
}

export function aesEncryptCBC(keyHex: string, plaintext: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString("base64");
}

export function aesDecryptCBC(keyHex: string, ciphertextBase64: string): string {
  const data = Buffer.from(ciphertextBase64, "base64");
  const iv = data.subarray(0, 16);
  const ciphertext = data.subarray(16);
  const decipher = createDecipheriv("aes-128-cbc", Buffer.from(keyHex, "hex"), iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export class V3CryptoHeaders {
  constructor(
    private signingKey: string,
    private xKeyIdent: string
  ) {}

  buildHeaders(body?: string): {
    headers: Record<string, string>;
    encryptedBody?: string;
  } {
    const ts = Math.floor(Date.now() / 1000).toString();
    const once = randomUUID().replace(/-/g, "");

    let encryptedBody: string | undefined;
    if (body) {
      encryptedBody = this.encryptBody(body);
    }

    const signature = this.generateSignature(ts, once, encryptedBody);

    return {
      headers: {
        "X-Request-Ts": ts,
        "X-Request-Once": once,
        "X-Key-Ident": this.xKeyIdent,
        "X-Signature": signature,
        "X-Encryption-Info": "algo_ecdh",
        "X-Replay-Info": "replay",
      },
      encryptedBody,
    };
  }

  generateSignature(ts: string, once: string, body?: string): string {
    const message = body ? `${ts}+${once}+${body}` : `${ts}+${once}`;
    return createHmac("sha256", this.signingKey).update(message, "utf8").digest("hex");
  }

  encryptBody(body: string): string {
    const key = Buffer.from(this.signingKey.substring(0, 32), "hex").subarray(0, 16);
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-128-cbc", key, iv);
    const encrypted = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
    return Buffer.concat([iv, encrypted]).toString("base64");
  }

  decryptBody(encryptedBody: string): string {
    const key = Buffer.from(this.signingKey.substring(0, 32), "hex").subarray(0, 16);
    const data = Buffer.from(encryptedBody, "base64");
    const iv = data.subarray(0, 16);
    const ciphertext = data.subarray(16);
    const decipher = createDecipheriv("aes-128-cbc", key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}
