import { useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'

import { CHART_AXIS_COLORS, getProgressThresholdColor } from '@/lib/chartPalette'

Chart.register(...registerables)

type MilestoneChartProject = {
  id: string
  name: string
  milestoneProgress: number
  shiftedMilestoneCount: number
}

export function MilestoneAchievementChart({ projects }: { projects: MilestoneChartProject[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const hasMilestoneSignal = projects.some((project) => project.milestoneProgress > 0 || project.shiftedMilestoneCount > 0)

  useEffect(() => {
    if (!canvasRef.current || projects.length === 0 || !hasMilestoneSignal) {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
      return
    }

    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    const labels = projects.map((project) => project.name)
    const values = projects.map((project) => project.milestoneProgress)
    const shiftedValues = projects.map((project) => project.shiftedMilestoneCount)
    const backgroundColors = projects.map((project) => getProgressThresholdColor(project.milestoneProgress).background)
    const borderColors = projects.map((project) => getProgressThresholdColor(project.milestoneProgress).border)

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '里程碑达成率',
            data: values,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 2,
            borderRadius: 8,
            maxBarThickness: 42,
            yAxisID: 'yPercent',
          },
          {
            label: '已偏移里程碑数',
            data: shiftedValues,
            type: 'line',
            borderColor: '#f97316',
            backgroundColor: 'rgba(249, 115, 22, 0.16)',
            pointBackgroundColor: '#f97316',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4,
            tension: 0.28,
            yAxisID: 'yCount',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              color: CHART_AXIS_COLORS.axisText,
            },
          },
          tooltip: {
            callbacks: {
              label(context) {
                if (context.dataset.yAxisID === 'yCount') {
                  return `${context.parsed.y} 个`
                }
                return `${context.parsed.y}%`
              },
            },
          },
        },
        scales: {
          yPercent: {
            beginAtZero: true,
            max: 120,
            ticks: {
              callback(value) {
                return `${value}%`
              },
            },
            grid: {
              color(context) {
                if (context.tick.value === 100) {
                  return CHART_AXIS_COLORS.emphasisGrid
                }
                return CHART_AXIS_COLORS.neutralGrid
              },
            },
            border: {
              display: false,
            },
          },
          yCount: {
            position: 'right',
            beginAtZero: true,
            ticks: {
              precision: 0,
              callback(value) {
                return `${value} 个`
              },
            },
            grid: {
              display: false,
            },
            border: {
              display: false,
            },
          },
          x: {
            grid: {
              display: false,
            },
            ticks: {
              color: CHART_AXIS_COLORS.axisText,
              font: {
                size: 11,
              },
            },
          },
        },
        animation: {
          duration: 700,
          easing: 'easeOutQuart',
        },
      },
    })

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [hasMilestoneSignal, projects])

  if (projects.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
        当前暂无可展示的里程碑趋势
      </div>
    )
  }

  if (!hasMilestoneSignal) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
        <div className="text-base font-semibold text-slate-900">暂无里程碑趋势</div>
      </div>
    )
  }

  return (
    <div className="relative h-72 rounded-[24px] border border-slate-100 bg-white p-4">
      <canvas ref={canvasRef} />
    </div>
  )
}
