const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const templates = [
  {
    name: '住宅标准WBS模板',
    type: '住宅',
    desc: '适用于普通住宅项目的标准WBS任务分解模板，包含从前期准备到竣工验收的完整流程',
    nodes: [
      { id: '1', name: '前期准备', level: 1, duration: 30, children: [
        { id: '1-1', name: '可行性研究', level: 2, duration: 15 },
        { id: '1-2', name: '立项审批', level: 2, duration: 10 },
        { id: '1-3', name: '规划许可证办理', level: 2, duration: 20 }
      ]},
      { id: '2', name: '勘察设计', level: 1, duration: 90, children: [
        { id: '2-1', name: '地质勘察', level: 2, duration: 20 },
        { id: '2-2', name: '方案设计', level: 2, duration: 30 },
        { id: '2-3', name: '施工图设计', level: 2, duration: 45 }
      ]},
      { id: '3', name: '施工准备', level: 1, duration: 30, children: [
        { id: '3-1', name: '施工图审查', level: 2, duration: 15 },
        { id: '3-2', name: '招标采购', level: 2, duration: 20 },
        { id: '3-3', name: '施工许可证', level: 2, duration: 10 }
      ]},
      { id: '4', name: '地基与基础', level: 1, duration: 60, children: [
        { id: '4-1', name: '土方开挖', level: 2, duration: 15 },
        { id: '4-2', name: '基础施工', level: 2, duration: 30 },
        { id: '4-3', name: '地下室施工', level: 2, duration: 20 }
      ]},
      { id: '5', name: '主体结构', level: 1, duration: 120, children: [
        { id: '5-1', name: '钢筋工程', level: 2, duration: 60 },
        { id: '5-2', name: '模板工程', level: 2, duration: 60 },
        { id: '5-3', name: '混凝土浇筑', level: 2, duration: 45 }
      ]},
      { id: '6', name: '二次结构与装修', level: 1, duration: 90, children: [
        { id: '6-1', name: '砌体工程', level: 2, duration: 30 },
        { id: '6-2', name: '抹灰工程', level: 2, duration: 25 },
        { id: '6-3', name: '门窗安装', level: 2, duration: 15 },
        { id: '6-4', name: '涂料工程', level: 2, duration: 20 }
      ]},
      { id: '7', name: '机电安装', level: 1, duration: 60, children: [
        { id: '7-1', name: '给排水安装', level: 2, duration: 30 },
        { id: '7-2', name: '强弱电安装', level: 2, duration: 30 },
        { id: '7-3', name: '暖通安装', level: 2, duration: 20 }
      ]},
      { id: '8', name: '竣工验收', level: 1, duration: 30, children: [
        { id: '8-1', name: '分项工程验收', level: 2, duration: 15 },
        { id: '8-2', name: '竣工验收申请', level: 2, duration: 5 },
        { id: '8-3', name: '竣工备案', level: 2, duration: 10 }
      ]}
    ]
  },
  {
    name: '商业综合体WBS模板',
    type: '商业',
    desc: '适用于商业综合体、写字楼、购物中心等商业项目的WBS任务分解模板',
    nodes: [
      { id: '1', name: '项目策划', level: 1, duration: 45, children: [
        { id: '1-1', name: '市场调研', level: 2, duration: 20 },
        { id: '1-2', name: '业态规划', level: 2, duration: 15 },
        { id: '1-3', name: '投资分析', level: 2, duration: 15 }
      ]},
      { id: '2', name: '前期手续', level: 1, duration: 60, children: [
        { id: '2-1', name: '土地获取', level: 2, duration: 30 },
        { id: '2-2', name: '规划审批', level: 2, duration: 20 },
        { id: '2-3', name: '建设工程许可', level: 2, duration: 15 }
      ]},
      { id: '3', name: '设计阶段', level: 1, duration: 120, children: [
        { id: '3-1', name: '概念设计', level: 2, duration: 30 },
        { id: '3-2', name: '方案深化', level: 2, duration: 45 },
        { id: '3-3', name: '施工图出图', level: 2, duration: 60 }
      ]},
      { id: '4', name: '施工阶段', level: 1, duration: 540, children: [
        { id: '4-1', name: '基坑工程', level: 2, duration: 60 },
        { id: '4-2', name: '地下结构', level: 2, duration: 90 },
        { id: '4-3', name: '地上主体结构', level: 2, duration: 180 },
        { id: '4-4', name: '幕墙工程', level: 2, duration: 90 },
        { id: '4-5', name: '机电安装', level: 2, duration: 120 },
        { id: '4-6', name: '精装修工程', level: 2, duration: 120 }
      ]},
      { id: '5', name: '招商运营准备', level: 1, duration: 90, children: [
        { id: '5-1', name: '招商策划', level: 2, duration: 30 },
        { id: '5-2', name: '主力店签约', level: 2, duration: 45 },
        { id: '5-3', name: '开业筹备', level: 2, duration: 30 }
      ]},
      { id: '6', name: '竣工交付', level: 1, duration: 30, children: [
        { id: '6-1', name: '竣工验收', level: 2, duration: 15 },
        { id: '6-2', name: '消防验收', level: 2, duration: 10 },
        { id: '6-3', name: '产权登记', level: 2, duration: 10 }
      ]}
    ]
  },
  {
    name: '工业厂房WBS模板',
    type: '工业',
    desc: '适用于工业厂房、仓储物流等工业项目的WBS任务分解模板',
    nodes: [
      { id: '1', name: '前期工作', level: 1, duration: 30, children: [
        { id: '1-1', name: '工艺方案确定', level: 2, duration: 15 },
        { id: '1-2', name: '环评报告', level: 2, duration: 20 },
        { id: '1-3', name: '用地许可', level: 2, duration: 15 }
      ]},
      { id: '2', name: '设计工作', level: 1, duration: 60, children: [
        { id: '2-1', name: '工艺设计', level: 2, duration: 30 },
        { id: '2-2', name: '建筑结构设计', level: 2, duration: 35 },
        { id: '2-3', name: '设备基础设计', level: 2, duration: 20 }
      ]},
      { id: '3', name: '主体施工', level: 1, duration: 180, children: [
        { id: '3-1', name: '地基处理', level: 2, duration: 30 },
        { id: '3-2', name: '钢结构安装', level: 2, duration: 60 },
        { id: '3-3', name: '围护系统', level: 2, duration: 30 },
        { id: '3-4', name: '地坪工程', level: 2, duration: 20 }
      ]},
      { id: '4', name: '设备安装', level: 1, duration: 90, children: [
        { id: '4-1', name: '工艺设备安装', level: 2, duration: 45 },
        { id: '4-2', name: '管道安装', level: 2, duration: 30 },
        { id: '4-3', name: '电气安装', level: 2, duration: 25 }
      ]},
      { id: '5', name: '调试验收', level: 1, duration: 30, children: [
        { id: '5-1', name: '单机调试', level: 2, duration: 15 },
        { id: '5-2', name: '联动调试', level: 2, duration: 10 },
        { id: '5-3', name: '试生产验收', level: 2, duration: 10 }
      ]}
    ]
  }
];

(async () => {
  console.log('=== Step 1: 检查现有模板 ===');
  const { data: before, error: beforeErr } = await supabase
    .from('wbs_templates')
    .select('id, template_name, template_type, is_default, deleted_at')
    .in('template_name', ['住宅标准WBS模板', '商业综合体WBS模板', '工业厂房WBS模板']);
  
  if (beforeErr) {
    console.log('查询现有模板出错:', beforeErr.message);
  } else {
    console.log('现有模板:', JSON.stringify(before, null, 2));
  }

  console.log('\n=== Step 2: 删除旧记录 ===');
  const { error: deleteErr } = await supabase
    .from('wbs_templates')
    .delete()
    .in('template_name', ['住宅标准WBS模板', '商业综合体WBS模板', '工业厂房WBS模板']);
  
  if (deleteErr) {
    console.log('删除旧记录出错:', deleteErr.message);
  } else {
    console.log('删除成功');
  }

  console.log('\n=== Step 3: 插入新模板 ===');
  for (const t of templates) {
    const { data, error } = await supabase
      .from('wbs_templates')
      .insert({
        template_name: t.name,
        template_type: t.type,
        description: t.desc,
        wbs_nodes: t.nodes,
        is_default: true,
        created_by: null
      })
      .select('id, template_name, template_type, is_default')
      .single();
    
    if (error) {
      console.log('插入失败 [' + t.name + ']:', error.message);
    } else {
      console.log('插入成功 [' + data.template_name + '] id=' + data.id);
    }
  }

  console.log('\n=== Step 4: 验证结果 ===');
  const { data: after, error: afterErr } = await supabase
    .from('wbs_templates')
    .select('id, template_name, template_type, is_default, deleted_at')
    .in('template_name', ['住宅标准WBS模板', '商业综合体WBS模板', '工业厂房WBS模板'])
    .is('deleted_at', null);
  
  if (afterErr) {
    console.log('验证查询出错:', afterErr.message);
  } else {
    console.log('当前模板共', after.length, '条:');
    after.forEach(t => console.log(' -', t.template_name, '(' + t.template_type + ') is_default=' + t.is_default));
  }
})();
