import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  KEY_DERIVATION_INFO,
  KEY_DERIVATION_SALT,
  KEY_DERIVATION_LENGTH_BYTES,
  IV_LENGTH_BYTES,
} from "@open-vault/constants";

// Derive a master key from the SSH private key by signing a fixed message
export async function deriveMasterKey(privateKeyPath?: string): Promise<CryptoKey> {
  const keyPath = privateKeyPath ?? join(homedir(), ".ssh", "id_ed25519");
  if (!existsSync(keyPath)) {
    throw new Error(`SSH private key not found at ${keyPath}. Run 'ov auth init' first.`);
  }

  // Sign the fixed derivation message using ssh-keygen
  const message = KEY_DERIVATION_SALT;
  const tmpMsgFile = `/tmp/ov-msg-${Date.now()}`;
  const tmpSigFile = `/tmp/ov-sig-${Date.now()}`;

  try {
    require("fs").writeFileSync(tmpMsgFile, message, "utf-8");
    execSync(`ssh-keygen -Y sign -f "${keyPath}" -n "open-vault" "${tmpMsgFile}" 2>/dev/null`);
    const sigData = readFileSync(`${tmpMsgFile}.sig`);
    require("fs").unlinkSync(tmpMsgFile);
    require("fs").unlinkSync(`${tmpMsgFile}.sig`);

    // HKDF-SHA256: derive key from signature
    const rawKey = await crypto.subtle.importKey("raw", sigData, "HKDF", false, ["deriveKey"]);
    const enc = new TextEncoder();

    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: enc.encode(KEY_DERIVATION_INFO),
        info: enc.encode("master-key"),
      },
      rawKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  } catch (e) {
    try { require("fs").unlinkSync(tmpMsgFile); } catch {}
    try { require("fs").unlinkSync(`${tmpMsgFile}.sig`); } catch {}
    throw new Error(`Key derivation failed: ${e}`);
  }
}

export async function encryptValue(masterKey: CryptoKey, plaintext: string): Promise<{
  encryptedValue: string;
  encryptedKey: string;
  iv: string;
}> {
  const enc = new TextEncoder();

  // Generate per-secret key
  const secretKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const rawSecretKey = await crypto.subtle.exportKey("raw", secretKey);

  // Encrypt plaintext with secretKey
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, secretKey, enc.encode(plaintext));

  // Encrypt secretKey with masterKey
  const keyIv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const encryptedKeyBytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv: keyIv }, masterKey, rawSecretKey);

  return {
    encryptedValue: Buffer.from(ciphertext).toString("base64url"),
    encryptedKey: Buffer.from(keyIv).toString("base64url") + "." + Buffer.from(encryptedKeyBytes).toString("base64url"),
    iv: Buffer.from(iv).toString("base64url"),
  };
}

export async function decryptValue(
  masterKey: CryptoKey,
  encryptedValue: string,
  encryptedKey: string,
  iv: string
): Promise<string> {
  const dec = new TextDecoder();

  const [keyIvB64, encKeyB64] = encryptedKey.split(".");
  const keyIv = Buffer.from(keyIvB64, "base64url");
  const encKeyBytes = Buffer.from(encKeyB64, "base64url");

  // Decrypt the secret key
  const rawSecretKey = await crypto.subtle.decrypt({ name: "AES-GCM", iv: keyIv }, masterKey, encKeyBytes);
  const secretKey = await crypto.subtle.importKey("raw", rawSecretKey, "AES-GCM", false, ["decrypt"]);

  // Decrypt the value
  const ivBytes = Buffer.from(iv, "base64url");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    secretKey,
    Buffer.from(encryptedValue, "base64url")
  );

  return dec.decode(plaintext);
}

export function getSSHPublicKey(keyPath?: string): string {
  const pubKeyPath = (keyPath ?? join(homedir(), ".ssh", "id_ed25519")) + ".pub";
  if (!existsSync(pubKeyPath)) {
    throw new Error(`SSH public key not found at ${pubKeyPath}`);
  }
  return readFileSync(pubKeyPath, "utf-8").trim();
}
