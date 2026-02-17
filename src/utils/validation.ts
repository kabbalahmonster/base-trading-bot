/**
 * Validation utilities for security and input validation
 */

/**
 * Validates if a string is a valid BigInt representation
 * Rejects empty strings, decimal numbers, and non-numeric strings
 */
export function isValidBigIntString(value: string): boolean {
  if (typeof value !== 'string') return false;
  if (value === '') return false;
  
  // Check for decimal points (BigInt doesn't support decimals)
  if (value.includes('.')) return false;
  
  // Valid BigInt patterns:
  // - Decimal: optional +/- followed by digits (no leading zeros unless value is 0)
  // - Hex: 0x followed by hex digits
  const decimalPattern = /^-?(?:0|[1-9]\d*)$/;
  const hexPattern = /^0x[0-9a-fA-F]+$/;
  
  return decimalPattern.test(value) || hexPattern.test(value);
}

/**
 * Parses a string to BigInt with validation
 * Throws if the string is not a valid BigInt representation
 */
export function parseBigIntStrict(value: string): bigint {
  if (!isValidBigIntString(value)) {
    throw new Error(`Invalid BigInt string: "${value}"`);
  }
  return BigInt(value);
}

/**
 * Validates percentage value is within valid range (0-100)
 */
export function isValidPercentage(value: number): boolean {
  return typeof value === 'number' && !isNaN(value) && value >= 0 && value <= 100;
}

/**
 * Clamps a percentage value to valid range (0-100)
 */
export function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Validates price is a positive finite number
 */
export function isValidPrice(value: number): boolean {
  return typeof value === 'number' && !isNaN(value) && isFinite(value) && value > 0;
}

/**
 * Validates position count is a positive integer
 */
export function isValidPositionCount(value: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
