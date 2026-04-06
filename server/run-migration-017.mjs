/**
 * 执行迁移 017: 创建 standard_processes 表并插入种子数据
 * 运行方式: node run-migration-017.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import 'dotenv/config'

const __dirname = dirname(fileURLToPath(import.meta.url))

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log('🚀 开始执行迁移 017 - standard_processes 表')

  // Step 1: 检查表是否已存在
  const { error: checkError } = await supabase
    .from('standard_processes')
    .select('id')
    .limit(1)

  if (!checkError) {
    console.log('ℹ️  standard_processes 表已存在，跳过建表，直接检查数据...')
    const { count } = await supabase
      .from('standard_processes')
      .select('*', { count: 'exact', head: true })
    console.log(`   当前数据行数: ${count}`)
    if (count > 0) {
      console.log('✅ 种子数据已存在，迁移已完成，无需重复执行')
      return
    }
  } else {
    console.log('📋 表不存在，需通过 Supabase Dashboard SQL Editor 建表')
    console.log('')
    console.log('请在 Supabase Dashboard → SQL Editor 中执行以下 SQL:')
    console.log('─'.repeat(60))
    const sql = readFileSync(join(__dirname, 'migrations/017_add_standard_processes.sql'), 'utf-8')
    console.log(sql)
    console.log('─'.repeat(60))
    return
  }

  // Step 2: 插入种子数据（如果表存在但数据为空）
  console.log('📝 插入种子数据...')
  const seeds = [
    { name: '场地平整',    category: 'civil',     phase: 'preparation', reference_days: 5,  description: '建设场地的清理与平整工作',        tags: ['土方','基础准备'], sort_order: 10 },
    { name: '基坑开挖',    category: 'civil',     phase: 'foundation',  reference_days: 15, description: '按设计深度开挖基坑',              tags: ['土方','地基'], sort_order: 20 },
    { name: '基坑支护',    category: 'civil',     phase: 'foundation',  reference_days: 20, description: '基坑围护结构施工',                tags: ['支护','安全'], sort_order: 30 },
    { name: '地基处理',    category: 'civil',     phase: 'foundation',  reference_days: 10, description: '软弱地基的加固处理',              tags: ['地基','加固'], sort_order: 40 },
    { name: '桩基施工',    category: 'civil',     phase: 'foundation',  reference_days: 25, description: '钻孔灌注桩或预制桩施工',          tags: ['桩基','地基'], sort_order: 50 },
    { name: '基础垫层',    category: 'civil',     phase: 'foundation',  reference_days: 3,  description: '混凝土垫层浇筑',                  tags: ['混凝土','基础'], sort_order: 60 },
    { name: '基础施工',    category: 'structure', phase: 'foundation',  reference_days: 20, description: '独立基础或条形基础施工',           tags: ['混凝土','基础'], sort_order: 70 },
    { name: '地下室底板',  category: 'structure', phase: 'foundation',  reference_days: 15, description: '地下室底板钢筋绑扎及混凝土浇筑',   tags: ['混凝土','防水'], sort_order: 80 },
    { name: '地下室外墙',  category: 'structure', phase: 'foundation',  reference_days: 20, description: '地下室外墙施工',                  tags: ['混凝土','防水'], sort_order: 90 },
    { name: '地下室顶板',  category: 'structure', phase: 'foundation',  reference_days: 15, description: '地下室顶板施工',                  tags: ['混凝土'], sort_order: 100 },
    { name: '一层结构施工',  category: 'structure', phase: 'structure', reference_days: 14, description: '首层钢筋绑扎、模板、混凝土浇筑',   tags: ['主体','混凝土'], sort_order: 110 },
    { name: '标准层结构施工',category: 'structure', phase: 'structure', reference_days: 10, description: '标准层流水施工',                  tags: ['主体','混凝土'], sort_order: 120 },
    { name: '楼板施工',    category: 'structure', phase: 'structure',   reference_days: 8,  description: '楼板钢筋绑扎及混凝土浇筑',        tags: ['主体','楼板'], sort_order: 130 },
    { name: '楼梯施工',    category: 'structure', phase: 'structure',   reference_days: 5,  description: '现浇楼梯施工',                    tags: ['主体','楼梯'], sort_order: 140 },
    { name: '屋面结构',    category: 'structure', phase: 'structure',   reference_days: 7,  description: '屋面板施工',                      tags: ['主体','屋面'], sort_order: 150 },
    { name: '外墙砌筑',    category: 'fitout',    phase: 'enclosure',   reference_days: 15, description: '外围护墙体砌筑',                  tags: ['砌体','外墙'], sort_order: 160 },
    { name: '内墙砌筑',    category: 'fitout',    phase: 'enclosure',   reference_days: 20, description: '内隔墙砌筑',                      tags: ['砌体','内墙'], sort_order: 170 },
    { name: '外墙保温',    category: 'fitout',    phase: 'enclosure',   reference_days: 15, description: '外墙保温系统施工',                tags: ['保温','节能'], sort_order: 180 },
    { name: '外墙涂料',    category: 'fitout',    phase: 'enclosure',   reference_days: 10, description: '外立面涂料施工',                  tags: ['外立面','涂料'], sort_order: 190 },
    { name: '屋面防水',    category: 'fitout',    phase: 'enclosure',   reference_days: 8,  description: '屋面防水层施工',                  tags: ['防水','屋面'], sort_order: 200 },
    { name: '外窗安装',    category: 'fitout',    phase: 'enclosure',   reference_days: 10, description: '铝合金门窗安装',                  tags: ['门窗','外立面'], sort_order: 210 },
    { name: '给排水管道',  category: 'mep',       phase: 'mep',         reference_days: 20, description: '给排水主管道及支管安装',           tags: ['水电','给排水'], sort_order: 220 },
    { name: '强电线管',    category: 'mep',       phase: 'mep',         reference_days: 15, description: '电气线管预埋及桥架安装',           tags: ['水电','强电'], sort_order: 230 },
    { name: '弱电线管',    category: 'mep',       phase: 'mep',         reference_days: 12, description: '弱电系统管线安装',                tags: ['水电','弱电'], sort_order: 240 },
    { name: '通风空调',    category: 'mep',       phase: 'mep',         reference_days: 25, description: '通风空调系统安装',                tags: ['机电','空调'], sort_order: 250 },
    { name: '消防系统',    category: 'mep',       phase: 'mep',         reference_days: 20, description: '消防管道及喷淋系统安装',           tags: ['机电','消防'], sort_order: 260 },
    { name: '电梯安装',    category: 'mep',       phase: 'mep',         reference_days: 30, description: '电梯设备安装及调试',              tags: ['机电','电梯'], sort_order: 270 },
    { name: '地面找平',    category: 'fitout',    phase: 'fitout',      reference_days: 5,  description: '地面找平层施工',                  tags: ['装修','地面'], sort_order: 280 },
    { name: '内墙抹灰',    category: 'fitout',    phase: 'fitout',      reference_days: 10, description: '内墙抹灰找平',                    tags: ['装修','抹灰'], sort_order: 290 },
    { name: '内墙涂料',    category: 'fitout',    phase: 'fitout',      reference_days: 8,  description: '内墙乳胶漆施工',                  tags: ['装修','涂料'], sort_order: 300 },
    { name: '地砖铺贴',    category: 'fitout',    phase: 'fitout',      reference_days: 10, description: '地砖或木地板铺设',                tags: ['装修','地面'], sort_order: 310 },
    { name: '吊顶施工',    category: 'fitout',    phase: 'fitout',      reference_days: 8,  description: '轻钢龙骨吊顶施工',                tags: ['装修','吊顶'], sort_order: 320 },
    { name: '卫生洁具安装',category: 'fitout',    phase: 'fitout',      reference_days: 5,  description: '卫浴设备安装调试',                tags: ['装修','洁具'], sort_order: 330 },
    { name: '门窗套安装',  category: 'fitout',    phase: 'fitout',      reference_days: 7,  description: '内门及门套安装',                  tags: ['装修','门窗'], sort_order: 340 },
    { name: '竣工清理',    category: 'general',   phase: 'completion',  reference_days: 5,  description: '施工垃圾清运及场地清洁',          tags: ['竣工','清理'], sort_order: 350 },
    { name: '竣工验收',    category: 'general',   phase: 'completion',  reference_days: 7,  description: '组织竣工验收手续',                tags: ['竣工','验收'], sort_order: 360 },
    { name: '质量检测',    category: 'general',   phase: 'completion',  reference_days: 5,  description: '各分部分项工程质量检测',           tags: ['质量','检测'], sort_order: 370 },
    { name: '档案整理',    category: 'general',   phase: 'completion',  reference_days: 3,  description: '工程资料整理归档',                tags: ['竣工','档案'], sort_order: 380 },
  ]

  const { data, error } = await supabase
    .from('standard_processes')
    .insert(seeds)
    .select('id')

  if (error) {
    console.error('❌ 插入种子数据失败:', error.message)
  } else {
    console.log(`✅ 成功插入 ${data.length} 条种子数据`)
  }
}

run().catch(console.error)
