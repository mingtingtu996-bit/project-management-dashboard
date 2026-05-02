import { ChartAccessibleWrapper } from '@/components/ChartAccessibleWrapper'
import { CHART_SERIES } from '@/lib/chartPalette'
import { cn } from '@/lib/utils'

interface SparklineProps {
  data: { value: number }[]
  color?: string
  className?: string
}

function buildPath(values: number[], width: number, height: number) {
  if (values.length === 0) return ''
  if (values.length === 1) return `M 0 ${height / 2} L ${width} ${height / 2}`

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)

  return values
    .map((value, index) => {
      const x = index * step
      const y = height - ((value - min) / span) * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

export function Sparkline({ data, color = CHART_SERIES.primary, className }: SparklineProps) {
  const values = data.map((item) => item.value).filter(Number.isFinite)
  if (values.length === 0) return null

  const width = 80
  const height = 32
  const path = buildPath(values, width, height)

  return (
    <ChartAccessibleWrapper
      className="inline-block"
      detailsClassName="sr-only"
      summary="趋势微图数据"
      columns={['序号', '数值']}
      rows={values.map((value, index) => [index + 1, value])}
    >
      <svg
        className={cn('h-8 w-20 overflow-visible', className)}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="趋势微图"
        focusable="false"
      >
        {path ? (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
          />
        ) : null}
      </svg>
    </ChartAccessibleWrapper>
  )
}
