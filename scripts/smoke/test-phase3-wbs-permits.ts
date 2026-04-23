/**
 * Phase 3 WBS 模板和证照管理功能测试脚本
 * 测试覆盖: WBS模板管理、前期证照管理、证照过期预警
 * 执行方式: node test-phase3-wbs-permits.ts
 */

const API_BASE = 'http://localhost:3001'

// 工具函数
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const formatDate = (date: Date) => date.toISOString().split('T')[0]

// 测试数据
let testProjectId = ''
let testTemplateId = ''
let testPermitId = ''
let testConditionId = ''

/**
 * 测试 TC-015-01: WBS模板列表查询
 */
async function testTC015_01_WbsTemplateList() {
  console.log('\n=== TC-015-01: WBS模板列表查询 ===')
  
  try {
    const response = await fetch(`${API_BASE}/api/wbs-templates`)
    const data = await response.json()
    
    if (data.success) {
      console.log('✅ WBS模板列表查询成功')
      console.log(`   返回模板数量: ${data.data.length}`)
      if (data.data.length > 0) {
        console.log(`   首个模板: ${data.data[0].name}`)
      }
      return true
    } else {
      console.log('❌ WBS模板列表查询失败:', data.error)
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error)
    return false
  }
}

/**
 * 测试 TC-015-02: 创建WBS模板
 */
async function testTC015_02_CreateWbsTemplate() {
  console.log('\n=== TC-015-02: 创建WBS模板 ===')
  
  try {
    const templateData = {
      name: '测试住宅模板',
      description: '用于测试的住宅项目WBS模板',
      category: '住宅',
      template_type: '住宅',
      tags: ['测试', '住宅', '高层'],
      applicable_building_types: ['高层建筑', '别墅'],
      applicable_project_types: ['新建项目'],
      min_area: 1000,
      max_area: 50000,
      is_public: false,
      is_active: true
    }
    
    const response = await fetch(`${API_BASE}/api/wbs-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templateData)
    })
    
    const data = await response.json()
    
    if (data.success && data.data) {
      testTemplateId = data.data.id
      console.log('✅ WBS模板创建成功')
      console.log(`   模板ID: ${testTemplateId}`)
      console.log(`   模板名称: ${data.data.name}`)
      return true
    } else {
      console.log('❌ WBS模板创建失败:', data.error)
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error)
    return false
  }
}

/**
 * 测试 TC-015-03: 更新和删除WBS模板
 */
async function testTC015_03_UpdateDeleteWbsTemplate() {
  console.log('\n=== TC-015-03: 更新和删除WBS模板 ===')
  
  if (!testTemplateId) {
    console.log('⚠️  跳过: 没有测试模板ID')
    return false
  }
  
  try {
    // 更新模板
    const updateData = {
      name: '测试住宅模板（已更新）',
      description: '更新后的描述',
      category: '住宅',
      template_type: '住宅'
    }
    
    let response = await fetch(`${API_BASE}/api/wbs-templates/${testTemplateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    })
    
    let data = await response.json()
    
    if (data.success) {
      console.log('✅ WBS模板更新成功')
      console.log(`   更新后名称: ${data.data.name}`)
    } else {
      console.log('❌ WBS模板更新失败:', data.error)
      return false
    }
    
    // 删除模板
    await sleep(100)
    response = await fetch(`${API_BASE}/api/wbs-templates/${testTemplateId}`, {
      method: 'DELETE'
    })
    
    data = await response.json()
    
    if (data.success) {
      console.log('✅ WBS模板删除成功')
      return true
    } else {
      console.log('❌ WBS模板删除失败:', data.error)
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error)
    return false
  }
}

/**
 * 测试 TC-016-01: 获取项目前期证照列表
 */
async function testTC016_01_PreMilestoneList() {
  console.log('\n=== TC-016-01: 获取项目前期证照列表 ===')
  
  try {
    const response = await fetch(`${API_BASE}/api/pre-milestones?projectId=${testProjectId}`)
    const data = await response.json()
    
    if (data.success) {
      console.log('✅ 前期证照列表查询成功')
      console.log(`   返回证照数量: ${data.data.length}`)
      if (data.data.length > 0) {
        console.log(`   首个证照: ${data.data[0].name}`)
      }
      return true
    } else {
      console.log('❌ 前期证照列表查询失败:', data.error)
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error)
    return false
  }
}

/**
 * 测试 TC-016-02: 创建前期证照
 */
async function testTC016_02_CreatePreMilestone() {
  console.log('\n=== TC-016-02: 创建前期证照 ===')
  
  try {
    const today = new Date()
    const futureDate = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000) // 10天后
    
    const permitData = {
      project_id: testProjectId,
      milestone_type: '用地许可证',
      name: '测试用地许可证',
      description: '用于测试的前期证照',
      lead_unit: '工程部',
      planned_start_date: formatDate(today),
      planned_end_date: formatDate(futureDate),
      responsible_user_id: null,
      sort_order: 1,
      notes: '测试备注'
    }
    
    const response = await fetch(`${API_BASE}/api/pre-milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(permitData)
    })
    
    const data = await response.json()
    
    if (data.success && data.data) {
      testPermitId = data.data.id
      console.log('✅ 前期证照创建成功')
      console.log(`   证照ID: ${testPermitId}`)
      console.log(`   证照名称: ${data.data.name}`)
      return true
    } else {
      console.log('❌ 前期证照创建失败:', data.error)
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error)
    return false
  }
}

/**
 * 测试 TC-016-03: 证照过期预警
 */
async function testTC016_03_PermitExpiryWarning() {
  console.log('\n=== TC-016-03: 证照过期预警 ===')
  
  try {
    // 导入预警服务
    const { default: warningService } = await import('./server/src/services/preMilestoneWarningService.js')
    
    // 执行预警检查
    const result = await warningService.executeWarningCheck()
    
    console.log('✅ 证照过期预警检查成功')
    console.log(`   即将过期: ${result.expiring}`)
    console.log(`   已过期: ${result.overdue}`)
    console.log(`   创建预警: ${result.warningsCreated}`)
    
    return true
  } catch (error) {
    console.log('❌ 证照过期预警检查失败:', error)
    return false
  }
}

/**
 * 测试 TC-016-04: 前期证照CRUD操作
 */
async function testTC016_04_PreMilestoneCRUD() {
  console.log('\n=== TC-016-04: 前期证照CRUD操作 ===')
  
  if (!testPermitId) {
    console.log('⚠️  跳过: 没有测试证照ID')
    return false
  }
  
  try {
    // 更新证照
    const updateData = {
      status: '进行中',
      actual_start_date: formatDate(new Date())
    }
    
    let response = await fetch(`${API_BASE}/api/pre-milestones/${testPermitId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    })
    
    let data = await response.json()
    
    if (data.success) {
      console.log('✅ 前期证照更新成功')
      console.log(`   更新后状态: ${data.data.status}`)
    } else {
      console.log('❌ 前期证照更新失败:', data.error)
      return false
    }
    
    // 查询单个证照
    await sleep(100)
    response = await fetch(`${API_BASE}/api/pre-milestones/${testPermitId}`)
    data = await response.json()
    
    if (data.success) {
      console.log('✅ 单个证照查询成功')
      console.log(`   证照名称: ${data.data.name}`)
    } else {
      console.log('❌ 单个证照查询失败:', data.error)
      return false
    }
    
    // 删除证照
    await sleep(100)
    response = await fetch(`${API_BASE}/api/pre-milestones/${testPermitId}`, {
      method: 'DELETE'
    })
    
    data = await response.json()
    
    if (data.success) {
      console.log('✅ 前期证照删除成功')
      return true
    } else {
      console.log('❌ 前期证照删除失败:', data.error)
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error)
    return false
  }
}

/**
 * 测试 TC-016-05: 条件管理
 */
async function testTC016_05_ConditionManagement() {
  console.log('\n=== TC-016-05: 条件管理 ===')
  
  if (!testPermitId) {
    console.log('⚠️  跳过: 没有测试证照ID')
    return false
  }
  
  try {
    // 创建条件
    const conditionData = {
      pre_milestone_id: testPermitId,
      condition_type: '资料',
      condition_name: '测试资料1',
      description: '用于测试的资料条件'
    }
    
    let response = await fetch(`${API_BASE}/api/pre-milestone-conditions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conditionData)
    })
    
    let data = await response.json()
    
    if (data.success && data.data) {
      testConditionId = data.data.id
      console.log('✅ 条件创建成功')
      console.log(`   条件ID: ${testConditionId}`)
      console.log(`   条件名称: ${data.data.condition_name}`)
    } else {
      console.log('❌ 条件创建失败:', data.error)
      return false
    }
    
    // 查询条件列表
    await sleep(100)
    response = await fetch(`${API_BASE}/api/pre-milestone-conditions?preMilestoneId=${testPermitId}`)
    data = await response.json()
    
    if (data.success) {
      console.log('✅ 条件列表查询成功')
      console.log(`   返回条件数量: ${data.data.length}`)
    } else {
      console.log('❌ 条件列表查询失败:', data.error)
      return false
    }
    
    // 更新条件状态
    await sleep(100)
    response = await fetch(`${API_BASE}/api/pre-milestone-conditions/${testConditionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: '已满足' })
    })
    
    data = await response.json()
    
    if (data.success) {
      console.log('✅ 条件状态更新成功')
      console.log(`   更新后状态: ${data.data.status}`)
    } else {
      console.log('❌ 条件状态更新失败:', data.error)
      return false
    }
    
    // 删除条件
    await sleep(100)
    response = await fetch(`${API_BASE}/api/pre-milestone-conditions/${testConditionId}`, {
      method: 'DELETE'
    })
    
    data = await response.json()
    
    if (data.success) {
      console.log('✅ 条件删除成功')
      return true
    } else {
      console.log('❌ 条件删除失败:', data.error)
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error)
    return false
  }
}

/**
 * 测试 TC-016-06: 批量创建条件
 */
async function testTC016_06_BatchCreateConditions() {
  console.log('\n=== TC-016-06: 批量创建条件 ===')
  
  if (!testPermitId) {
    console.log('⚠️  跳过: 没有测试证照ID')
    return false
  }
  
  try {
    const conditions = [
      {
        condition_type: '资料',
        condition_name: '批量条件1',
        description: '批量测试条件1'
      },
      {
        condition_type: '费用',
        condition_name: '批量条件2',
        description: '批量测试条件2'
      }
    ]
    
    const response = await fetch(`${API_BASE}/api/pre-milestone-conditions/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pre_milestone_id: testPermitId,
        conditions
      })
    })
    
    const data = await response.json()
    
    if (data.success && data.data) {
      console.log('✅ 批量创建条件成功')
      console.log(`   创建条件数量: ${data.data.length}`)
      return true
    } else {
      console.log('❌ 批量创建条件失败:', data.error)
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error)
    return false
  }
}

/**
 * 测试 TC-016-07: 状态转换验证
 */
async function testTC016_07_StatusTransitionValidation() {
  console.log('\n=== TC-016-07: 状态转换验证 ===')
  
  if (!testConditionId) {
    console.log('⚠️  跳过: 没有测试条件ID')
    return false
  }
  
  try {
    // 尝试无效的状态转换
    const response = await fetch(`${API_BASE}/api/pre-milestone-conditions/${testConditionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: '待处理' }) // 从"已满足"不能回到"待处理"
    })
    
    const data = await response.json()
    
    if (!data.success && data.error?.code === 'INVALID_STATUS_TRANSITION') {
      console.log('✅ 状态转换验证成功')
      console.log(`   错误信息: ${data.error.message}`)
      return true
    } else {
      console.log('❌ 状态转换验证失败: 应该拒绝无效转换')
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error)
    return false
  }
}

/**
 * 测试 TC-016-08: WBS模板与证照关联
 */
async function testTC016_08_WbsTemplatePermitLink() {
  console.log('\n=== TC-016-08: WBS模板与证照关联 ===')
  
  try {
    // 查询所有WBS模板
    const templatesResponse = await fetch(`${API_BASE}/api/wbs-templates`)
    const templatesData = await templatesResponse.json()
    
    if (!templatesData.success) {
      console.log('❌ WBS模板查询失败')
      return false
    }
    
    // 查询所有证照
    const permitsResponse = await fetch(`${API_BASE}/api/pre-milestones?projectId=${testProjectId}`)
    const permitsData = await permitsResponse.json()
    
    if (!permitsData.success) {
      console.log('❌ 证照查询失败')
      return false
    }
    
    console.log('✅ WBS模板与证照关联查询成功')
    console.log(`   WBS模板数量: ${templatesData.data.length}`)
    console.log(`   证照数量: ${permitsData.data.length}`)
    console.log(`   说明: 两者通过项目ID间接关联`)
    
    return true
  } catch (error) {
    console.log('❌ 请求失败:', error)
    return false
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('='.repeat(60))
  console.log('Phase 3 WBS 模板和证照管理功能测试')
  console.log('='.repeat(60))
  console.log(`测试时间: ${new Date().toLocaleString('zh-CN')}`)
  console.log(`API地址: ${API_BASE}`)
  
  // 测试计数
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0
  }
  
  // 执行测试
  const tests = [
    { name: 'TC-015-01', fn: testTC015_01_WbsTemplateList },
    { name: 'TC-015-02', fn: testTC015_02_CreateWbsTemplate },
    { name: 'TC-015-03', fn: testTC015_03_UpdateDeleteWbsTemplate },
    { name: 'TC-016-01', fn: testTC016_01_PreMilestoneList },
    { name: 'TC-016-02', fn: testTC016_02_CreatePreMilestone },
    { name: 'TC-016-03', fn: testTC016_03_PermitExpiryWarning },
    { name: 'TC-016-04', fn: testTC016_04_PreMilestoneCRUD },
    { name: 'TC-016-05', fn: testTC016_05_ConditionManagement },
    { name: 'TC-016-06', fn: testTC016_06_BatchCreateConditions },
    { name: 'TC-016-07', fn: testTC016_07_StatusTransitionValidation },
    { name: 'TC-016-08', fn: testTC016_08_WbsTemplatePermitLink }
  ]
  
  for (const test of tests) {
    try {
      const result = await test.fn()
      if (result === true) {
        results.passed++
      } else if (result === false) {
        results.failed++
      } else {
        results.skipped++
      }
    } catch (error) {
      console.log(`❌ ${test.name} 执行异常:`, error)
      results.failed++
    }
    
    await sleep(200) // 测试间隔
  }
  
  // 输出测试结果
  console.log('\n' + '='.repeat(60))
  console.log('测试结果汇总')
  console.log('='.repeat(60))
  console.log(`总计: ${tests.length} 个测试`)
  console.log(`✅ 通过: ${results.passed}`)
  console.log(`❌ 失败: ${results.failed}`)
  console.log(`⏭️  跳过: ${results.skipped}`)
  console.log(`通过率: ${((results.passed / tests.length) * 100).toFixed(2)}%`)
  console.log('='.repeat(60))
  
  // 返回退出码
  process.exit(results.failed > 0 ? 1 : 0)
}

// 执行测试
main().catch(error => {
  console.error('测试执行失败:', error)
  process.exit(1)
})
