// 统计分析工具
// 用于工期预测和延期风险评估的统计计算

/**
 * 计算工期偏差率
 * @param plannedDuration 计划工期（天）
 * @param actualDuration 实际工期（天）
 * @returns 偏差率，正值表示延期，负值表示提前
 */
export function calculateDeviationRate(
  plannedDuration: number,
  actualDuration: number
): number {
  if (plannedDuration === 0) return 0
  return (actualDuration - plannedDuration) / plannedDuration
}

/**
 * 计算加权平均值
 * @param values 数值数组
 * @param weights 权重数组
 * @returns 加权平均值
 */
export function calculateWeightedAverage(
  values: number[],
  weights: number[]
): number {
  if (values.length === 0 || weights.length === 0 || values.length !== weights.length) {
    return 0
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  if (totalWeight === 0) return 0

  const weightedSum = values.reduce((sum, value, i) => sum + value * weights[i], 0)
  return weightedSum / totalWeight
}

/**
 * 计算简单平均值
 * @param values 数值数组
 * @returns 平均值
 */
export function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, val) => sum + val, 0) / values.length
}

/**
 * 计算标准差
 * @param values 数值数组
 * @returns 标准差
 */
export function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0

  const avg = calculateAverage(values)
  const squaredDiffs = values.map((val) => Math.pow(val - avg, 2))
  const variance = calculateAverage(squaredDiffs)
  return Math.sqrt(variance)
}

/**
 * 计算中位数
 * @param values 数值数组
 * @returns 中位数
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

/**
 * 计算百分位数
 * @param values 数值数组
 * @param percentile 百分位数（0-100）
 * @returns 百分位数值
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0
  if (percentile < 0 || percentile > 100) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const index = (percentile / 100) * (sorted.length - 1)

  if (Number.isInteger(index)) {
    return sorted[index]
  }

  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

/**
 * 获取季节系数
 * 基于中国建筑行业的季节特点
 * @param month 月份（1-12）
 * @returns 季节系数
 */
export function getSeasonalCoefficient(month: number): number {
  // 1月（春节前夕）：工作效率降低
  if (month === 1) return 1.15

  // 2月（春节期间）：效率最低
  if (month === 2) return 1.25

  // 6-7月（梅雨季）：受天气影响
  if (month === 6 || month === 7) return 1.1

  // 12月（冬季施工）：效率降低
  if (month === 12) return 1.1

  // 其他月份正常
  return 1.0
}

/**
 * 计算复杂度系数
 * 基于任务特征（依赖数量、是否里程碑等）
 * @param dependencies 依赖任务数量
 * @param isMilestone 是否是里程碑
 * @returns 复杂度系数
 */
export function calculateComplexityCoefficient(
  dependencies: number,
  isMilestone: boolean
): number {
  let coefficient = 1.0

  // 依赖任务越多，复杂度越高
  if (dependencies > 5) coefficient += 0.2
  else if (dependencies > 3) coefficient += 0.1

  // 里程碑任务通常更复杂
  if (isMilestone) coefficient += 0.15

  return coefficient
}

/**
 * 计算延期概率
 * 基于进度偏差、剩余工期、阻碍数量等因素
 * @param progressDeviation 进度偏差率
 * @param remainingDays 剩余天数
 * @param obstacleCount 阻碍数量
 * @param complexityCoefficient 复杂度系数
 * @returns 延期概率（0-1）
 */
export function calculateDelayProbability(
  progressDeviation: number,
  remainingDays: number,
  obstacleCount: number,
  complexityCoefficient: number
): number {
  // 基础延期概率
  let probability = 0

  // 进度偏差影响
  if (progressDeviation < -0.1) {
    // 进度落后超过10%
    probability += 0.3 + Math.abs(progressDeviation) * 0.5
  } else if (progressDeviation < -0.05) {
    // 进度落后5-10%
    probability += 0.2
  }

  // 剩余工期影响（工期越紧，延期风险越高）
  if (remainingDays < 3) {
    probability += 0.3
  } else if (remainingDays < 7) {
    probability += 0.15
  } else if (remainingDays < 14) {
    probability += 0.05
  }

  // 阻碍数量影响
  if (obstacleCount >= 3) {
    probability += 0.4
  } else if (obstacleCount >= 2) {
    probability += 0.2
  } else if (obstacleCount >= 1) {
    probability += 0.1
  }

  // 复杂度影响
  if (complexityCoefficient > 1.2) {
    probability += 0.15
  } else if (complexityCoefficient > 1.1) {
    probability += 0.05
  }

  // 概率上限为1（100%）
  return Math.min(probability, 1.0)
}

/**
 * 计算任务类型调整系数
 * 基于历史同类型任务的工期偏差数据
 * @param historicalData 历史偏差数据
 * @returns 类型调整系数
 */
export function calculateTypeCoefficient(
  historicalData: number[]
): { coefficient: number; confidence: number } {
  if (historicalData.length === 0) {
    return { coefficient: 1.0, confidence: 0 }
  }

  // 使用中位数避免极端值影响
  const medianDeviation = calculateMedian(historicalData)

  // 调整系数 = 1 + 中位数偏差
  const coefficient = 1 + medianDeviation

  // 样本越多，置信度越高
  let confidence = 0
  if (historicalData.length >= 10) confidence = 0.9
  else if (historicalData.length >= 5) confidence = 0.7
  else if (historicalData.length >= 3) confidence = 0.5
  else confidence = 0.3

  return { coefficient, confidence }
}

/**
 * 分组统计数据
 * @param data 数据数组
 * @param keyFn 分组键函数
 * @returns 分组统计结果
 */
export function groupBy<T>(
  data: T[],
  keyFn: (item: T) => string
): Record<string, T[]> {
  return data.reduce((result, item) => {
    const key = keyFn(item)
    if (!result[key]) {
      result[key] = []
    }
    result[key].push(item)
    return result
  }, {} as Record<string, T[]>)
}

/**
 * 线性回归预测
 * 用于趋势分析
 * @param xValues 自变量数组
 * @param yValues 因变量数组
 * @returns 斜率和截距
 */
export function linearRegression(
  xValues: number[],
  yValues: number[]
): { slope: number; intercept: number; r2: number } {
  if (xValues.length !== yValues.length || xValues.length === 0) {
    return { slope: 0, intercept: 0, r2: 0 }
  }

  const n = xValues.length
  const sumX = xValues.reduce((sum, x) => sum + x, 0)
  const sumY = yValues.reduce((sum, y) => sum + y, 0)
  const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0)
  const sumXX = xValues.reduce((sum, x) => sum + x * x, 0)
  const sumYY = yValues.reduce((sum, y) => sum + y * y, 0)

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // 计算R²（决定系数）
  const yMean = sumY / n
  const ssTotal = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0)
  const ssResidual = yValues.reduce(
    (sum, y, i) => sum + Math.pow(y - (slope * xValues[i] + intercept), 2),
    0
  )
  const r2 = 1 - ssResidual / ssTotal

  return { slope, intercept, r2: isFinite(r2) ? r2 : 0 }
}
