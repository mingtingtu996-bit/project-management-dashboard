import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, CreditCard, FolderKanban, RefreshCw } from 'lucide-react'

import { useCurrentCompanyRole } from '@/hooks/useCurrentCompanyRole'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'
import {
  createCommercialOrder,
  getCommercialEntitlements,
  type CommercialEntitlements,
  type CommercialPlan,
  type CommercialPlanTier,
} from '@/services/commercialApi'

const PLAN_ORDER: CommercialPlanTier[] = ['free', 'starter', 'pro', 'group']

function formatPrice(plan: CommercialPlan) {
  if (plan.monthlyPriceCents === null) return '联系运营'
  if (plan.monthlyPriceCents === 0) return '免费'
  return `¥${plan.monthlyPriceCents / 100} / 月`
}

function projectLimitLabel(plan: CommercialPlan) {
  return plan.projectLimit === null ? '按合同配置' : `${plan.projectLimit} 个 active 项目`
}

export default function BillingSettings() {
  const companyRole = useCurrentCompanyRole()
  const canSubmitOrder = companyRole === 'company_admin'
  const [data, setData] = useState<CommercialEntitlements | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submittingTier, setSubmittingTier] = useState<CommercialPlanTier | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    document.title = '套餐与权益 | WorkBuddy'
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getCommercialEntitlements())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '套餐信息加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const plans = useMemo(
    () => PLAN_ORDER.map((tier) => data?.plans[tier]).filter((plan): plan is CommercialPlan => Boolean(plan)),
    [data],
  )

  const submitOrder = async (tier: 'starter' | 'pro') => {
    setSubmittingTier(tier)
    setSubmitted(false)
    setError(null)
    try {
      await createCommercialOrder(tier)
      setSubmitted(true)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '升级申请提交失败')
    } finally {
      setSubmittingTier(null)
    }
  }

  if (loading) {
    return <LoadingState label="套餐信息加载中" className="mx-auto mt-24 w-full max-w-sm" />
  }

  if (!data || error && !data) {
    return (
      <section className="page-shell mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="border-l-4 border-red-500 bg-white p-5" role="alert">
          <p className="text-sm font-medium text-slate-900">{error || '套餐信息不可用'}</p>
          <Button className="mt-4" variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重试
          </Button>
        </div>
      </section>
    )
  }

  const usagePercent = data.active_project_limit > 0
    ? Math.min(100, Math.round((data.active_project_count / data.active_project_limit) * 100))
    : 0

  return (
    <section className="page-shell mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">公司设置</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">套餐与权益</h1>
        </div>
        <Badge variant={data.billing_enabled ? 'default' : 'secondary'}>
          {data.billing_enabled ? '额度执行中' : '冷启动计量中'}
        </Badge>
      </header>

      <div className="mt-6 grid gap-5 border-b border-slate-200 pb-6 sm:grid-cols-2">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <FolderKanban className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-slate-600">active 项目</span>
              <strong className="tabular-nums text-slate-950">{data.active_project_count} / {data.active_project_limit}</strong>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" aria-label="项目额度使用率">
              <div className="h-full bg-blue-600" style={{ width: `${usagePercent}%` }} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-slate-600">当前状态</p>
            <p className="mt-1 font-medium text-slate-950">{data.plans[data.plan_tier]?.label} · {data.commercial_state}</p>
          </div>
        </div>
      </div>

      {submitted ? (
        <div className="mt-6 border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900" role="status">
          升级申请已提交
        </div>
      ) : null}
      {error && data ? (
        <div className="mt-6 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">{error}</div>
      ) : null}
      {!canSubmitOrder ? (
        <div className="mt-6 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          仅公司管理员可提交套餐申请
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const current = plan.tier === data.plan_tier
          const orderableTier = plan.tier === 'starter' || plan.tier === 'pro' ? plan.tier : null
          return (
            <Card key={plan.tier} className={current ? 'border-blue-400 ring-1 ring-blue-200' : undefined}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base">{plan.label}</CardTitle>
                  {current ? <Badge>当前套餐</Badge> : null}
                </div>
                <p className="pt-2 text-xl font-semibold tabular-nums text-slate-950">{formatPrice(plan)}</p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Check className="h-4 w-4 text-emerald-600" />
                  {projectLimitLabel(plan)}
                </div>
              </CardContent>
              <CardFooter>
                {orderableTier ? (
                  <Button
                    className="w-full"
                    variant={plan.tier === 'pro' ? 'default' : 'outline'}
                    disabled={!canSubmitOrder || current || submittingTier !== null}
                    onClick={() => void submitOrder(orderableTier)}
                  >
                    {submittingTier === plan.tier ? '提交中' : `申请${plan.label}`}
                  </Button>
                ) : (
                  <Button className="w-full" variant="outline" disabled>
                    {current ? '已生效' : '联系运营'}
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
