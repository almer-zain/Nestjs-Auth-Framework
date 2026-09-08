import * as crypto from 'crypto';
import * as argon2 from 'argon2';

export class AuthCryptoUtil {
  /**
   * Computes a cryptographic SHA-256 hash.
   */
  static hashDigest(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Hashes a password using Argon2id with 64MB memory cost.
   */
  static async hashPassword(password: string): Promise<string> {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });
  }

  /**
   * Verifies a password against an Argon2id hash.
   */
  static async verifyPassword(hash: string, plain: string): Promise<boolean> {
    return await argon2.verify(hash, plain);
  }

  /**
   * Normalizes otplib verification output.
   */
  static parseVerifyResult(result: unknown): boolean {
    if (typeof result === 'boolean') return result;
    if (typeof result === 'object' && result !== null && 'valid' in result) {
      return Boolean((result as { valid: boolean }).valid);
    }
    return Boolean(result);
  }
}
