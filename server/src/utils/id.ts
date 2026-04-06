/**
 * ID 生成工具
 * 统一使用 crypto.randomUUID() 生成 UUID
 * 
 * 使用示例:
 * ```typescript
 * import { generateId } from '../utils/id.js'
 * 
 * const newId = generateId()
 * ```
 */

/**
 * 生成 UUID v4
 * 使用 Node.js 内置的 crypto.randomUUID()
 */
export function generateId(): string {
  return crypto.randomUUID()
}

/**
 * 生成短 ID（8位随机字符串）
 * 用于临时标识、缓存键等场景
 */
export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10)
}

/**
 * 生成带前缀的 ID
 * 例如: task-12345678-1234-1234-1234-123456789abc
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}-${generateId()}`
}

/**
 * 验证是否为有效的 UUID
 */
export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(id)
}

// 默认导出
export default {
  generateId,
  generateShortId,
  generatePrefixedId,
  isValidUUID
}
