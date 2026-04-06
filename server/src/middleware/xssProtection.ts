// XSS 防护中间件
// 提供输入验证和富文本净化功能

import type { Request, Response, NextFunction } from 'express'
import { logger } from './logger.js'

// 危险的HTML标签和属性模式
const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
  /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
  /<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi,
  /<input\b[^>]*>/gi,
  /<textarea\b[^<]*(?:(?!<\/textarea>)<[^<]*)*<\/textarea>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,  // onclick, onerror, onload 等事件处理器
  /data:text\/html/gi,
]

// 危险的协议
const DANGEROUS_PROTOCOLS = [
  'javascript:',
  'vbscript:',
  'data:text/html',
  'data:application/javascript',
]

/**
 * 检查字符串是否包含XSS攻击向量
 */
export function containsXss(input: string): boolean {
  if (typeof input !== 'string') return false
  
  // 检查危险模式
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(input)) {
      return true
    }
  }
  
  // 检查危险协议
  const lowerInput = input.toLowerCase()
  for (const protocol of DANGEROUS_PROTOCOLS) {
    if (lowerInput.includes(protocol)) {
      return true
    }
  }
  
  return false
}

/**
 * 净化HTML内容（简单实现）
 * 移除所有HTML标签，只保留纯文本
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') return ''
  
  return input
    .replace(/<[^>]*>/g, '')  // 移除所有HTML标签
    .replace(/&/g, '&amp;')   // 转义&
    .replace(/</g, '&lt;')    // 转义<
    .replace(/>/g, '&gt;')    // 转义>
    .replace(/"/g, '&quot;')  // 转义"
    .replace(/'/g, '&#x27;')  // 转义'
}

/**
 * 净化富文本内容（允许部分安全标签）
 * 只允许基本的格式化标签
 */
export function sanitizeRichText(input: string): string {
  if (typeof input !== 'string') return ''
  
  // 首先检查是否包含危险内容
  if (containsXss(input)) {
    logger.warn('检测到潜在的XSS攻击内容', { input: input.substring(0, 100) })
    // 如果包含危险内容，完全净化为纯文本
    return sanitizeHtml(input)
  }
  
  // 允许的安全标签白名单
  const allowedTags = ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'ul', 'ol', 'li']
  
  // 移除所有不在白名单中的标签
  return input.replace(/<\/?([^>\s]+)[^>]*>/g, (match, tag) => {
    const tagName = tag.toLowerCase()
    if (allowedTags.includes(tagName)) {
      return match  // 保留允许的标签
    }
    return ''  // 移除不允许的标签
  })
}

/**
 * 验证字段长度
 */
export function validateLength(input: string, min: number, max: number): boolean {
  if (typeof input !== 'string') return false
  const length = input.length
  return length >= min && length <= max
}

/**
 * XSS防护中间件 - 检查请求体中的危险内容
 */
export function xssProtection(req: Request, res: Response, next: NextFunction): void {
  try {
    const checkValue = (value: any, path: string): boolean => {
      if (typeof value === 'string') {
        if (containsXss(value)) {
          logger.warn('检测到XSS攻击尝试', { 
            path, 
            ip: req.ip,
            userAgent: req.headers['user-agent']
          })
          return false
        }
      } else if (typeof value === 'object' && value !== null) {
        for (const [key, val] of Object.entries(value)) {
          if (!checkValue(val, `${path}.${key}`)) {
            return false
          }
        }
      }
      return true
    }
    
    // 检查请求体
    if (req.body && !checkValue(req.body, 'body')) {
      res.status(400).json({
        success: false,
        error: {
          code: 'XSS_DETECTED',
          message: '请求包含不安全的内容，请移除HTML脚本标签'
        },
        timestamp: new Date().toISOString()
      })
      return
    }
    
    // 检查查询参数
    if (req.query && !checkValue(req.query, 'query')) {
      res.status(400).json({
        success: false,
        error: {
          code: 'XSS_DETECTED',
          message: '查询参数包含不安全的内容'
        },
        timestamp: new Date().toISOString()
      })
      return
    }
    
    next()
  } catch (error) {
    logger.error('XSS防护中间件错误', { error })
    next()
  }
}

/**
 * 输入净化中间件 - 自动净化请求体中的字符串字段
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  try {
    const sanitizeValue = (value: any): any => {
      if (typeof value === 'string') {
        // 对字符串进行基本净化
        return value
          .trim()  // 去除首尾空白
          .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')  // 移除控制字符
      }
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          return value.map(sanitizeValue)
        }
        const sanitized: any = {}
        for (const [key, val] of Object.entries(value)) {
          sanitized[key] = sanitizeValue(val)
        }
        return sanitized
      }
      return value
    }
    
    if (req.body) {
      req.body = sanitizeValue(req.body)
    }
    
    next()
  } catch (error) {
    logger.error('输入净化中间件错误', { error })
    next()
  }
}

/**
 * 字段长度验证中间件工厂
 */
export function validateFieldLength(
  field: string, 
  min: number, 
  max: number
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.body[field]
    
    if (value === undefined || value === null) {
      next()
      return
    }
    
    if (typeof value !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TYPE',
          message: `字段 ${field} 必须是字符串`
        },
        timestamp: new Date().toISOString()
      })
      return
    }
    
    if (!validateLength(value, min, max)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_LENGTH',
          message: `字段 ${field} 长度必须在 ${min} 到 ${max} 之间`
        },
        timestamp: new Date().toISOString()
      })
      return
    }
    
    next()
  }
}

/**
 * 富文本字段净化中间件工厂
 * 用于处理可能包含HTML的字段（如描述、备注等）
 */
export function sanitizeRichTextField(field: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.body[field] && typeof req.body[field] === 'string') {
      req.body[field] = sanitizeRichText(req.body[field])
    }
    next()
  }
}

/**
 * 纯文本字段净化中间件工厂
 * 用于处理不应该包含HTML的字段（如标题、名称等）
 */
export function sanitizeTextField(field: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.body[field] && typeof req.body[field] === 'string') {
      req.body[field] = sanitizeHtml(req.body[field])
    }
    next()
  }
}
