import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, 64) as Buffer;
  const hashedPassword = derivedKey.toString("hex");
  console.log("[PASSWORD] Created new password hash:", {
    saltLength: salt.length,
    hashLength: hashedPassword.length,
    format: "hash.salt"
  });
  return `${hashedPassword}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  try {
    console.log("[PASSWORD] Starting password comparison");

    const [hashedPassword, salt] = stored.split(".");
    if (!hashedPassword || !salt) {
      console.error("[PASSWORD] Invalid stored password format:", {
        hasHash: !!hashedPassword,
        hasSalt: !!salt,
        storedLength: stored.length
      });
      return false;
    }

    console.log("[PASSWORD] Password format validation:", {
      saltLength: salt.length,
      hashLength: hashedPassword.length,
      format: "hash.salt"
    });

    const hashedBuf = Buffer.from(hashedPassword, "hex");
    const suppliedBuf = await scryptAsync(supplied, salt, 64) as Buffer;

    console.log("[PASSWORD] Generated hash comparison:", {
      storedHashLength: hashedBuf.length,
      generatedHashLength: suppliedBuf.length
    });

    const result = timingSafeEqual(hashedBuf, suppliedBuf);
    console.log("[PASSWORD] Comparison result:", { matches: result });

    return result;
  } catch (error) {
    console.error("[PASSWORD] Error comparing passwords:", error);
    return false;
  }
}