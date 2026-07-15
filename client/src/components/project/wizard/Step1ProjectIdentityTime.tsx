// v1.4.22.1 - Step 1: project identity, time anchors, and scale facts.
import { memo } from 'react'

import type { WizardDraftPayload, WizardMode } from './types'

interface Props {
  draft: WizardDraftPayload
  mode: WizardMode
  onUpdate: (u: Partial<WizardDraftPayload>) => void
}

function Step1ProjectIdentityTimeComponent({ draft, mode, onUpdate }: Props) {
  const scaleField = (
    label: string,
    key: keyof Pick<WizardDraftPayload, 'totalAreaM2' | 'aboveGroundAreaM2' | 'basementAreaM2' | 'siteAreaM2'>,
    placeholder: string,
  ) => (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        aria-label={label}
        type="number"
        value={draft[key] ?? ''}
        onChange={(event) => onUpdate({ [key]: Number(event.target.value) || undefined })}
        className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        placeholder={placeholder}
      />
    </label>
  )

  const selectField = (
    label: string,
    value: string | undefined,
    key: keyof Pick<WizardDraftPayload, 'planScopeCaliber' | 'deliveryStandard' | 'terminalEvent'>,
    options: Array<{ value: string; label: string }>,
  ) => (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        aria-label={label}
        value={value ?? ''}
        onChange={(event) => onUpdate({ [key]: event.target.value || undefined })}
        className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <option value="">请选择</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-900">项目身份与时间</h2>
      <div className="max-w-[640px] space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">项目名称 <span className="text-red-500">*</span></span>
          <input
            type="text"
            value={draft.projectName ?? ''}
            onChange={(event) => onUpdate({ projectName: event.target.value })}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            placeholder="输入项目名称"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">项目地点 <span className="text-red-500">*</span></span>
          <input
            type="text"
            value={draft.location ?? ''}
            onChange={(event) => onUpdate({ location: event.target.value })}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            placeholder="输入城市名称"
          />
        </label>
        {mode === 'new' ? (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">计划开工日期</span>
            <input
              type="date"
              value={draft.plannedStartDate ?? ''}
              onChange={(event) => onUpdate({ plannedStartDate: event.target.value })}
              aria-label="计划开工日期 planned start"
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            />
          </label>
        ) : null}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">目标竣工日期</span>
          <input
            type="date"
            value={draft.plannedEndDate ?? ''}
            onChange={(event) => onUpdate({ plannedEndDate: event.target.value })}
            aria-label="目标竣工日期 planned end"
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          />
        </label>
        {mode === 'starting_line' ? (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">实际开工日期 <span className="text-red-500">*</span></span>
            <input
              type="date"
              value={draft.actualStartDate ?? ''}
              onChange={(event) => onUpdate({ actualStartDate: event.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            />
          </label>
        ) : null}
        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 md:grid-cols-3">
          {selectField('计划范围口径', draft.planScopeCaliber, 'planScopeCaliber', [
            { value: 'full_project_master', label: '项目全范围总控计划' },
            { value: 'general_contract', label: '施工总承包范围' },
            { value: 'civil_structure_package', label: '土建/主体结构包' },
            { value: 'specialty_package', label: '专项专业包' },
            { value: 'continuation_start_line', label: '已开工项目接续计划' },
          ])}
          {selectField('交付标准', draft.deliveryStandard, 'deliveryStandard', [
            { value: 'rough', label: '毛坯交付' },
            { value: 'mep_ready', label: '机电完成可移交' },
            { value: 'public_area_fitout', label: '公区精装完成' },
            { value: 'full_fitout', label: '全装修交付' },
            { value: 'hotel_opening', label: '酒店开业' },
            { value: 'production_ready', label: '投产/生产验证' },
          ])}
          {selectField('终点事件', draft.terminalEvent, 'terminalEvent', [
            { value: 'contract_completion', label: '合同约定完工' },
            { value: 'completion_acceptance', label: '竣工验收/备案' },
            { value: 'owner_handover', label: '业主移交' },
            { value: 'trial_opening', label: '试运营/试开业' },
            { value: 'production_validation', label: '投产验证通过' },
          ])}
        </div>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--el-1)]">
          <h3 className="text-sm font-semibold text-slate-900">项目规模事实</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            这些面积和交付口径会作为计划生成、标准工期、工程量修正和模板推荐的输入事实。
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {scaleField('总建筑面积 (m²)', 'totalAreaM2', '例：180000')}
            {scaleField('地上建筑面积 (m²)', 'aboveGroundAreaM2', '例：135000')}
            {scaleField('地下建筑面积 (m²)', 'basementAreaM2', '例：45000')}
            {scaleField('占地面积 (m²)', 'siteAreaM2', '例：62000')}
          </div>
        </section>
      </div>
    </div>
  )
}

export const Step1ProjectIdentityTime = memo(Step1ProjectIdentityTimeComponent)
