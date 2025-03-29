import crypto from 'crypto';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

/**
 * Generates a secure random token for password reset
 * @param length Length of the token to generate
 * @returns A random token string with the specified length
 */
export function generateToken(length: number): string {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Hashes a password using scrypt with a random salt
 * @param password The password to hash
 * @returns The hashed password with salt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = await scryptAsync(password, salt, 64) as Buffer;
  return `${buf.toString('hex')}.${salt}`;
}

/**
 * Compares a provided password with a stored hash
 * @param storedPassword The stored hashed password
 * @param suppliedPassword The password to check
 * @returns True if the passwords match, false otherwise
 */
export async function comparePasswords(
  storedPassword: string,
  suppliedPassword: string
): Promise<boolean> {
  const [hashedPassword, salt] = storedPassword.split('.');
  const buf = await scryptAsync(suppliedPassword, salt, 64) as Buffer;
  return buf.toString('hex') === hashedPassword;
}