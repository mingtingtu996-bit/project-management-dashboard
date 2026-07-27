/**
 * 密码哈希和验证工具
 */

import { randomInt } from 'node:crypto';

import bcrypt from 'bcryptjs';

const TEMPORARY_PASSWORD_GROUPS = [
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  'abcdefghijkmnopqrstuvwxyz',
  '23456789',
  '!@#$%^&*_-+=',
] as const;

function secureShuffle(value: string[]): string[] {
  for (let index = value.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [value[index], value[swapIndex]] = [value[swapIndex], value[index]];
  }
  return value;
}

export function generateTemporaryPassword(length = 16): string {
  if (!Number.isInteger(length) || length < TEMPORARY_PASSWORD_GROUPS.length) {
    throw new RangeError(`Temporary password length must be at least ${TEMPORARY_PASSWORD_GROUPS.length}`);
  }

  const allCharacters = TEMPORARY_PASSWORD_GROUPS.join('');
  const characters = TEMPORARY_PASSWORD_GROUPS.map((group) => group[randomInt(group.length)]);
  while (characters.length < length) {
    characters.push(allCharacters[randomInt(allCharacters.length)]);
  }

  return secureShuffle(characters).join('');
}

/**
 * 哈希密码
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * 验证密码
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * 验证密码强度
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 6) {
    errors.push('密码长度至少6位');
  }

  if (password.length > 50) {
    errors.push('密码长度不能超过50位');
  }

  // 可以添加更多规则，如必须包含大小写字母、数字等

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证用户名格式
 */
export function validateUsername(username: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (username.length < 3) {
    errors.push('用户名至少3个字符');
  }

  if (username.length > 50) {
    errors.push('用户名不能超过50个字符');
  }

  // 只允许字母、数字、下划线
  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  if (!usernameRegex.test(username)) {
    errors.push('用户名只能包含字母、数字和下划线');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
