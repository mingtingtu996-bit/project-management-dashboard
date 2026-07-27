import { describe, expect, it } from 'vitest'
import {
  CHINA_GB55032_TEMPLATE_CATALOG,
  flattenChinaTemplateCatalog,
} from '../seeds/chinaGb50300TemplateCatalog.js'
import { inferDurationContributionMode } from '../seeds/durationContributionMode.js'
import { inferExecutionNature } from '../seeds/executionNature.js'

describe('duration contribution mode inference', () => {
  it('keeps commissioning and trial-run field work duration-bearing even when names include gate words', () => {
    const durationBearingNames = [
      '通电试运行和验收',
      '辅助设备单机试运行和验收',
      '循环过滤加药消毒联动试运行和缺陷销项',
      '水力平衡调试和流量复测',
      '系统调试验收',
      '管道试压和渗漏整改复验',
      '回路通电试运行和相序检查',
      '联动调试和记录签认',
      '连续试运行问题销项',
      '试运行问题销项复测和公共广播资料移交',
    ]

    for (const name of durationBearingNames) {
      expect(inferDurationContributionMode({ name }), name).toBe('duration_bearing')
    }
  })

  it('keeps pure inspection or handover names non-duration-bearing', () => {
    expect(inferDurationContributionMode({ name: '模板成型验收' })).toBe('quality_gate')
    expect(inferDurationContributionMode({ name: '桩基验收复核' })).toBe('quality_gate')
    expect(inferDurationContributionMode({ name: '验收资料设备台账和运维移交签认' }))
      .not.toBe('duration_bearing')
    expect(inferDurationContributionMode({ name: '调试条件确认' })).toBe('embedded_check')
    expect(inferDurationContributionMode({ name: '调试方案编制审批和测点清单确认' }))
      .toBe('embedded_check')
    expect(inferDurationContributionMode({ name: '调试参数复核和交接签认' }))
      .toBe('handover_marker')
    expect(inferDurationContributionMode({ name: '试运行报告签认和移交' }))
      .toBe('record_only')
    expect(inferDurationContributionMode({ name: '试运行数据汇总' }))
      .toBe('record_only')
    expect(inferDurationContributionMode({ name: '试运行记录汇总' }))
      .toBe('record_only')
    expect(inferDurationContributionMode({ name: '联动调试记录参数回写和资料签认归档' }))
      .toBe('record_only')
    expect(inferDurationContributionMode({ name: '试运转前动力回路绝缘测试' }))
      .toBe('quality_gate')
    expect(inferDurationContributionMode({ name: '冲洗方案确认' }))
      .toBe('embedded_check')
    expect(inferDurationContributionMode({ name: '试压分段和盲板封堵方案确认' }))
      .toBe('embedded_check')
    expect(inferDurationContributionMode({ name: '综合布线系统调试方案端口清单和联调边界确认' }))
      .toBe('embedded_check')
    expect(inferDurationContributionMode({ name: '系统冲洗合格确认' }))
      .toBe('quality_gate')
    expect(inferDurationContributionMode({ name: '管道冲洗标识和安装验收' }))
      .toBe('quality_gate')
  })

  it('does not let recheck wording override physical pressure-test work', () => {
    expect(inferDurationContributionMode({ name: '管道试压和渗漏整改复验' }))
      .toBe('duration_bearing')
    expect(inferDurationContributionMode({ name: '管道试压复验和稳压查漏' }))
      .toBe('duration_bearing')
  })

  it('keeps the recent 22 false-negative field-work corpus duration-bearing', () => {
    const recentFalseNegativeFieldWorkNames = [
      '管道试压和渗漏整改复验',
      '管道试压复验和稳压查漏',
      '系统试压和冲洗',
      '管道试压和冲洗',
      '管路焊接试压冲洗',
      '冷冻水管路试压冲洗作业',
      '给排水快接试压',
      '水压试验和接口查漏',
      '气密性试验和泄漏整改复验',
      '压力恢复和稳压复测',
      '系统冲洗和过滤器清理',
      '蓄能管道循环冲洗',
      '冲洗问题整改闭合',
      '排污水浊度和杂质复测',
      '联动调试复核',
      '系统联动调试',
      '带载测试和切换联动调试',
      '联动试运行和复测',
      '连续试运行问题销项',
      '新旧系统并行试运行作业',
      '高压送电空载试运行',
      '通电通气试运行',
    ]

    expect(recentFalseNegativeFieldWorkNames).toHaveLength(22)
    for (const name of recentFalseNegativeFieldWorkNames) {
      expect(inferDurationContributionMode({ name }), name).toBe('duration_bearing')
    }
  })

  it('keeps field functional tests duration-bearing instead of demoting them to gates', () => {
    const durationBearingFunctionalTests = [
      '排水系统通畅性和功能测试',
      '联动功能测试(消防或人防)',
      '坐便器水箱满水试验和冲洗功能复核',
      '水质取样点布置和消毒冲洗联动测试',
      '安全阀整定报警联锁和保护功能测试',
      '广播回路阻抗抽测和分区播放功能测试',
      '断电守时电池或保持模块功能测试',
      '安全功能测试和问题销项',
      '平层精度和再平层功能测试',
    ]

    for (const name of durationBearingFunctionalTests) {
      expect(inferDurationContributionMode({ name }), name).toBe('duration_bearing')
    }
  })

  it('keeps duration-bearing testing and trial-run execution nature as physical work', () => {
    const physicalWorkNames = [
      '排水系统通畅性和功能测试',
      '联动功能测试(消防或人防)',
      '坐便器水箱满水试验和冲洗功能复核',
      '水质取样点布置和消毒冲洗联动测试',
      '安全阀整定报警联锁和保护功能测试',
      '广播回路阻抗抽测和分区播放功能测试',
      '断电守时电池或保持模块功能测试',
      '安全功能测试和问题销项',
      '平层精度和再平层功能测试',
      '循环过滤加药消毒联动试运行和缺陷销项',
      '连续试运行问题销项',
      '试运行问题销项复测和公共广播资料移交',
      '联动调试和记录签认',
    ]

    for (const name of physicalWorkNames) {
      const durationContributionMode = inferDurationContributionMode({ name })
      expect(durationContributionMode, name).toBe('duration_bearing')
      expect(inferExecutionNature({ name, durationContributionMode }), name).toBe('physical_work')
    }
  })

  it('marks known process-level commissioning carriers as duration-bearing in the catalog', () => {
    const nodesByStableCode = new Map(
      flattenChinaTemplateCatalog(CHINA_GB55032_TEMPLATE_CATALOG.divisions)
        .filter((node) => node.categoryType === 'process')
        .map((node) => [node.stableCode, node]),
    )

    const durationBearingStableCodes = [
      '05-05-02-P07',
      '05-05-08-P05',
      '05-05-05-P09',
      '05-11-02-P11',
      '05-10-03-P07',
      '06-06-08-P07',
      '07-01-08-P05',
      '08-04-06-P08',
      '01-07-04-P04',
      '03-04-04-P07',
      '05-04-04-P04',
      '05-09-02-P05',
      '05-13-01-P10',
      '06-06-07-P08',
      '06-13-02-P08',
      '06-14-02-P08',
      '08-09-03-P05',
      '08-12-03-P08',
      '08-14-04-P07',
      '08-15-06-P04',
      '08-16-03-P07',
      '08-17-01-P07',
      '05-01-09-P08',
      '05-13-07-P08',
      '06-01-07-P08',
      '06-02-08-P08',
      '06-03-07-P08',
      '06-04-09-P08',
      '06-20-02-P06',
      '06-11-06-P06',
      '07-01-10-P06',
      '07-02-03-P06',
      '07-03-02-P06',
      '07-05-01-P06',
      '07-05-11-P06',
      '07-06-09-P06',
      '07-07-04-P05',
      '08-01-01-P07',
      '08-05-07-P08',
      '08-14-02-P05',
      '08-17-03-P08',
      '08-18-04-P09',
      '10-01-07-P06',
      '10-02-04-P06',
      '10-02-07-P05',
      '10-02-12-P04',
      '03-03-01-P06',
    ]

    for (const stableCode of durationBearingStableCodes) {
      expect(nodesByStableCode.get(stableCode)?.metadata?.durationContributionMode, stableCode)
        .toBe('duration_bearing')
      expect(nodesByStableCode.get(stableCode)?.metadata?.executionNature, stableCode)
        .toBe('physical_work')
    }
  })

  it('keeps preparation and confirmation process-level field-action contexts non-duration-bearing in the catalog', () => {
    const nodesByStableCode = new Map(
      flattenChinaTemplateCatalog(CHINA_GB55032_TEMPLATE_CATALOG.divisions)
        .filter((node) => node.categoryType === 'process')
        .map((node) => [node.stableCode, node]),
    )

    const nonDurationStableCodes = [
      ['05-01-07-P01', 'embedded_check'],
      ['05-01-08-P02', 'quality_gate'],
      ['05-05-01-P07', 'quality_gate'],
      ['05-08-02-P01', 'embedded_check'],
      ['06-10-03-P01', 'embedded_check'],
      ['06-12-03-P01', 'embedded_check'],
      ['06-13-03-P01', 'embedded_check'],
      ['06-14-03-P01', 'embedded_check'],
      ['08-05-07-P01', 'embedded_check'],
      ['08-16-05-P01', 'embedded_check'],
    ] as const

    for (const [stableCode, expectedMode] of nonDurationStableCodes) {
      expect(nodesByStableCode.get(stableCode)?.metadata?.durationContributionMode, stableCode)
        .toBe(expectedMode)
    }
  })
})
