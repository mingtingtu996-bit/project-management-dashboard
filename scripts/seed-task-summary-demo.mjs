import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const projectId = '8d0be02c-1e79-4272-a234-48792b2f32c0'
const marker = '任务总结归属复盘模拟数据'

function loadEnv(file) {
  const text = readFileSync(file, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index < 0) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnv(resolve('server/.env'))

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function must(label, promise) {
  const result = await promise
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data
}

async function getProject() {
  const project = await must(
    '查询项目',
    supabase.from('projects').select('id,name,owner_id').eq('id', projectId).single(),
  )
  if (!project?.owner_id) throw new Error('当前项目没有 owner_id，无法写入演示数据')
  return project
}

async function ensureEngineeringObject(objectType, objectCode, objectName, sortOrder) {
  const existing = await must(
    `查询工程对象 ${objectType}:${objectName}`,
    supabase
      .from('engineering_objects')
      .select('id')
      .eq('project_id', projectId)
      .eq('object_type', objectType)
      .eq('object_code', objectCode)
      .maybeSingle(),
  )
  if (existing) return false

  const id = randomUUID()
  await must(
    `新增工程对象 ${objectType}:${objectName}`,
    supabase.from('engineering_objects').insert({
      id,
      project_id: projectId,
      object_type: objectType,
      object_code: objectCode,
      object_name: objectName,
      parent_id: null,
      path: `/${id}`,
      level: 1,
      sort_order: sortOrder,
      status: 'active',
      source_type: 'demo_seed',
      metadata: { source: 'task-summary-demo', marker },
    }),
  )
  return true
}

async function ensureTask(title, payload, { updateMarked = true } = {}) {
  const existing = await must(
    `查询任务 ${title}`,
    supabase.from('tasks').select('id,description').eq('project_id', projectId).eq('title', title).maybeSingle(),
  )

  if (existing?.id) {
    if (updateMarked && existing.description === marker) {
      await must(`更新任务 ${title}`, supabase.from('tasks').update(payload).eq('id', existing.id))
    }
    return { id: existing.id, existed: true }
  }

  const inserted = await must(
    `新增任务 ${title}`,
    supabase
      .from('tasks')
      .insert({ project_id: projectId, title, description: marker, ...payload })
      .select('id')
      .single(),
  )
  return { id: inserted.id, existed: false }
}

async function ensureCondition(taskId, row) {
  const existing = await must(
    `查询开工条${row.name}`,
    supabase
      .from('task_conditions')
      .select('id')
      .eq('project_id', projectId)
      .eq('task_id', taskId)
      .eq('name', row.name)
      .maybeSingle(),
  )
  if (existing) return false
  await must(`新增开工条${row.name}`, supabase.from('task_conditions').insert({ project_id: projectId, task_id: taskId, ...row }))
  return true
}

async function ensureObstacle(taskId, row) {
  const existing = await must(
    `查询阻碍 ${row.description}`,
    supabase
      .from('task_obstacles')
      .select('id')
      .eq('project_id', projectId)
      .eq('task_id', taskId)
      .eq('description', row.description)
      .maybeSingle(),
  )
  if (existing) return false
  await must(`新增阻碍 ${row.description}`, supabase.from('task_obstacles').insert({ project_id: projectId, task_id: taskId, ...row }))
  return true
}

async function ensureTimeline(taskId, row) {
  const existing = await must(
    `查询时间${row.title}`,
    supabase
      .from('task_timeline_events')
      .select('id')
      .eq('project_id', projectId)
      .eq('task_id', taskId)
      .eq('title', row.title)
      .eq('event_type', row.event_type)
      .maybeSingle(),
  )
  if (existing) return false
  await must(`新增时间${row.title}`, supabase.from('task_timeline_events').insert({ project_id: projectId, task_id: taskId, ...row }))
  return true
}

function iso(date, hour = '09:00:00') {
  return `${date}T${hour}+00:00`
}

function taskBase(ownerId, overrides) {
  return {
    status: 'done',
    progress: 100,
    priority: 'medium',
    is_milestone: false,
    task_type: 'task',
    created_by: ownerId,
    updated_by: ownerId,
    ...overrides,
  }
}

async function seedParentTasks(ownerId) {
  const rootStructure = await ensureTask(
    '主体结构工程',
    taskBase(ownerId, {
      status: 'in_progress',
      progress: 88,
      priority: 'high',
      task_type: 'phase',
      wbs_code: '2',
      wbs_level: 1,
      sort_order: 200,
      specialty_type: '土建',
      start_date: '2026-04-20',
      end_date: '2026-08-13',
      planned_start_date: '2026-04-20',
      planned_end_date: '2026-08-13',
      actual_start_date: '2026-04-22',
      updated_at: iso('2026-05-07'),
      assignee: '王工',
    }),
  )

  const subConcrete = await ensureTask(
    '钢筋混凝土工程',
    taskBase(ownerId, {
      status: 'in_progress',
      progress: 82,
      task_type: 'subtask',
      parent_id: rootStructure.id,
      wbs_code: '2.1',
      wbs_level: 2,
      sort_order: 210,
      specialty_type: '土建',
      start_date: '2026-04-24',
      end_date: '2026-06-20',
      planned_start_date: '2026-04-24',
      planned_end_date: '2026-06-20',
      actual_start_date: '2026-04-24',
      updated_at: iso('2026-05-07'),
      assignee: '王工',
    }),
  )

  const rootMep = await ensureTask(
    '机电安装工程',
    taskBase(ownerId, {
      status: 'in_progress',
      progress: 42,
      task_type: 'phase',
      wbs_code: '3',
      wbs_level: 1,
      sort_order: 300,
      specialty_type: '机电安装',
      start_date: '2026-04-25',
      end_date: '2026-07-30',
      planned_start_date: '2026-04-25',
      planned_end_date: '2026-07-30',
      actual_start_date: '2026-04-26',
      updated_at: iso('2026-05-07'),
      assignee: '赵工',
    }),
  )

  const subEmbed = await ensureTask(
    '预留预埋工程',
    taskBase(ownerId, {
      status: 'in_progress',
      progress: 55,
      task_type: 'subtask',
      parent_id: rootMep.id,
      wbs_code: '3.1',
      wbs_level: 2,
      sort_order: 310,
      specialty_type: '机电安装',
      start_date: '2026-04-26',
      end_date: '2026-06-12',
      planned_start_date: '2026-04-26',
      planned_end_date: '2026-06-12',
      actual_start_date: '2026-04-26',
      updated_at: iso('2026-05-07'),
      assignee: '赵工',
    }),
  )

  const rootFinish = await ensureTask(
    '装饰装修工程',
    taskBase(ownerId, {
      status: 'in_progress',
      progress: 25,
      task_type: 'phase',
      wbs_code: '4',
      wbs_level: 1,
      sort_order: 400,
      specialty_type: '装饰装修',
      start_date: '2026-04-10',
      end_date: '2026-09-20',
      planned_start_date: '2026-04-10',
      planned_end_date: '2026-09-20',
      actual_start_date: '2026-04-12',
      updated_at: iso('2026-05-07'),
      assignee: '周工',
    }),
  )

  const subSample = await ensureTask(
    '样板确认工程',
    taskBase(ownerId, {
      status: 'in_progress',
      progress: 35,
      task_type: 'subtask',
      parent_id: rootFinish.id,
      wbs_code: '4.1',
      wbs_level: 2,
      sort_order: 410,
      specialty_type: '装饰装修',
      start_date: '2026-04-10',
      end_date: '2026-05-15',
      planned_start_date: '2026-04-10',
      planned_end_date: '2026-05-15',
      actual_start_date: '2026-04-12',
      updated_at: iso('2026-05-07'),
      assignee: '周工',
    }),
  )

  return {
    rootStructure,
    subConcrete,
    rootMep,
    subEmbed,
    rootFinish,
    subSample,
  }
}

function buildWorkItems(parents, milestones) {
  const milestoneByTitle = new Map((milestones || []).map((row) => [row.title, row.id]))
  const mainMilestoneId = milestoneByTitle.get('主体结构封顶') || milestones?.[0]?.id
  const permitMilestoneId = milestoneByTitle.get('施工许可证取得') || milestones?.[0]?.id

  return [
    {
      title: '1#楼东区一层梁板钢筋绑扎',
      parentId: parents.subConcrete.id,
      wbs: '2.1.1',
      sort: 211,
      specialty: '土建',
      assignee: '李工',
      unit: '主体劳务一队',
      start: '2026-04-25',
      end: '2026-05-03',
      actualStart: '2026-04-25',
      completed: '2026-05-03',
      delay: 0,
      milestoneId: mainMilestoneId,
      conditions: [{ condition_type: '材料', name: '钢筋复验报告到位', date: '2026-04-25', unit: '华东建材检测中心', person: '沈工' }],
      timeline: [
        ['condition', '钢筋复验报告到位', '钢筋原材复验合格，材料证明和复验报告完成归档，班组具备绑扎作业条件', '开工条件满足', '2026-04-25'],
        ['task', '一层梁板钢筋绑扎开始', '作业面完成移交后，东区梁板钢筋班组进场，按轴线分段展开绑扎。', '施工推进', '2026-04-26'],
        ['task', '隐蔽验收通过', '钢筋规格、间距、保护层垫块完成自检和监理复核，满足下道模板安装条件', '验收通过', '2026-05-02'],
      ],
    },
    {
      title: '1#楼东区一层梁板模板安装',
      parentId: parents.subConcrete.id,
      wbs: '2.1.2',
      sort: 212,
      specialty: '土建',
      assignee: '李工',
      unit: '主体劳务一队',
      start: '2026-04-26',
      end: '2026-05-04',
      actualStart: '2026-04-27',
      completed: '2026-05-06',
      delay: 2,
      milestoneId: mainMilestoneId,
      conditions: [{ condition_type: '材料', name: '模板周转材料进场复核', date: '2026-04-28', unit: '周转材料供应商', person: '周经理' }],
      obstacle: {
        obstacle_type: '材料',
        description: '模板周转材料分批到场影响东区梁板模板安装',
        severity: '中',
        status: '已解决',
        resolution: '调整周转顺序，先完成东区主梁模板，材料到场后补齐次梁和板面。',
        resolved: '2026-05-03',
      },
      timeline: [
        ['condition', '模板周转材料进场复核', '首批模板、方木和支撑体系完成进场验收，剩余材料按分批计划补充', '条件部分形成', '2026-04-28'],
        ['obstacle', '模板周转材料分批到场', '材料到场节奏慢于计划，现场调整支模顺序，优先保障主梁模板安装', '处理中', '2026-04-29'],
        ['obstacle', '周转方案完成调整', '材料供应恢复后，现场补齐次梁和板面模板，阻碍解除', '已解决', '2026-05-03'],
      ],
    },
    {
      title: '1#楼西区首层柱墙混凝土浇筑',
      parentId: parents.subConcrete.id,
      wbs: '2.1.3',
      sort: 213,
      specialty: '土建',
      assignee: '孙工',
      unit: '商品混凝土协作队',
      start: '2026-05-01',
      end: '2026-05-06',
      actualStart: '2026-05-01',
      completed: '2026-05-06',
      delay: 0,
      milestoneId: mainMilestoneId,
      conditions: [{ condition_type: '材料', name: '商砼配合比确认', date: '2026-04-30', unit: '商砼供应站', person: '蒋经理' }],
      obstacle: {
        obstacle_type: '其他',
        description: '夜间浇筑窗口与运输组织需协调',
        severity: '低',
        status: '已解决',
        resolution: '完成夜间施工报备并调整车辆进出场路线。',
        resolved: '2026-05-01',
      },
      timeline: [
        ['condition', '商砼配合比确认', '商砼配合比、坍落度控制要求和浇筑令完成确认。', '开工条件满足', '2026-04-30'],
        ['obstacle', '夜间浇筑组织协调', '夜间浇筑窗口与运输路线完成协调，现场具备连续浇筑条件', '已解决', '2026-05-01'],
        ['task', '柱墙混凝土浇筑完成', '首层柱墙完成连续浇筑，养护和测温记录已归档。', '完成收口', '2026-05-06'],
      ],
    },
    {
      title: '地下室东区消防套管预埋复核',
      parentId: parents.subEmbed.id,
      wbs: '3.1.1',
      sort: 311,
      specialty: '机电安装',
      assignee: '赵工',
      unit: '上海机电安装二队',
      start: '2026-04-28',
      end: '2026-05-02',
      actualStart: '2026-04-28',
      completed: '2026-05-02',
      delay: 0,
      milestoneId: mainMilestoneId,
      conditions: [{ condition_type: '图纸', name: '消防套管定位图确认', date: '2026-04-27', unit: '机电深化组', person: '赵工' }],
      timeline: [
        ['condition', '消防套管定位图确认', '消防套管定位图与结构留洞图完成碰撞复核，定位尺寸明确。', '开工条件满足', '2026-04-27'],
        ['task', '套管预埋复核完成', '地下室东区消防套管完成安装复核，偏位项已在浇筑前闭合', '完成收口', '2026-05-02'],
      ],
    },
    {
      title: '地下室西区强电桥架预留复核',
      parentId: parents.subEmbed.id,
      wbs: '3.1.2',
      sort: 312,
      specialty: '机电安装',
      assignee: '赵工',
      unit: '上海机电安装二队',
      start: '2026-04-29',
      end: '2026-05-04',
      actualStart: '2026-04-30',
      completed: '2026-05-07',
      delay: 3,
      milestoneId: mainMilestoneId,
      conditions: [{ condition_type: '图纸', name: '强电桥架综合排布确认', date: '2026-04-30', unit: '机电深化组', person: '赵工' }],
      obstacle: {
        obstacle_type: '设计',
        description: '强电桥架与梁底标高冲突需二次复核',
        severity: '高',
        status: '已解决',
        resolution: '深化图调整桥架局部标高，结构预留洞口同步复核完成。',
        resolved: '2026-05-06',
      },
      timeline: [
        ['condition', '强电桥架综合排布确认', '机电深化图完成复核，但局部桥架标高需结合梁底净高再次确认', '条件待完善', '2026-04-30'],
        ['obstacle', '桥架标高冲突复核', '强电桥架与梁底标高存在冲突，机电和结构专业联合复核调整', '处理中', '2026-05-03'],
        ['obstacle', '桥架标高调整闭合', '深化图调整完成，结构预留洞口复核无误，阻碍解除', '已解决', '2026-05-06'],
      ],
    },
    {
      title: '2#楼公共区域墙面样板确认',
      parentId: parents.subSample.id,
      wbs: '4.1.1',
      sort: 411,
      specialty: '装饰装修',
      assignee: '周工',
      unit: '精装样板施工班组',
      start: '2026-04-12',
      end: '2026-04-18',
      actualStart: '2026-04-12',
      completed: '2026-04-18',
      delay: 0,
      milestoneId: permitMilestoneId,
      conditions: [{ condition_type: '材料', name: '墙面样板材料封样', date: '2026-04-11', unit: '精装材料供应商', person: '刘经理' }],
      timeline: [
        ['condition', '墙面样板材料封样', '墙面涂料、基层腻子和收边样品完成封样，满足样板施工要求', '开工条件满足', '2026-04-11'],
        ['task', '墙面样板确认完成', '公共区域墙面样板通过建设单位和监理确认，形成后续大面施工做法', '完成收口', '2026-04-18'],
      ],
    },
    {
      title: '2#楼西区门窗洞口尺寸复核',
      parentId: parents.subSample.id,
      wbs: '4.1.2',
      sort: 412,
      specialty: '幕墙工程',
      assignee: '周工',
      unit: '门窗幕墙专业分包',
      start: '2026-04-15',
      end: '2026-04-22',
      actualStart: '2026-04-16',
      completed: '2026-04-25',
      delay: 3,
      milestoneId: permitMilestoneId,
      conditions: [{ condition_type: '其他', name: '洞口实测数据提交', date: '2026-04-16', unit: '门窗幕墙专业分包', person: '黄工' }],
      obstacle: {
        obstacle_type: '其他',
        description: '部分洞口实测尺寸与深化图不一致',
        severity: '中',
        status: '已解决',
        resolution: '现场复尺后完成深化图修订，样板洞口按修订尺寸复核通过。',
        resolved: '2026-04-24',
      },
      timeline: [
        ['condition', '洞口实测数据提交', '西区门窗洞口完成首轮实测，实测数据提交深化设计复核', '开工条件形成', '2026-04-16'],
        ['obstacle', '洞口尺寸偏差复核', '部分洞口尺寸与深化图存在偏差，需现场复尺并调整加工尺寸', '处理中', '2026-04-20'],
        ['obstacle', '洞口尺寸偏差闭合', '复尺结果完成确认，深化图同步修订，阻碍解除', '已解决', '2026-04-24'],
      ],
    },
  ]
}

async function seedWorkItem(item, ownerId) {
  let inserted = 0
  let reused = 0
  const task = await ensureTask(
    item.title,
    taskBase(ownerId, {
      parent_id: item.parentId,
      wbs_code: item.wbs,
      wbs_level: 3,
      sort_order: item.sort,
      specialty_type: item.specialty,
      start_date: item.start,
      end_date: item.end,
      planned_start_date: item.start,
      planned_end_date: item.end,
      actual_start_date: item.actualStart,
      actual_end_date: item.completed,
      updated_at: iso(item.completed),
      assignee: item.assignee,
      milestone_id: item.milestoneId ?? null,
      priority: item.delay > 0 ? 'high' : 'medium',
    }),
  )
  task.existed ? reused += 1 : inserted += 1

  for (const condition of item.conditions) {
    const added = await ensureCondition(task.id, {
      condition_type: condition.condition_type,
      name: condition.name,
      description: `${condition.name}已完成确认，满足任务开工要求。`,
      is_satisfied: true,
      satisfied_at: iso(condition.date),
      target_date: condition.date,
      responsible_person: condition.person,
      attachments: [],
      confirmed_by: ownerId,
      confirmed_at: iso(condition.date),
      created_by: ownerId,
      created_at: iso(condition.date, '08:30:00'),
      updated_at: iso(condition.date, '09:00:00'),
      satisfied_reason: '现场复核通过',
      satisfied_reason_note: marker,
      status: '已确认',
    })
    added ? inserted += 1 : reused += 1
  }

  if (item.obstacle) {
    const added = await ensureObstacle(task.id, {
      obstacle_type: item.obstacle.obstacle_type,
      description: item.obstacle.description,
      severity: item.obstacle.severity,
      status: item.obstacle.status,
      resolution: item.obstacle.resolution,
      resolved_by: ownerId,
      resolved_at: iso(item.obstacle.resolved),
      created_by: ownerId,
      created_at: iso(item.start, '10:00:00'),
      updated_at: iso(item.obstacle.resolved),
      estimated_resolve_date: item.obstacle.resolved,
      attachments: [],
      notes: marker,
    })
    added ? inserted += 1 : reused += 1
  }

  for (const event of item.timeline) {
    const [eventType, title, description, statusLabel, date] = event
    const added = await ensureTimeline(task.id, {
      event_type: eventType,
      title,
      description,
      status_label: statusLabel,
      metadata: { source: 'task-summary-demo', marker, wbs: item.wbs, specialty: item.specialty },
      occurred_at: iso(date),
      created_by: ownerId,
      created_at: iso(date, '09:05:00'),
    })
    added ? inserted += 1 : reused += 1
  }

  const closeoutAdded = await ensureTimeline(task.id, {
    event_type: 'task',
    title: `${item.title}完成收口`,
    description: item.delay > 0 ? '任务已完成并纳入延期完成台账，延期原因和处理结果已归档' : '任务按计划完成，现场验收和资料归档同步闭合。',
    status_label: item.delay > 0 ? `延期 ${item.delay} 天完成` : '按时完成',
    metadata: { source: 'task-summary-demo', marker, completed: true, delay_days: item.delay },
    occurred_at: iso(item.completed),
    created_by: ownerId,
    created_at: iso(item.completed, '09:10:00'),
  })
  closeoutAdded ? inserted += 1 : reused += 1

  return { inserted, reused }
}

async function main() {
  const project = await getProject()
  const ownerId = project.owner_id
  let inserted = 0
  let reused = 0

  const engineeringObjects = [
    ['building', 'BD-DEMO-001', '1#楼', 11],
    ['building', 'BD-DEMO-002', '2#楼', 12],
    ['physical_zone', 'PZ-DEMO-001', '东区', 21],
    ['physical_zone', 'PZ-DEMO-002', '西区', 22],
  ]

  for (const [objectType, objectCode, objectName, sortOrder] of engineeringObjects) {
    const added = await ensureEngineeringObject(objectType, objectCode, objectName, sortOrder)
    added ? inserted += 1 : reused += 1
  }

  const parents = await seedParentTasks(ownerId)
  for (const parent of Object.values(parents)) {
    parent.existed ? reused += 1 : inserted += 1
  }

  const milestones = await must(
    '查询里程碑任务',
    supabase.from('tasks').select('id,title').eq('project_id', projectId).eq('is_milestone', true),
  )
  const workItems = buildWorkItems(parents, milestones)

  for (const item of workItems) {
    const result = await seedWorkItem(item, ownerId)
    inserted += result.inserted
    reused += result.reused
  }

  const markedTasks = await must(
    '统计任务总结模拟任务',
    supabase
      .from('tasks')
      .select('id,title,status,progress,end_date,updated_at,specialty_type,parent_id,wbs_code,wbs_level')
      .eq('project_id', projectId)
      .eq('description', marker)
      .order('wbs_code', { ascending: true }),
  )

  const demoEvents = await must(
    '统计任务总结模拟时间线',
    supabase
      .from('task_timeline_events')
      .select('id')
      .eq('project_id', projectId)
      .contains('metadata', { source: 'task-summary-demo' }),
  )

  console.log(JSON.stringify({
    project: { id: project.id, name: project.name },
    inserted,
    reused,
    markedTaskCount: markedTasks.length,
    demoTimelineCount: demoEvents.length,
    markedTasks: markedTasks.map((row) => ({
      title: row.title,
      status: row.status,
      progress: row.progress,
      plannedEnd: row.end_date,
      completedAt: row.updated_at?.slice(0, 10),
      specialty: row.specialty_type,
      wbs: row.wbs_code,
      level: row.wbs_level,
    })),
  }, null, 2))
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
