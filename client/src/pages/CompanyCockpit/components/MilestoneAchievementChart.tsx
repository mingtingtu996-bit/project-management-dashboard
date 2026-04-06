import { useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

type MilestoneChartProject = {
  id: string
  name: string
  milestoneProgress: number
}

export function MilestoneAchievementChart({ projects }: { projects: MilestoneChartProject[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const hasMilestoneProgress = projects.some((project) => project.milestoneProgress > 0)

  useEffect(() => {
    if (!canvasRef.current || projects.length === 0 || !hasMilestoneProgress) {
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

    const backgroundColors = projects.map((project) => {
      if (project.milestoneProgress >= 90) return 'rgba(16, 185, 129, 0.72)'
      if (project.milestoneProgress >= 70) return 'rgba(59, 130, 246, 0.72)'
      if (project.milestoneProgress >= 50) return 'rgba(245, 158, 11, 0.72)'
      return 'rgba(239, 68, 68, 0.72)'
    })

    const borderColors = projects.map((project) => {
      if (project.milestoneProgress >= 90) return 'rgba(16, 185, 129, 1)'
      if (project.milestoneProgress >= 70) return 'rgba(59, 130, 246, 1)'
      if (project.milestoneProgress >= 50) return 'rgba(245, 158, 11, 1)'
      return 'rgba(239, 68, 68, 1)'
    })

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
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.parsed.y}%`
              },
            },
          },
        },
        scales: {
          y: {
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
                  return 'rgba(239, 68, 68, 0.22)'
                }
                return 'rgba(148, 163, 184, 0.16)'
              },
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
              color: '#475569',
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
  }, [hasMilestoneProgress, projects])

  if (projects.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
        当前暂无可展示的里程碑趋势
      </div>
    )
  }

  if (!hasMilestoneProgress) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
        <div className="text-base font-semibold text-slate-900">暂无里程碑趋势</div>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          当前项目还没有可汇总的里程碑进展，识别出关键节点后，这里会展示跨项目的达成率对比。
        </p>
      </div>
    )
  }

  return (
    <div className="relative h-72 rounded-[24px] border border-slate-100 bg-white p-4">
      <canvas ref={canvasRef} />
    </div>
  )
}
