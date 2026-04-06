# 测试数据导入指南

## 📦 测试数据说明

本目录包含 3 个完整的测试项目数据:

| 项目文件 | 项目名称 | 健康度 | 项目状态 | 说明 |
|---------|---------|-------|---------|------|
| `project1-healthy.json` | 智慧城市管理系统 | 🟢 健康 (85+) | 进展顺利 | 用于展示健康项目的状态 |
| `project2-warning.json` | 企业级电商平台 | 🟡 警告 (60-85) | 需关注 | 存在中等风险,部分延迟 |
| `project3-critical.json` | AI医疗诊断系统 | 🔴 危险 (<60) | 严重风险 | 多个高风险问题,严重延迟 |

## 🎯 项目特征

### 项目1: 智慧城市管理系统 (健康)
- **任务完成率**: 70% (7/10)
- **已完成里程碑**: 3/6
- **风险数量**: 2个 (已缓解)
- **特点**: 项目进展顺利,风险得到有效控制

### 项目2: 企业级电商平台 (警告)
- **任务完成率**: 56% (5/9)
- **已完成里程碑**: 1/5
- **风险数量**: 3个 (1个高,2个中)
- **特点**: 有延迟风险,需要关注高并发问题

### 项目3: AI医疗诊断系统 (危险)
- **任务完成率**: 40% (4/10)
- **已完成里程碑**: 1/6
- **风险数量**: 5个 (2个严重,2个高,1个中)
- **特点**: 多个严重风险,进度严重滞后

---

## 📥 导入方法

### 方法1: 通过浏览器控制台导入 (推荐)

1. **打开应用** - 在浏览器中打开应用
2. **打开开发者工具** - 按 `F12` 或右键选择"检查"
3. **切换到 Console 标签**
4. **复制并粘贴以下代码**:

```javascript
// 导入测试数据的通用函数
async function importTestData(projectFile) {
  try {
    const response = await fetch(`/test-data/${projectFile}`);
    const data = await response.json();
    
    // 导入项目
    const projects = JSON.parse(localStorage.getItem('pm_projects') || '[]');
    const existingProject = projects.find(p => p.id === data.project.id);
    
    if (existingProject) {
      if (confirm(`项目 "${data.project.name}" 已存在,是否覆盖?`)) {
        // 删除旧项目的相关数据
        const filteredProjects = projects.filter(p => p.id !== data.project.id);
        localStorage.setItem('pm_projects', JSON.stringify(filteredProjects));
        
        const tasks = JSON.parse(localStorage.getItem('pm_tasks') || '[]');
        localStorage.setItem('pm_tasks', JSON.stringify(tasks.filter(t => t.project_id !== data.project.id)));
        
        const risks = JSON.parse(localStorage.getItem('pm_risks') || '[]');
        localStorage.setItem('pm_risks', JSON.stringify(risks.filter(r => r.project_id !== data.project.id)));
        
        const milestones = JSON.parse(localStorage.getItem('pm_milestones') || '[]');
        localStorage.setItem('pm_milestones', JSON.stringify(milestones.filter(m => m.project_id !== data.project.id)));
      } else {
        console.log('导入已取消');
        return;
      }
    }
    
    // 导入新数据
    projects.push(data.project);
    localStorage.setItem('pm_projects', JSON.stringify(projects));
    
    const tasks = JSON.parse(localStorage.getItem('pm_tasks') || '[]');
    data.tasks.forEach(task => tasks.push(task));
    localStorage.setItem('pm_tasks', JSON.stringify(tasks));
    
    const risks = JSON.parse(localStorage.getItem('pm_risks') || '[]');
    data.risks.forEach(risk => risks.push(risk));
    localStorage.setItem('pm_risks', JSON.stringify(risks));
    
    const milestones = JSON.parse(localStorage.getItem('pm_milestones') || '[]');
    data.milestones.forEach(milestone => milestones.push(milestone));
    localStorage.setItem('pm_milestones', JSON.stringify(milestones));
    
    console.log(`✅ 成功导入项目: ${data.project.name}`);
    console.log(`📊 任务: ${data.tasks.length}, 风险: ${data.risks.length}, 里程碑: ${data.milestones.length}`);
    
    // 刷新页面
    location.reload();
  } catch (error) {
    console.error('❌ 导入失败:', error);
  }
}

// 导入所有3个测试项目
await importTestData('project1-healthy.json');
await importTestData('project2-warning.json');
await importTestData('project3-critical.json');
```

5. **按回车执行**
6. **页面会自动刷新**,数据导入完成

---

### 方法2: 单独导入某个项目

如果只想导入特定项目,可以单独执行:

```javascript
// 只导入项目1 (健康项目)
await importTestData('project1-healthy.json');

// 只导入项目2 (警告项目)
await importTestData('project2-warning.json');

// 只导入项目3 (危险项目)
await importTestData('project3-critical.json');
```

---

### 方法3: 通过手动复制导入

如果无法通过文件访问,可以手动复制数据:

1. 打开对应的 JSON 文件
2. 复制全部内容
3. 在浏览器控制台执行:

```javascript
const testData = /* 粘贴复制的JSON数据 */;
localStorage.setItem('pm_projects', JSON.stringify([testData.project]));
localStorage.setItem('pm_tasks', JSON.stringify(testData.tasks));
localStorage.setItem('pm_risks', JSON.stringify(testData.risks));
localStorage.setItem('pm_milestones', JSON.stringify(testData.milestones));
location.reload();
```

---

## 🔍 验证导入

导入后,可以通过以下方式验证:

### 方法1: 浏览器控制台验证

```javascript
// 查看所有项目
console.log('项目列表:', JSON.parse(localStorage.getItem('pm_projects')));

// 查看项目1的详情
const projectId = '550e8400-e29b-41d4-a716-446655440001';
const tasks = JSON.parse(localStorage.getItem('pm_tasks')).filter(t => t.project_id === projectId);
const risks = JSON.parse(localStorage.getItem('pm_risks')).filter(r => r.project_id === projectId);
const milestones = JSON.parse(localStorage.getItem('pm_milestones')).filter(m => m.project_id === projectId);

console.log('任务数量:', tasks.length);
console.log('风险数量:', risks.length);
console.log('里程碑数量:', milestones.length);
```

### 方法2: 在应用中查看

1. 访问 CompanyCockpit 页面,应该能看到3个项目
2. 访问 Dashboard 页面,可以查看单个项目的详细信息

---

## 🗑️ 清除测试数据

如果要清除所有测试数据:

```javascript
localStorage.removeItem('pm_projects');
localStorage.removeItem('pm_tasks');
localStorage.removeItem('pm_risks');
localStorage.removeItem('pm_milestones');
localStorage.removeItem('pm_project_members');
location.reload();
```

如果要清除特定项目:

```javascript
const projectId = '550e8400-e29b-41d4-a716-446655440001';

// 删除项目
const projects = JSON.parse(localStorage.getItem('pm_projects') || '[]');
localStorage.setItem('pm_projects', JSON.stringify(projects.filter(p => p.id !== projectId)));

// 删除相关任务、风险、里程碑
const tasks = JSON.parse(localStorage.getItem('pm_tasks') || '[]');
localStorage.setItem('pm_tasks', JSON.stringify(tasks.filter(t => t.project_id !== projectId)));

const risks = JSON.parse(localStorage.getItem('pm_risks') || '[]');
localStorage.setItem('pm_risks', JSON.stringify(risks.filter(r => r.project_id !== projectId)));

const milestones = JSON.parse(localStorage.getItem('pm_milestones') || '[]');
localStorage.setItem('pm_milestones', JSON.stringify(milestones.filter(m => m.project_id !== projectId)));

location.reload();
```

---

## 📝 数据结构说明

每个测试项目包含以下数据:

```json
{
  "project": {
    "id": "UUID",
    "name": "项目名称",
    "description": "项目描述",
    "status": "active",
    "created_at": "ISO日期",
    "updated_at": "ISO日期"
  },
  "tasks": [
    {
      "id": "UUID",
      "project_id": "项目ID",
      "title": "任务标题",
      "status": "todo/in_progress/completed",
      "priority": "low/medium/high/urgent",
      "progress": 0-100,
      "assignee": "负责人",
      "assignee_unit": "责任单位",
      "dependencies": ["依赖任务ID"],
      "created_at": "ISO日期",
      "updated_at": "ISO日期"
    }
  ],
  "risks": [
    {
      "id": "UUID",
      "project_id": "项目ID",
      "title": "风险标题",
      "level": "low/medium/high/critical",
      "status": "identified/monitoring/mitigated/occurred",
      "probability": 0-100,
      "impact": 0-100,
      "created_at": "ISO日期"
    }
  ],
  "milestones": [
    {
      "id": "UUID",
      "project_id": "项目ID",
      "title": "里程碑标题",
      "target_date": "YYYY-MM-DD",
      "status": "pending/in_progress/completed/delayed",
      "completed_at": "ISO日期 (可选)",
      "created_at": "ISO日期"
    }
  ]
}
```

---

## ⚠️ 注意事项

1. **数据会覆盖**: 如果项目ID已存在,导入会提示是否覆盖
2. **ID唯一性**: 每个项目的ID是唯一的,请勿修改
3. **日期格式**: 所有日期使用ISO 8601格式
4. **浏览器兼容**: 建议使用Chrome、Firefox等现代浏览器
5. **数据备份**: 导入前建议备份现有数据

---

## 🚀 快速开始

最快的方式是:

1. 打开应用
2. 按 `F12` 打开开发者工具
3. 切换到 Console 标签
4. 复制方法1中的所有代码
5. 粘贴并按回车
6. 等待页面刷新完成

完成后,您将看到3个不同健康状态的项目,可以用来测试 CompanyCockpit 和 Dashboard 模块的各种功能!
