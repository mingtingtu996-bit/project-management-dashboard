import { describe, expect, it } from 'vitest'

import { inferControlRoles } from '../seeds/controlRoles.js'

describe('controlRoles', () => {
  it('keeps explicit quality-gate commissioning and trial-operation rows out of generic test-control false negatives', () => {
    for (const name of [
      '系统调试验收资料移交',
      '联动调试验收签认',
      '试运行缺陷闭合验收',
      '连续试运行报告归档验收',
      '满载试运行移交签认',
      '调试报告移交签认',
      '系统联调验收移交',
      'SAT测试报告签认归档',
      'FAT记录和出厂参数核验',
      'IQ/OQ/PQ报告签认',
      '隐蔽验收资料归档',
      '试压合格记录移交',
      '闭水试验验收签认',
      '淋水试验缺陷闭合',
      '封板前验收放行',
      '防火封堵验收记录',
      '竣工资料移交',
      '运维资料移交',
      '备案资料组卷归档',
      '第三方检测报告移交',
      '质量复测问题销项验收',
      '移交清单签认闭合',
    ]) {
      const roles = inferControlRoles({
        name,
        durationContributionMode: 'quality_gate',
        planItemKind: 'inspection_task',
      })

      expect(roles.qualityControlRole, name).not.toBe('test_control')
    }
  })
})
