import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../seeds/standardInternalFlowSeed.js', () => ({
  STANDARD_INTERNAL_FLOW_RULE_SEED: [],
}))

import {
  CHINA_GB55032_TEMPLATE_CATALOG,
  flattenChinaTemplateCatalog,
} from '../seeds/chinaGb50300TemplateCatalog'

const source = readFileSync(new URL('../seeds/chinaGb50300TemplateCatalog.ts', import.meta.url), 'utf8')
const flatChinaCatalog = flattenChinaTemplateCatalog(CHINA_GB55032_TEMPLATE_CATALOG.divisions)

function activityStepOverrideBlock() {
  const start = source.indexOf('const STANDARD_ACTIVITY_STEP_DEPTH_OVERRIDES')
  const end = source.indexOf('function enrichFieldActivitySteps')

  expect(start, 'STANDARD_ACTIVITY_STEP_DEPTH_OVERRIDES should exist').toBeGreaterThan(-1)
  expect(end, 'enrichFieldActivitySteps should follow activity-step overrides').toBeGreaterThan(start)

  return source.slice(start, end)
}

describe('china GB50300 activity-step depth overrides', () => {
  it('deepens high-risk standard-process seeds with site-verifiable activity steps', () => {
    const overrides = activityStepOverrideBlock()
    const expectations = [
      {
        code: '01-02-03-P06',
        fragments: ['浇筑分区', '坍落度入模温度', '振捣密实', '后浇带施工缝', '试块留置'],
      },
      {
        code: '01-02-03-P07',
        fragments: ['测温点布置', '内表温差', '降温速率', '裂缝风险', '测温曲线'],
      },
      {
        code: '01-02-14-P06',
        fragments: ['清孔质量', '浆液配合比', '注浆压力流量', '二次补浆', '抗拔试验清单'],
      },
      {
        code: '01-02-15-P05',
        fragments: ['轴线标高', '突沉风险', '分仓取土', '纠偏措施', '封底施工条件'],
      },
      {
        code: '01-07-04-P04',
        fragments: ['排水管通畅性', '排水泵启停', '倒灌风险', '功能试排', '验收签认'],
      },
      {
        code: '08-18-09-P05',
        fragments: ['穿墙管线', '滤波器型号方向', '波导通风', '屏蔽封堵', '搭接电阻'],
      },
    ]

    for (const expectation of expectations) {
      expect(overrides, `${expectation.code} should have explicit activity-step override`)
        .toContain(`'${expectation.code}'`)
      for (const fragment of expectation.fragments) {
        expect(overrides, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('expands thin standard processes into field-verifiable activity-step depth at runtime', () => {
    const expectations = [
      {
        code: '01-01-04-P04',
        stepCount: 5,
        fragments: ['含水率', '摊铺厚度', '压实系数', '取样检测', '隐蔽验收'],
      },
      {
        code: '01-02-15-P04',
        stepCount: 6,
        fragments: ['刃脚阻力', '取土下沉', '连续监测', '纠偏', '突沉'],
      },
      {
        code: '01-02-15-P06',
        stepCount: 5,
        fragments: ['封底前', '导管布置', '连续浇筑', '止水节点', '底板'],
      },
      {
        code: '01-04-02-P02',
        stepCount: 5,
        fragments: ['井位孔深', '成孔成井', '滤料', '洗井', '成井记录'],
      },
      {
        code: '01-04-02-P04',
        stepCount: 5,
        fragments: ['试回灌流量', '井内水位', '周边水位', '异常处置', '曲线成果'],
      },
      {
        code: '03-01-03-P03',
        stepCount: 5,
        fragments: ['基层湿润', '摊铺厚度', '压实遍数', '标高复测', '养护交接'],
      },
      {
        code: '03-01-04-P04',
        stepCount: 5,
        fragments: ['含水率', '防潮层', '拼缝宽度', '钉固胶粘', '成品保护'],
      },
      {
        code: '04-01-02-P04',
        stepCount: 5,
        fragments: ['基层干燥度', '搭接宽度', '收头密封', '破损修补', '隐蔽影像'],
      },
      {
        code: '05-05-04-P02',
        stepCount: 5,
        fragments: ['基层清理', '搭接宽度', '加热管', '破损划伤', '隐蔽影像'],
      },
      {
        code: '08-05-02-P02',
        stepCount: 5,
        fragments: ['牵引计划', '牵引张力', '弯曲半径', '余量盘留', '隐蔽验收'],
      },
      {
        code: '08-05-02-P04',
        stepCount: 5,
        fragments: ['余量长度', '端部防尘', '防火分区封堵', '标签编号', '资料移交'],
      },
      {
        code: '08-14-02-P03',
        stepCount: 5,
        fragments: ['点表地址', '分层绑扎', '屏蔽层接地', '端子编号', '点表移交'],
      },
      {
        code: '08-18-03-P05',
        stepCount: 5,
        fragments: ['冷热通道', '气密性能', '防冷桥', '漏风冷凝', '运维检修界面'],
      },
      {
        code: '08-19-05-P02',
        stepCount: 5,
        fragments: ['屏蔽边界', '接地汇流', '检修空间', '导通', '安装界面'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }

      for (const genericStep of ['作业面确认', '工艺参数确认', '班组自检记录']) {
        expect(activityText, `${expectation.code} should not remain generic ${genericStep}`)
          .not.toContain(genericStep)
      }
    }
  })

  it('hardens scheduling-critical four-step standard processes into evidence-rich runtime steps', () => {
    const expectations = [
      {
        code: '01-01-06-P01',
        stepCount: 6,
        fragments: ['注浆试验孔位', '压力流量', '异常处置', '批量注浆放行'],
      },
      {
        code: '01-02-03-P04',
        stepCount: 6,
        fragments: ['钢筋翻样', '接头抽检', '预留预埋', '浇筑放行'],
      },
      {
        code: '01-02-03-P05',
        stepCount: 6,
        fragments: ['模板深化图', '对拉体系', '止水节点', '浇筑放行'],
      },
      {
        code: '01-02-05-P06',
        stepCount: 6,
        fragments: ['界面凿毛', '灌浆料批次', '连续灌浆', '柱脚交接'],
      },
      {
        code: '01-02-07-P06',
        stepCount: 6,
        fragments: ['接桩端板', '焊工资格', '焊缝探伤', '沉桩继续作业放行'],
      },
      {
        code: '01-02-08-P06',
        stepCount: 6,
        fragments: ['主筋箍筋', '声测管', '吊装下放', '清孔灌注放行'],
      },
      {
        code: '01-02-12-P04',
        stepCount: 6,
        fragments: ['吊装半径', '吊具索具', '异常偏位', '沉桩放行'],
      },
      {
        code: '01-07-01-P01',
        stepCount: 6,
        fragments: ['抗渗等级', '止水节点', '抗渗试块', '浇筑条件放行'],
      },
      {
        code: '01-07-02-P03',
        stepCount: 6,
        fragments: ['后浇带钢筋', '止水钢板', '强度资料', '二次闭水'],
      },
      {
        code: '02-01-06-P20',
        stepCount: 6,
        fragments: ['孔道清理', '钢筋插入长度', '灌浆压力', '隐蔽验收'],
      },
      {
        code: '09-01-02-P08',
        stepCount: 6,
        fragments: ['喷淋压力', '渗漏巡查', '二次复测', '验收移交'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should expose hardened activity steps`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens monitoring, handover, MEP, and low-voltage standard processes for schedule trust', () => {
    const expectations = [
      {
        code: '01-01-07-P06',
        fragments: ['沉降板', '连续采集', '固结趋势', '异常突变', '卸载条件'],
      },
      {
        code: '01-04-02-P05',
        fragments: ['回灌运行', '累计记录', '沉降联动', '冒水风险', '运行曲线'],
      },
      {
        code: '01-04-02-P06',
        fragments: ['回灌水质', '堵塞', '异常', '反冲洗', '检查台账'],
      },
      {
        code: '01-04-02-P07',
        fragments: ['沉降巡检', '建筑道路管线', '报警记录', '回灌参数', '风险闭合'],
      },
      {
        code: '01-05-01-P01',
        fragments: ['土方开挖分区', '临边防护', '监测协同', '应急措施', '开挖放行'],
      },
      {
        code: '01-05-01-P07',
        fragments: ['钎探点位', '持力层', '联合验槽', '扰动区处理', '放行签认'],
      },
      {
        code: '01-06-02-P04',
        fragments: ['泄水孔位置', '反滤层级配', '排水盲沟', '堵塞倒坡', '排水功能'],
      },
      {
        code: '01-06-02-P07',
        fragments: ['监测点布设', '墙身位移', '雨后', '超限点', '监测成果'],
      },
      {
        code: '06-04-02-P04',
        fragments: ['灰斗检修口', '泄爆口', '开启空间', '防静电', '整改闭合'],
      },
      {
        code: '06-06-02-P04',
        fragments: ['密闭检修门', '调节阀', '密封条', '气密薄弱点', '安装移交'],
      },
      {
        code: '06-09-02-P04',
        fragments: ['集尘接口', '旁通阀', '负压泄漏', '启闭灵活性', '编号移交'],
      },
      {
        code: '07-05-05-P01',
        fragments: ['直敷路径', '基层条件', '强弱电间距', '接线盒', '敷设放行'],
      },
      {
        code: '07-05-05-P03',
        fragments: ['外护套', '展开校直', '弯曲半径', '穿越保护', '隐蔽验收'],
      },
      {
        code: '08-06-01-P02',
        fragments: ['覆盖勘测', '盲区', '覆盖预测', '重点区域', '优化建议'],
      },
      {
        code: '08-06-01-P04',
        fragments: ['天线点位', '馈线路由', '弯曲半径', '接地条件', '运营商移交'],
      },
      {
        code: '08-06-01-P05',
        fragments: ['驻波比', '端到端', '信号强度', '弱覆盖点', '开通条件'],
      },
      {
        code: '08-10-02-P01',
        fragments: ['接口矩阵', '线缆分色编号', '点位接口', '传输距离', '清单冻结'],
      },
      {
        code: '08-10-02-P06',
        fragments: ['测试场景', '底噪', '接地干扰', '整改复测', '会议系统移交'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have five field activity steps`)
        .toHaveLength(5)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(5)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens high-risk two-step standard processes into field-action sequences', () => {
    const expectations = [
      {
        code: '01-02-15-P01',
        stepCount: 6,
        fragments: ['沉井沉箱', '刃脚', '监测点布设', '流砂突沉', '试下沉', '监测基准'],
      },
      {
        code: '01-03-08-P01',
        stepCount: 6,
        fragments: ['内支撑', '围檩冠梁', '预加力', '轴力监测', '应急措施', '安装放行'],
      },
      {
        code: '01-04-01-P01',
        stepCount: 6,
        fragments: ['降排水目标', '井点深度', '排水通道', '抽水试运行', '沉降水位', '试运行成果'],
      },
      {
        code: '01-07-05-P01',
        stepCount: 6,
        fragments: ['注浆孔位', '浆液配合比', '试注压力', '冒浆串浆', '参数调整', '批量施工放行'],
      },
      {
        code: '02-03-01-P01',
        stepCount: 6,
        fragments: ['焊接工艺评定', '焊材烘干', '坡口尺寸', '焊接环境', '无损检测计划', '首件放行'],
      },
      {
        code: '02-03-05-P01',
        stepCount: 6,
        fragments: ['吊装分区', '构件编号', '临时支撑', '吊装通道', '测量校正', '首吊条件'],
      },
      {
        code: '05-01-09-P01',
        stepCount: 6,
        fragments: ['给水调试', '试压冲洗', '测点布置', '末端放水', '余氯偏差', '测试放行'],
      },
      {
        code: '05-08-02-P01',
        stepCount: 6,
        fragments: ['供热试压', '盲板封堵', '稳压时长', '巡检路线', '压力曲线', '放行记录'],
      },
      {
        code: '06-05-10-P01',
        stepCount: 6,
        fragments: ['舒适空调', '测点布置', '自控点表', '典型房间', '参数调整', '负荷边界'],
      },
      {
        code: '07-03-01-P04',
        stepCount: 6,
        fragments: ['送电回路', '绝缘电阻', '挂牌隔离', '应急停电', '操作票', '首送记录'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }

      for (const genericStep of ['作业面确认', '工艺参数确认', '班组自检记录']) {
        expect(activityText, `${expectation.code} should not remain generic ${genericStep}`)
          .not.toContain(genericStep)
      }
    }
  })

  it('deepens commissioning, fire-life-safety, lightning, and elevator closeout standard processes', () => {
    const expectations = [
      {
        code: '06-07-09-P01',
        stepCount: 6,
        fragments: ['洁净等级', '粒子计数', '采样高度', '动态测试', '整改复测', '检测放行'],
      },
      {
        code: '06-20-03-P01',
        stepCount: 6,
        fragments: ['消防联动点表', '风阀', '反馈信号', '报警主机', '整改复测', '联动测试放行'],
      },
      {
        code: '07-04-02-P03',
        stepCount: 6,
        fragments: ['控制柜接线', '相序', '正反转', '空载电流', '异常停机', '移交签认'],
      },
      {
        code: '08-14-02-P01',
        stepCount: 6,
        fragments: ['BMS点表', 'DDC箱', '通讯协议', '地址回路', '协议偏差', '调试放行'],
      },
      {
        code: '08-15-02-P02',
        stepCount: 6,
        fragments: ['隔离器位置', '防火分区', '短路隔离', '端子箱标识', '回路超容', '消防调试放行'],
      },
      {
        code: '08-16-05-P10',
        stepCount: 6,
        fragments: ['安防调试报告', '账号权限', '录像回放', '时间同步', '权限错误', '运维签收'],
      },
      {
        code: '08-19-05-P01',
        stepCount: 6,
        fragments: ['电涌保护器', '接地路径', '接地导通', '防雷分区', '级配错误', '防雷验收'],
      },
      {
        code: '10-01-12-P07',
        stepCount: 6,
        fragments: ['监督检验资料', '安全回路', '绝缘接地', '监检问题', '使用登记', '移交闭合'],
      },
      {
        code: '10-02-11-P11',
        stepCount: 6,
        fragments: ['液压电梯', '安全钳', '液压站', '控制柜参数', '维保资料', '资料组卷'],
      },
      {
        code: '10-03-03-P11',
        stepCount: 6,
        fragments: ['扶梯竣工资料', '梳齿板', '备品备件', '运营接管', '维保资料', '接管签认'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens caisson, floor, roof, inspection well, and shielding quality-control standard processes', () => {
    const expectations = [
      {
        code: '01-02-15-P02',
        stepCount: 5,
        fragments: ['刃脚轴线', '垫层厚度', '止水节点', '养护记录', '放行签认'],
      },
      {
        code: '01-02-15-P03',
        stepCount: 5,
        fragments: ['分节高度', '止水带', '混凝土浇筑', '接缝凿毛', '下沉前验收'],
      },
      {
        code: '01-02-15-P07',
        stepCount: 5,
        fragments: ['井壁基层', '接缝凿毛', '嵌缝材料', '渗漏薄弱点', '渗漏整改'],
      },
      {
        code: '03-01-01-P01',
        stepCount: 5,
        fragments: ['基层清理', '平整度坡度', '含水率', '修补找平', '面层施工放行'],
      },
      {
        code: '03-01-02-P05',
        stepCount: 5,
        fragments: ['分格缝排版', '标高控制线', '切缝宽度', '整改复测', '成品保护'],
      },
      {
        code: '03-01-02-P08',
        stepCount: 5,
        fragments: ['空鼓开裂', '位置标识', '界面处理', '强度', '缺陷台账销项'],
      },
      {
        code: '04-04-02-P01',
        stepCount: 5,
        fragments: ['基层清理', '干燥度', '檐口边线', '天沟屋脊', '铺设放行'],
      },
      {
        code: '04-05-02-P05',
        stepCount: 5,
        fragments: ['天沟落水口', '附加防水层', '拍照记录', '渗漏点', '屋面移交'],
      },
      {
        code: '05-08-03-P05',
        stepCount: 5,
        fragments: ['检查井井位', '流槽', '现浇模板', '井圈井盖', '验收移交'],
      },
      {
        code: '08-19-06-P02',
        stepCount: 5,
        fragments: ['屏蔽线缆', '屏蔽连续性', '接地跨接', '抗干扰', '接地移交'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens intelligent-system commissioning, O&M handover, grounding, and elevator inspection closeout processes', () => {
    const expectations = [
      {
        code: '08-17-03-P01',
        stepCount: 6,
        fragments: ['应急响应系统', '联动对象', '预案脚本', '联动演练', '演练报告', '移交签认'],
      },
      {
        code: '08-13-04-P01',
        stepCount: 6,
        fragments: ['资源清单', '接口清单', '基础数据', '接口联调', '权限复测', '上线移交'],
      },
      {
        code: '08-12-04-P01',
        stepCount: 6,
        fragments: ['授时源', '母钟子钟', '显示格式', '同步精度', '通讯异常', '验收签认'],
      },
      {
        code: '08-11-06-P01',
        stepCount: 6,
        fragments: ['节目清单', '发布服务器', '显示终端', '应急插播', '错播', '移交签认'],
      },
      {
        code: '08-10-04-P01',
        stepCount: 6,
        fragments: ['音视频场景', '矩阵主机', '回声抑制', '远程会议', '控制异常', '报告归档'],
      },
      {
        code: '08-14-09-P08',
        stepCount: 6,
        fragments: ['BMS运维', '账号权限', '运维培训', '程序备份', '报警策略', '接管签认'],
      },
      {
        code: '08-15-06-P07',
        stepCount: 6,
        fragments: ['软件版本授权', '联动矩阵', '操作培训', '配置备份', '授权缺失', '运维签认'],
      },
      {
        code: '08-16-06-P08',
        stepCount: 6,
        fragments: ['安防系统运维', '录像策略', '配置备份', '应急开门', '资料缺项', '接管签认'],
      },
      {
        code: '08-18-11-P08',
        stepCount: 6,
        fragments: ['机房系统运维', '告警阈值', '动环消防', '故障演练', '账号权限', '交接闭合'],
      },
      {
        code: '08-19-01-P01',
        stepCount: 6,
        fragments: ['接地干线', '屏蔽接地', '接地扁钢', '接地电阻', '电阻超限', '验收资料'],
      },
      {
        code: '08-19-05-P05',
        stepCount: 6,
        fragments: ['前级保护', 'SPD参数', '状态指示', '保护协调', '级配错误', '防雷测试'],
      },
      {
        code: '08-19-06-P08',
        stepCount: 6,
        fragments: ['隐蔽验收范围', '弯曲半径', '接地连续性', '隐蔽影像', '标签缺失', '移交签认'],
      },
      {
        code: '10-01-01-P06',
        stepCount: 6,
        fragments: ['型式试验证明', '安全部件资料', '设备台账', '证书过期', '监检准备', '复核'],
      },
      {
        code: '10-02-03-P08',
        stepCount: 6,
        fragments: ['满载试验', '液压站', '压力曲线', '渗漏', '监督检验', '移交闭合'],
      },
      {
        code: '10-02-10-P06',
        stepCount: 6,
        fragments: ['绝缘接地', '安全回路', '等电位跨接', '电气资料', '整改复验', '移交闭合'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens fire-smoke linkage, equipotential grounding, clean HVAC, refrigeration, and elevator closeout thin processes', () => {
    const expectations = [
      {
        code: '06-03-06-P07',
        stepCount: 6,
        fragments: ['防排烟联动', '风阀反馈', '消防控制', '缺陷销项', '复测签认', '移交闭合'],
      },
      {
        code: '06-03-07-P07',
        stepCount: 6,
        fragments: ['联动缺陷', '风阀风机', '整改责任', '复测记录', '签认闭合', '资料归档'],
      },
      {
        code: '06-03-07-P01',
        stepCount: 6,
        fragments: ['调试方案', '消防联动矩阵', '点表', '场景脚本', '反馈信号', '放行签认'],
      },
      {
        code: '06-20-03-P06',
        stepCount: 6,
        fragments: ['防排烟功能', '自控点表', '消防主机', '反馈复测', '缺陷闭合', '交接签认'],
      },
      {
        code: '07-07-03-P07',
        stepCount: 6,
        fragments: ['等电位连接', '导通测试', '隐蔽影像', '跨接遗漏', '整改复测', '验收签认'],
      },
      {
        code: '08-19-03-P07',
        stepCount: 6,
        fragments: ['智能建筑等电位', '屏蔽接地', '导通复核', '记录复核', '问题整改', '验收签认'],
      },
      {
        code: '08-19-05-P08',
        stepCount: 6,
        fragments: ['电涌保护器', '级配复核', '状态指示', '接地导通', '失效整改', '验收记录'],
      },
      {
        code: '08-19-06-P05',
        stepCount: 6,
        fragments: ['屏蔽线缆', '弯曲半径', '固定间距', '标签编号', '抗干扰测试', '复核签认'],
      },
      {
        code: '10-02-01-P06',
        stepCount: 6,
        fragments: ['液压电梯', '试验证明', '随机资料', '证书有效性', '实物一致性', '监检准备'],
      },
      {
        code: '10-02-11-P12',
        stepCount: 6,
        fragments: ['液压电梯电气', '安全回路', '控制柜参数', '维保资料', '问题复验', '运维移交'],
      },
      {
        code: '06-07-07-P08',
        stepCount: 6,
        fragments: ['净化空调', '洁净保护', '污染风险', '检测报告', '缺陷整改', '移交签认'],
      },
      {
        code: '06-07-10-P06',
        stepCount: 6,
        fragments: ['净化空调绝热', '节能复测', '隐蔽影像', '冷桥结露', '整改闭合', '交接签认'],
      },
      {
        code: '06-16-01-P09',
        stepCount: 6,
        fragments: ['制冷机组', '报警保护', '联锁测试', '参数复核', '异常整改', '功能复测'],
      },
      {
        code: '06-18-07-P01',
        stepCount: 6,
        fragments: ['多联机', '地址表', '室内外机映射', '通讯调试', '异常复测', '调试放行'],
      },
      {
        code: '06-15-07-P01',
        stepCount: 6,
        fragments: ['蓄能系统', '运行策略', '充放能工况', '控制参数', '安全边界', '调试放行'],
      },
      {
        code: '06-10-09-P08',
        stepCount: 6,
        fragments: ['冷凝水', '坡度复核', '漏水倒灌', '整改复测', '排水试验', '签认闭合'],
      },
      {
        code: '05-13-07-P01',
        stepCount: 6,
        fragments: ['热源系统', '安全条件', '锅炉换热', '泵组联锁', '试运行准备', '调试放行'],
      },
      {
        code: '05-14-02-P07',
        stepCount: 6,
        fragments: ['仪表偏差', '校准证书', '复校记录', '参数回写', '偏差整改', '移交签认'],
      },
      {
        code: '08-16-05-P09',
        stepCount: 6,
        fragments: ['安防调试', '录像回放', '门禁权限', '报警联动', '问题闭合', '复测签认'],
      },
      {
        code: '01-03-07-P05',
        stepCount: 6,
        fragments: ['水泥土重力式挡墙', '监测点', '初始值', '报警阈值', '异常复核', '监测移交'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens foundation, retaining-wall, recharge, site-grading, and slope thin processes for field schedule trust', () => {
    const expectations = [
      {
        code: '01-01-01-P06',
        stepCount: 6,
        fragments: ['表面整平', '标高复核', '压实系数', '不合格区', '验收放行', '资料闭合'],
      },
      {
        code: '01-01-01-P08',
        stepCount: 6,
        fragments: ['地基验收', '承载力', '检测报告', '整改复测', '移交签认', '基础放行'],
      },
      {
        code: '01-01-07-P05',
        stepCount: 6,
        fragments: ['分级加载', '真空预压', '沉降速率', '孔压', '异常处置', '运行记录'],
      },
      {
        code: '01-01-07-P07',
        stepCount: 6,
        fragments: ['固结度', '卸载条件', '沉降曲线', '监测复核', '卸载签认', '后续移交'],
      },
      {
        code: '01-02-01-P01',
        stepCount: 6,
        fragments: ['基底验槽', '承载力复核', '扰动处理', '验槽记录', '整改复验', '垫层放行'],
      },
      {
        code: '01-02-01-P06',
        stepCount: 6,
        fragments: ['顶面标高', '轴线偏位', '外观尺寸', '缺陷整改', '复测记录', '验收签认'],
      },
      {
        code: '01-02-03-P09',
        stepCount: 6,
        fragments: ['拆模条件', '实体质量', '强度报告', '蜂窝麻面', '整改复测', '验收移交'],
      },
      {
        code: '01-03-07-P01',
        stepCount: 6,
        fragments: ['挡墙轴线', '基础复核', '承载力', '槽底排水', '偏差整改', '施工放行'],
      },
      {
        code: '01-03-07-P06',
        stepCount: 6,
        fragments: ['变形巡检', '渗漏巡检', '监测数据', '裂缝处置', '复测闭合', '移交记录'],
      },
      {
        code: '01-04-02-P01',
        stepCount: 6,
        fragments: ['回灌方案', '水源条件', '观测井', '水质水量', '试运行', '放行签认'],
      },
      {
        code: '01-05-03-P01',
        stepCount: 6,
        fragments: ['控制网', '设计标高', '方格网', '土方平衡', '边界复核', '施工放行'],
      },
      {
        code: '01-05-03-P06',
        stepCount: 6,
        fragments: ['方格网复测', '标高偏差', '排水坡向', '沉降风险', '整改复测', '移交签认'],
      },
      {
        code: '01-06-01-P01',
        stepCount: 6,
        fragments: ['边坡开挖方案', '支护设计', '坡率', '监测点', '排水措施', '开挖放行'],
      },
      {
        code: '01-06-02-P01',
        stepCount: 6,
        fragments: ['挡土墙基础', '验槽', '承载力', '排水垫层', '扰动整改', '施工放行'],
      },
      {
        code: '01-06-02-P08',
        stepCount: 6,
        fragments: ['挡土墙验收', '墙身垂直度', '泄水孔', '沉降缝', '回填压实', '移交签认'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens commissioning closeout, weak-current handover, and MEP retest thin processes', () => {
    const expectations = [
      {
        code: '08-05-07-P08',
        stepCount: 6,
        fragments: ['综合布线', '链路认证', '端口抽测', '交叉跳线', '问题闭合', '运维移交'],
      },
      {
        code: '06-01-07-P08',
        stepCount: 6,
        fragments: ['送风系统', '风量平衡', '风阀反馈', '噪声振动', '复测签认', '交接资料'],
      },
      {
        code: '06-02-08-P08',
        stepCount: 6,
        fragments: ['排风系统', '排风量', '排风机', '负压', '缺陷整改', '移交签认'],
      },
      {
        code: '06-03-07-P08',
        stepCount: 6,
        fragments: ['防排烟', '消防主机', '风机风阀', '图显反馈', '火警场景', '移交签认'],
      },
      {
        code: '06-04-09-P08',
        stepCount: 6,
        fragments: ['除尘系统', '负压风量', '集尘接口', '粉尘浓度', '问题销项', '运维移交'],
      },
      {
        code: '08-17-03-P08',
        stepCount: 6,
        fragments: ['应急响应', '预案脚本', '报警广播', '演练记录', '异常复测', '移交签认'],
      },
      {
        code: '08-18-10-P08',
        stepCount: 6,
        fragments: ['机房系统', '联调报告', '动环告警', '供配电制冷', '运维账号', '问题闭合'],
      },
      {
        code: '05-01-09-P08',
        stepCount: 6,
        fragments: ['给水系统', '试压冲洗', '末端放水', '水质余氯', '渗漏整改', '移交签认'],
      },
      {
        code: '05-13-07-P08',
        stepCount: 6,
        fragments: ['热源系统', '锅炉换热', '泵组联锁', '安全保护', '试运行记录', '运维交接'],
      },
      {
        code: '05-14-01-P07',
        stepCount: 6,
        fragments: ['联动调试', '仪表点位', '控制阀门', '报警保护', '数据记录', '签认归档'],
      },
      {
        code: '06-20-02-P06',
        stepCount: 6,
        fragments: ['执行机构', '阀门开度', '反馈信号', '行程限位', '偏差复测', '交接签认'],
      },
      {
        code: '08-14-08-P08',
        stepCount: 6,
        fragments: ['BMS调试', '点表差异', '趋势记录', '报警阈值', '复测签认', '运维交接'],
      },
      {
        code: '08-05-08-P08',
        stepCount: 6,
        fragments: ['综合布线试运行', '网络吞吐', '端口稳定性', '标签台账', '故障复测', '运维移交'],
      },
      {
        code: '08-08-01-P06',
        stepCount: 6,
        fragments: ['管槽路径', '有线电视', '屏蔽接地', '标签编号', '隐蔽影像', '交接签认'],
      },
      {
        code: '08-09-01-P06',
        stepCount: 6,
        fragments: ['分区回路', '公共广播', '线路绝缘', '端子编号', '隐蔽影像', '交接签认'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens interface, refrigerant, water-quality, and elevator safety closeout thin processes', () => {
    const expectations = [
      {
        code: '01-03-10-P01',
        stepCount: 6,
        fragments: ['主体结构界面', '围护体系', '预留预埋', '变形缝', '测量复核', '方案闭合'],
      },
      {
        code: '06-16-04-P09',
        stepCount: 6,
        fragments: ['制冷剂灌注', '抽真空保压', '称量记录', '运行压力', '泄漏复测', '签认归档'],
      },
      {
        code: '06-12-05-P01',
        stepCount: 6,
        fragments: ['冷却水灌水', '试验范围', '液面高度', '排放路径', '渗漏观察', '方案确认'],
      },
      {
        code: '06-12-05-P08',
        stepCount: 6,
        fragments: ['渗漏点位', '整改责任', '补焊封堵', '复测记录', '排放试验', '签认闭合'],
      },
      {
        code: '05-09-02-P06',
        stepCount: 6,
        fragments: ['水质检测', '取样点', '余氯浊度', '卫生验收', '不合格复测', '资料移交'],
      },
      {
        code: '05-01-08-P06',
        stepCount: 6,
        fragments: ['消毒检测', '末端取样', '检测报告', '冲洗复测', '交接签认', '运维边界'],
      },
      {
        code: '10-01-03-P12',
        stepCount: 6,
        fragments: ['驱动主机', '监督检验', '制动器', '曳引轮', '功能复测', '资料组卷'],
      },
      {
        code: '10-01-04-P06',
        stepCount: 6,
        fragments: ['导轨垂直度', '接头台阶', '支架间距', '安全钳', '验收记录', '签认闭合'],
      },
      {
        code: '08-18-04-P11',
        stepCount: 6,
        fragments: ['阀门挂牌', '流向标识', '隐蔽记录', '检修空间', '错标整改', '移交签认'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens foundation acceptance, life-safety, public-health, and special-equipment thin processes', () => {
    const expectations = [
      {
        code: '01-02-03-P01',
        stepCount: 6,
        fragments: ['基底验槽', '承载力复核', '持力层', '扰动处理', '验槽会签', '垫层放行'],
      },
      {
        code: '01-02-10-P04',
        stepCount: 6,
        fragments: ['终孔深度', '电流参数', '钻进记录', '桩长偏差', '持力层', '签认闭合'],
      },
      {
        code: '01-02-15-P08',
        stepCount: 6,
        fragments: ['沉井沉箱验收', '偏位复测', '封底质量', '防渗检查', '下沉记录', '移交签认'],
      },
      {
        code: '01-07-03-P01',
        stepCount: 6,
        fragments: ['特殊施工法', '防水措施', '接口止水', '穿墙节点', '渗漏风险', '方案会签'],
      },
      {
        code: '01-07-04-P01',
        stepCount: 6,
        fragments: ['排水方案', '盲沟', '排水板', '坡向标高', '出水通道', '放行签认'],
      },
      {
        code: '06-03-02-P04',
        stepCount: 6,
        fragments: ['执行机构', '动作反馈', '防火阀', '手自动', '消防联动', '记录签认'],
      },
      {
        code: '08-15-07-P07',
        stepCount: 6,
        fragments: ['火灾报警', '调试问题', '点位销项', '联动复测', '报警记录', '签认归档'],
      },
      {
        code: '06-08-02-P05',
        stepCount: 6,
        fragments: ['清洁滤毒隔绝', '人防通风', '模式切换', '密闭阀', '动作复核', '验收移交'],
      },
      {
        code: '05-13-01-P11',
        stepCount: 6,
        fragments: ['锅炉', '特种设备', '监督检验', '问题整改', '使用登记', '资料组卷'],
      },
      {
        code: '05-13-03-P08',
        stepCount: 6,
        fragments: ['安全附件', '挂牌铅封', '校验证书', '压力表', '安全阀', '归档签认'],
      },
      {
        code: '05-01-07-P06',
        stepCount: 6,
        fragments: ['管道冲洗', '冲洗流速', '排水浊度', '末端放水', '记录复核', '签认闭合'],
      },
      {
        code: '05-01-08-P03',
        stepCount: 6,
        fragments: ['消毒剂', '配制浓度', '投加点', '接触时间', '余氯复测', '送检记录'],
      },
      {
        code: '05-09-05-P01',
        stepCount: 6,
        fragments: ['饮用水调试', '卫生边界', '取样计划', '隔离措施', '验收准备', '方案放行'],
      },
      {
        code: '06-17-03-P08',
        stepCount: 6,
        fragments: ['真空保持', '压力曲线', '泄漏点', '吸收式制冷', '复测记录', '签认归档'],
      },
      {
        code: '10-01-10-P08',
        stepCount: 6,
        fragments: ['随行电缆', '全行程', '磨碰检查', '绝缘接地', '监督检验', '验收签认'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens water-quality, backup-power, vapor-control, and fixture commissioning thin processes', () => {
    const expectations = [
      {
        code: '05-10-03-P09',
        stepCount: 6,
        fragments: ['回用水质', '取样点', '浊度余氯', '验收资料', '不合格复测', '移交签认'],
      },
      {
        code: '06-18-06-P09',
        stepCount: 6,
        fragments: ['制冷剂灌注', '室内外机', '追加量', '运行压力', '泄漏复测', '签认归档'],
      },
      {
        code: '07-06-05-P07',
        stepCount: 6,
        fragments: ['备用电源导管', '隐蔽验收', '弯曲半径', '接地跨接', '防火封堵', '记录签认'],
      },
      {
        code: '03-04-04-P08',
        stepCount: 6,
        fragments: ['专项检测', '检测批次', '报告编号', '偏差整改', '交接资料', '签认完成'],
      },
      {
        code: '04-01-02-P07',
        stepCount: 6,
        fragments: ['隔汽层', '搭接收头', '破损修补', '功能复测', '隐蔽影像', '交接签认'],
      },
      {
        code: '05-01-09-P07',
        stepCount: 6,
        fragments: ['给水系统', '问题整改', '末端复测', '压力水质', '整改闭合', '记录签认'],
      },
      {
        code: '05-02-04-P01',
        stepCount: 6,
        fragments: ['排水试验', '调试方案', '分区清单', '灌水通球', '排放路径', '试验放行'],
      },
      {
        code: '05-03-05-P01',
        stepCount: 6,
        fragments: ['雨水系统', '试验调试', '分区条件', '雨水斗', '溢流路径', '调试放行'],
      },
      {
        code: '05-04-04-P01',
        stepCount: 6,
        fragments: ['卫生器具', '房间清单', '通水试验', '洁具接口', '渗漏风险', '调试放行'],
      },
      {
        code: '05-05-09-P01',
        stepCount: 6,
        fragments: ['供暖系统', '调试方案', '分区确认', '水压冲洗', '热态运行', '调试放行'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens rinse, disinfection, pool-water, life-safety, emergency, machine-room, and elevator handover processes', () => {
    const expectations = [
      {
        code: '05-01-07-P01',
        stepCount: 6,
        fragments: ['冲洗范围', '末端放水点', '冲洗流速', '排水浊度', '污染源排查', '方案放行'],
      },
      {
        code: '05-01-08-P01',
        stepCount: 6,
        fragments: ['消毒范围', '消毒剂浓度', '投加点', '接触时间', '取样计划', '方案放行'],
      },
      {
        code: '05-11-05-P01',
        stepCount: 6,
        fragments: ['泳池水系统', '水质目标', '循环过滤', '药剂投加', '取样检测', '调试放行'],
      },
      {
        code: '06-03-04-P07',
        stepCount: 6,
        fragments: ['防排烟风机', '耐温证书', '风量复测', '联动启停', '反馈信号', '交接签认'],
      },
      {
        code: '08-15-04-P07',
        stepCount: 6,
        fragments: ['报警控制器', '主机回路', '地址点位', '声光反馈', '故障报警', '调试记录'],
      },
      {
        code: '08-15-08-P07',
        stepCount: 6,
        fragments: ['消防检测资料', '报警联动记录', '问题销项', '复测报告', '检测签认', '资料移交'],
      },
      {
        code: '08-17-04-P08',
        stepCount: 6,
        fragments: ['应急响应', '预案脚本', '响应数据', '运维账号', '培训记录', '移交签认'],
      },
      {
        code: '08-18-03-P09',
        stepCount: 6,
        fragments: ['机房空调', '运行参数', '温湿度边界', '告警阈值', '运行曲线', '运维移交'],
      },
      {
        code: '10-01-13-P09',
        stepCount: 6,
        fragments: ['电梯竣工资料', '监督检验', '安全回路', '整机试验', '使用登记', '维保移交'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens ground-treatment closeout, foundation acceptance, and setting-out thin processes', () => {
    const expectations = [
      {
        code: '01-01-02-P06',
        stepCount: 6,
        fragments: ['表面整平', '标高复核', '排水坡向', '压实度', '低洼整改', '移交签认'],
      },
      {
        code: '01-01-02-P08',
        stepCount: 6,
        fragments: ['地基验收', '承载力', '检测报告', '换填记录', '垫层放行', '验收签认'],
      },
      {
        code: '01-01-03-P05',
        stepCount: 6,
        fragments: ['土工合成材料', '上层填料', '摊铺厚度', '压实遍数', '搭接保护', '压实检测'],
      },
      {
        code: '01-01-03-P08',
        stepCount: 6,
        fragments: ['地基验收', '加筋垫层', '承载力', '沉降观测', '检测报告', '放行签认'],
      },
      {
        code: '01-01-04-P06',
        stepCount: 6,
        fragments: ['砂石垫层', '表面整平', '标高复核', '含水率', '压实度', '移交签认'],
      },
      {
        code: '01-01-04-P08',
        stepCount: 6,
        fragments: ['砂石地基', '验收复核', '承载力', '压实系数', '检测报告', '垫层放行'],
      },
      {
        code: '01-01-06-P08',
        stepCount: 6,
        fragments: ['注浆封孔', '孔口处理', '封孔材料', '养护时间', '渗漏复查', '资料闭合'],
      },
      {
        code: '01-01-07-P08',
        stepCount: 6,
        fragments: ['卸载整平', '卸载条件', '沉降稳定', '回弹观测', '标高复测', '移交签认'],
      },
      {
        code: '01-01-07-P10',
        stepCount: 6,
        fragments: ['预压地基', '固结度', '沉降曲线', '卸载记录', '承载力', '验收签认'],
      },
      {
        code: '01-01-13-P07',
        stepCount: 6,
        fragments: ['桩顶处理', '桩顶标高', '桩头质量', '养护条件', '缺陷修补', '移交签认'],
      },
      {
        code: '01-02-01-P02',
        stepCount: 6,
        fragments: ['基础轴线', '台阶尺寸', '顶面标高', '放样复核', '偏差整改', '验线签认'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens early ground-treatment parameter, setting-out, material, and trial-section processes', () => {
    const expectations = [
      {
        code: '01-01-01-P01',
        stepCount: 6,
        fragments: ['配合比', '施工参数', '试验段', '含水率', '压实指标', '参数签认'],
      },
      {
        code: '01-01-01-P02',
        stepCount: 6,
        fragments: ['测量放线', '控制点', '边界线', '设计标高', '复测闭合', '放线签认'],
      },
      {
        code: '01-01-01-P03',
        stepCount: 6,
        fragments: ['材料进场', '批次复验', '含水率', '粒径级配', '见证取样', '复验报告'],
      },
      {
        code: '01-01-02-P01',
        stepCount: 6,
        fragments: ['灰土配合比', '含水率', '施工参数', '试验段', '压实系数', '参数签认'],
      },
      {
        code: '01-01-02-P02',
        stepCount: 6,
        fragments: ['灰土地基', '测量放线', '控制桩', '换填边界', '标高复测', '放线签认'],
      },
      {
        code: '01-01-02-P03',
        stepCount: 6,
        fragments: ['灰土材料', '石灰土料', '批次复验', '含水率', '见证取样', '复验报告'],
      },
      {
        code: '01-01-03-P02',
        stepCount: 6,
        fragments: ['加筋垫层', '测量放线', '铺设边界', '搭接线', '标高复测', '放线签认'],
      },
      {
        code: '01-01-03-P03',
        stepCount: 6,
        fragments: ['土工合成材料', '进场复验', '拉伸强度', '幅宽搭接', '见证取样', '复验报告'],
      },
      {
        code: '01-01-04-P01',
        stepCount: 6,
        fragments: ['砂石配合比', '级配曲线', '含水率', '施工参数', '试验段', '参数签认'],
      },
      {
        code: '01-01-04-P02',
        stepCount: 6,
        fragments: ['砂石垫层', '测量放线', '铺设边界', '控制点', '标高复测', '放线签认'],
      },
      {
        code: '01-01-04-P03',
        stepCount: 6,
        fragments: ['砂石材料', '批次复验', '级配含泥量', '见证取样', '不合格处置', '复验报告'],
      },
      {
        code: '01-01-05-P02',
        stepCount: 6,
        fragments: ['试夯区', '夯能参数', '夯点布置', '沉降量', '试夯记录', '参数签认'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens acceptance, handover, commissioning-dossier, and safety-review thin processes', () => {
    const expectations = [
      {
        code: '01-02-04-P07',
        stepCount: 6,
        fragments: ['柱脚轴线', '基础标高', '锚栓复测', '交接签认', '资料移交', '整改闭合'],
      },
      {
        code: '01-02-01-P07',
        stepCount: 6,
        fragments: ['养护记录', '实体强度', '外观缺陷', '尺寸偏差', '验收签认', '缺陷闭合'],
      },
      {
        code: '01-04-02-P08',
        stepCount: 6,
        fragments: ['停用条件', '水位复核', '封井记录', '监测交接', '资料移交', '风险销项'],
      },
      {
        code: '01-05-03-P07',
        stepCount: 6,
        fragments: ['标高复测', '坡向排水', '边界复核', '压实记录', '交接签认', '问题销项'],
      },
      {
        code: '01-06-03-P01',
        stepCount: 6,
        fragments: ['放坡参数', '开挖分层', '支护界面', '监测点位', '安全条件', '复核签认'],
      },
      {
        code: '05-14-02-P01',
        stepCount: 6,
        fragments: ['回路点表', '信号校验', '量程核对', '联锁条件', '调试记录', '异常销项'],
      },
      {
        code: '05-02-04-P09',
        stepCount: 6,
        fragments: ['通球试验', '灌水记录', '通水复测', '渗漏销项', '资料归档', '移交签认'],
      },
      {
        code: '06-08-07-P08',
        stepCount: 6,
        fragments: ['人防联调', '密闭检测', '防爆附件', '验收资料', '问题销项', '移交签认'],
      },
      {
        code: '08-15-02-P06',
        stepCount: 6,
        fragments: ['回路清册', '线缆标识', '绝缘测试', '报警点位', '验收记录', '签认归档'],
      },
      {
        code: '08-09-02-P06',
        stepCount: 6,
        fragments: ['强切回路', '分区矩阵', '线缆标识', '联动测试', '测试归档', '问题销项'],
      },
      {
        code: '10-03-01-P05',
        stepCount: 6,
        fragments: ['合格证明', '型式资料', '安全部件', '随机文件', '资料复核', '缺项闭合'],
      },
      {
        code: '05-13-01-P02',
        stepCount: 6,
        fragments: ['特种设备告知', '设备资料', '铭牌核验', '安装条件', '监督检验', '资料闭合'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens steel, outdoor-network, pressure-test, and equipment-handover thin processes', () => {
    const expectations = [
      {
        code: '02-03-04-P01',
        stepCount: 6,
        fragments: ['吊装半径', '地基承载', '构件编号', '临时支撑', '高强螺栓', '吊装放行'],
      },
      {
        code: '02-04-02-P01',
        stepCount: 6,
        fragments: ['支座轴线', '吊点复核', '胎架支撑', '卸载方案', '节点标高', '安装放行'],
      },
      {
        code: '05-06-03-P01',
        stepCount: 6,
        fragments: ['调试分区', '阀门边界', '冲洗流速', '压力测点', '水质取样', '记录签认'],
      },
      {
        code: '05-07-03-P01',
        stepCount: 6,
        fragments: ['井段范围', '闭水条件', '通球试验', '坡度复核', '渗漏整改', '资料签认'],
      },
      {
        code: '05-08-02-P08',
        stepCount: 6,
        fragments: ['试压分段', '升压曲线', '稳压时间', '泄漏巡检', '降压复验', '记录签认'],
      },
      {
        code: '05-08-06-P01',
        stepCount: 6,
        fragments: ['调试分区', '热力入口', '循环冲洗', '平衡阀设定', '温压测点', '移交签认'],
      },
      {
        code: '05-09-05-P08',
        stepCount: 6,
        fragments: ['冲洗消毒', '水质检测', '采样点位', '余氯记录', '卫生报告', '资料移交'],
      },
      {
        code: '06-03-04-P02',
        stepCount: 6,
        fragments: ['耐温证明', '铭牌参数', '风机方向', '减振基础', '电源接线', '试运记录'],
      },
      {
        code: '06-11-08-P01',
        stepCount: 6,
        fragments: ['系统分区', '冲洗排污', '水压试验', '流量平衡', '温差测点', '调试签认'],
      },
      {
        code: '07-01-01-P09',
        stepCount: 6,
        fragments: ['基础型钢', '器身检查', '接地连续', '绝缘测试', '冲击合闸', '交接资料'],
      },
      {
        code: '07-06-06-P07',
        stepCount: 6,
        fragments: ['放缆路径', '牵引张力', '弯曲半径', '电缆挂牌', '绝缘测试', '验收签认'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens foundation treatment parameters, curing, bedding, and foundation concrete thin processes', () => {
    const expectations = [
      {
        code: '01-01-06-P04',
        stepCount: 6,
        fragments: ['浆液配合比', '水灰比', '注浆压力', '试注记录', '流量计量', '参数签认'],
      },
      {
        code: '01-01-08-P04',
        stepCount: 6,
        fragments: ['试桩编号', '桩机参数', '成桩电流', '提升速度', '成桩质量', '参数签认'],
      },
      {
        code: '01-01-09-P04',
        stepCount: 6,
        fragments: ['试喷区', '喷射压力', '提升速度', '旋喷半径', '水泥掺量', '参数签认'],
      },
      {
        code: '01-01-10-P04',
        stepCount: 6,
        fragments: ['试桩位置', '搅拌参数', '喷浆量', '复搅深度', '成桩检测', '参数签认'],
      },
      {
        code: '01-01-11-P04',
        stepCount: 6,
        fragments: ['试桩布置', '振冲电流', '填料量', '密实电流', '地基检测', '参数签认'],
      },
      {
        code: '01-01-12-P04',
        stepCount: 6,
        fragments: ['混合料配合比', '坍落度', '泵送压力', '试成桩', '充盈系数', '参数签认'],
      },
      {
        code: '01-01-13-P04',
        stepCount: 6,
        fragments: ['试桩参数', '锤击能量', '贯入度', '终压值', '承载力验证', '参数签认'],
      },
      {
        code: '01-02-02-P06',
        stepCount: 6,
        fragments: ['养护覆盖', '温湿记录', '试块留置', '同条件养护', '强度报告', '放行签认'],
      },
      {
        code: '01-02-03-P02',
        stepCount: 6,
        fragments: ['基底清理', '标高控制', '垫层厚度', '混凝土浇筑', '表面收平', '隐蔽签认'],
      },
      {
        code: '01-02-03-P08',
        stepCount: 6,
        fragments: ['养护覆盖', '测温记录', '试块留置', '同条件养护', '裂缝检查', '放行签认'],
      },
      {
        code: '01-02-04-P04',
        stepCount: 6,
        fragments: ['杯口模板', '柱脚预埋', '坍落度', '振捣密实', '养护覆盖', '浇筑记录'],
      },
      {
        code: '01-02-05-P04',
        stepCount: 6,
        fragments: ['柱脚模板', '钢筋预埋', '混凝土浇筑', '振捣密实', '养护覆盖', '隐蔽记录'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens diaphragm-wall, pile, steel, life-safety, water-quality, and elevator generic processes', () => {
    const expectations = [
      {
        code: '01-03-06-P06',
        stepCount: 6,
        fragments: ['吊点复核', '整幅吊装', '垂直度', '槽口保护', '入槽影像', '隐蔽验收'],
      },
      {
        code: '01-02-11-P06',
        stepCount: 6,
        fragments: ['沉管灌注', '拔管速度', '充盈系数', '坍落度', '桩顶标高', '灌注记录'],
      },
      {
        code: '01-01-10-P05',
        stepCount: 6,
        fragments: ['喷浆量', '下沉速度', '复搅深度', '电流记录', '成桩质量', '参数签认'],
      },
      {
        code: '01-01-05-P04',
        stepCount: 6,
        fragments: ['强夯夯能', '落距', '夯点偏差', '夯沉量', '检测复核', '施工记录'],
      },
      {
        code: '02-03-10-P07',
        stepCount: 6,
        fragments: ['防火涂料批次', '湿膜厚度', '测点编号', '遍间间隔', '耐火资料', '厚度记录'],
      },
      {
        code: '02-04-04-P04',
        stepCount: 6,
        fragments: ['高强螺栓终拧', '终拧标记', '焊缝探伤', '探伤比例', '缺陷返修', '验收记录'],
      },
      {
        code: '02-03-07-P06',
        stepCount: 6,
        fragments: ['张拉力', '伸长值', '张拉顺序', '分级加载', '形态偏差', '张拉记录'],
      },
      {
        code: '02-01-06-P12',
        stepCount: 6,
        fragments: ['吊点复核', '垂直度', '临时支撑锁定', '灌浆前检查', '安装影像', '交接签认'],
      },
      {
        code: '06-13-05-P07',
        stepCount: 6,
        fragments: ['试压介质', '压力等级', '保压时长', '压降记录', '接口查漏', '试压报告'],
      },
      {
        code: '06-14-06-P06',
        stepCount: 6,
        fragments: ['采样点', '检测仪校准', '硬度浊度pH', '指标阈值', '不合格复测', '水质报告'],
      },
      {
        code: '08-15-01-P05',
        stepCount: 6,
        fragments: ['防火分区', '封堵材料', '接地连续性', '接地跨接', '隐蔽影像', '封堵验收'],
      },
      {
        code: '08-10-01-P06',
        stepCount: 6,
        fragments: ['会议系统管槽', '接地跨接', '防火封堵', '隐蔽验收', '回路标识', '移交签认'],
      },
      {
        code: '10-01-12-P03',
        stepCount: 6,
        fragments: ['安全回路', '门锁回路', '限速器', '极限开关', '绝缘测试', '监检资料'],
      },
      {
        code: '10-02-03-P04',
        stepCount: 6,
        fragments: ['液压管路', '试验压力', '保压时长', '接口渗漏', '整改复测', '油路清洁'],
      },
      {
        code: '02-05-03-P05',
        stepCount: 6,
        fragments: ['焊材批次', '连接器批次', '接头位置', '外观检测', '隐蔽验收', '问题销项'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }

      for (const genericStep of ['成孔成桩或注浆过程控制', '材料机具和作业面复核', '安全回路和运行间隙复核']) {
        expect(activityText, `${expectation.code} should not remain generic ${genericStep}`)
          .not.toContain(genericStep)
      }
    }
  })

  it('deepens remaining sub-four foundation, steel, MEP, and handover processes', () => {
    const expectations = [
      {
        code: '01-02-09-P08',
        stepCount: 6,
        fragments: ['桩顶保护', '养护覆盖', '桩头标高', '成品保护', '缺陷复查', '移交签认'],
      },
      {
        code: '01-03-06-P02',
        stepCount: 6,
        fragments: ['导墙混凝土', '槽口线形', '坍落度', '分层振捣', '养护覆盖', '导墙验收'],
      },
      {
        code: '01-05-03-P05',
        stepCount: 6,
        fragments: ['碾压遍数', '压实度', '边界修整', '标高复测', '软弱点整改', '场地移交'],
      },
      {
        code: '01-06-02-P05',
        stepCount: 6,
        fragments: ['沉降缝', '伸缩缝', '缝宽控制', '填缝材料', '止水节点', '验收记录'],
      },
      {
        code: '02-03-02-P06',
        stepCount: 6,
        fragments: ['紧固件连接', '终拧标记', '扭矩抽检', '连接外观', '复测销项', '验收签认'],
      },
      {
        code: '02-03-04-P07',
        stepCount: 6,
        fragments: ['安装偏差', '轴线标高', '垂直度', '高强螺栓', '功能复测', '交接签认'],
      },
      {
        code: '02-03-10-P02',
        stepCount: 6,
        fragments: ['防火涂料批次', '型式资料', '复验取样', '粘结强度', '耐火资料', '材料放行'],
      },
      {
        code: '02-04-04-P06',
        stepCount: 6,
        fragments: ['节点防腐补刷', '除锈等级', '涂层厚度', '隐蔽影像', '防腐资料', '签认'],
      },
      {
        code: '02-04-06-P06',
        stepCount: 6,
        fragments: ['试块留置', '养护条件', '同条件试块', '强度报告', '实体复核', '放行签认'],
      },
      {
        code: '02-05-05-P07',
        stepCount: 6,
        fragments: ['浇筑前交接', '钢筋型钢', '预埋件', '隐蔽签认', '浇筑放行', '问题闭合'],
      },
      {
        code: '05-05-05-P05',
        stepCount: 6,
        fragments: ['冷热线接头', '绝缘测试', '接头密封', '温控回路', '隐蔽影像', '通电复测'],
      },
      {
        code: '06-01-02-P04',
        stepCount: 6,
        fragments: ['导流片', '消声部件', '尺寸复核', '固定间距', '风阻风险', '验收记录'],
      },
      {
        code: '06-02-02-P04',
        stepCount: 6,
        fragments: ['止回阀', '防倒流方向', '动作灵活性', '密封状态', '标识复核', '记录签认'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens roof, railing, refrigerant, grounding, alarm, shielding, and elevator sub-four processes', () => {
    const expectations = [
      {
        code: '04-01-02-P01',
        stepCount: 6,
        fragments: ['基层含水率', '平整度', '隔汽层搭接', '收头密封', '完整性检查', '隐蔽验收'],
      },
      {
        code: '04-05-02-P04',
        stepCount: 6,
        fragments: ['天沟坡向', '落水口', '淋水闭水', '节点渗漏', '整改复验', '屋面移交'],
      },
      {
        code: '04-05-05-P06',
        stepCount: 6,
        fragments: ['变形缝', '缝宽复核', '盖板固定', '泛水收口', '淋水复核', '渗漏闭合'],
      },
      {
        code: '03-12-04-P02',
        stepCount: 6,
        fragments: ['后置埋件', '基层承载', '锚固施工', '拉拔试验', '防坠安全', '安装放行'],
      },
      {
        code: '03-12-04-P06',
        stepCount: 6,
        fragments: ['护栏高度', '立杆间距', '防坠构造', '连接牢固', '偏差整改', '验收签认'],
      },
      {
        code: '03-01-03-P07',
        stepCount: 6,
        fragments: ['空鼓检查', '抽查布点', '敲击记录', '缺陷标识', '返修复验', '销项签认'],
      },
      {
        code: '06-16-04-P01',
        stepCount: 6,
        fragments: ['抽真空', '真空保压', '称量灌注', '制冷剂重量', '过热度', '运行复核'],
      },
      {
        code: '06-10-06-P01',
        stepCount: 6,
        fragments: ['辐射板', '埋地管排布', '固定间距', '压力试验', '覆盖前隐蔽', '验收签认'],
      },
      {
        code: '07-06-06-P01',
        stepCount: 6,
        fragments: ['备用电源电缆', '规格长度', '盘检资料', '敷设条件', '绝缘测试', '标识记录'],
      },
      {
        code: '07-07-03-P03',
        stepCount: 6,
        fragments: ['等电位干线', '跨接连续性', '隐蔽影像', '接地测试', '导通记录', '移交签认'],
      },
      {
        code: '08-05-02-P06',
        stepCount: 6,
        fragments: ['光缆熔接', '尾纤保护', '盘纤半径', 'OTDR', '损耗测试', '标签归档'],
      },
      {
        code: '08-14-02-P04',
        stepCount: 6,
        fragments: ['BMS控制线', '端子编号', '屏蔽接地', '通讯地址', '回路测试', '点表回写'],
      },
      {
        code: '08-15-02-P03',
        stepCount: 6,
        fragments: ['报警线缆', '牵引保护', '分区标识', '绝缘测试', '防火封堵', '回路核验'],
      },
      {
        code: '08-16-02-P04',
        stepCount: 6,
        fragments: ['安防报警回路', '防区编号', '线缆测试', '标签清册', '联动核对', '调试移交'],
      },
      {
        code: '08-18-09-P02',
        stepCount: 6,
        fragments: ['屏蔽壳体', '网体材料', '材质批次', '搭接导通', '见证取样', '材料放行'],
      },
      {
        code: '08-19-03-P01',
        stepCount: 6,
        fragments: ['等电位联接', '联接点清单', '跨接施工', '连续性测试', '隐蔽记录', '范围确认'],
      },
      {
        code: '10-02-09-P06',
        stepCount: 6,
        fragments: ['液压电梯悬挂装置', '悬挂状态', '安全件', '监督检验', '问题整改', '资料闭合'],
      },
      {
        code: '10-01-11-P08',
        stepCount: 6,
        fragments: ['补偿装置', '噪声振动', '复测工况', '限值判断', '整改闭合', '验收签认'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens remaining earthwork, retaining-wall, steel, concrete, and floor sub-four processes', () => {
    const expectations = [
      {
        code: '01-05-03-P02',
        stepCount: 6,
        fragments: ['表土清理', '障碍物清除', '地下管线', '外运台账', '基底保护', '场地移交'],
      },
      {
        code: '01-05-03-P03',
        stepCount: 6,
        fragments: ['挖填平衡', '调配复核', '土方方格网', '弃土利用', '标高复核', '调配记录'],
      },
      {
        code: '01-06-02-P02',
        stepCount: 6,
        fragments: ['挡土墙材料', '石材块材', '砂浆强度', '排水材料', '见证取样', '材料放行'],
      },
      {
        code: '01-07-05-P04',
        stepCount: 6,
        fragments: ['浆液配合比', '水灰比', '外加剂', '试注压力', '流动度', '参数签认'],
      },
      {
        code: '01-07-05-P08',
        stepCount: 6,
        fragments: ['封孔材料', '孔口处理', '封孔密实', '养护保护', '渗漏复查', '资料闭合'],
      },
      {
        code: '02-01-03-P11',
        stepCount: 6,
        fragments: ['养护覆盖', '保湿保温', '成品保护', '试块强度', '裂缝检查', '浇筑移交'],
      },
      {
        code: '02-01-05-P02',
        stepCount: 6,
        fragments: ['拆模条件', '同条件试块', '强度报告', '模板支撑', '缺陷检查', '拆模放行'],
      },
      {
        code: '02-03-05-P07',
        stepCount: 6,
        fragments: ['多层钢结构', '安装偏差', '垂直度', '节点连接', '功能复测', '交接签认'],
      },
      {
        code: '02-03-09-P07',
        stepCount: 6,
        fragments: ['破损补涂', '除锈等级', '涂层厚度', '防腐资料', '复测销项', '验收签认'],
      },
      {
        code: '02-03-10-P10',
        stepCount: 6,
        fragments: ['耐火极限', '厚度报告', '防火涂料验收', '检测资料', '缺陷整改', '资料组卷'],
      },
      {
        code: '02-04-06-P02',
        stepCount: 6,
        fragments: ['混凝土配合比', '坍落度', '浇筑部位', '试配报告', '入模温度', '参数签认'],
      },
      {
        code: '02-05-07-P06',
        stepCount: 6,
        fragments: ['试块留置', '型钢混凝土', '同条件养护', '强度报告', '养护记录', '放行签认'],
      },
      {
        code: '02-06-06-P06',
        stepCount: 6,
        fragments: ['框架整体偏差', '轴线标高', '节点连接', '卸载复测', '整改闭合', '交接签认'],
      },
      {
        code: '03-01-01-P04',
        stepCount: 6,
        fragments: ['标高控制', '坡度复核', '排水坡向', '平整度', '偏差整改', '基层移交'],
      },
      {
        code: '03-01-02-P07',
        stepCount: 6,
        fragments: ['养护覆盖', '成品保护', '强度增长', '裂缝空鼓', '污染防护', '面层移交'],
      },
      {
        code: '03-01-03-P04',
        stepCount: 6,
        fragments: ['试铺排砖', '结合层摊铺', '铺贴密实', '平整度', '空鼓预控', '铺贴记录'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens prefab, MEP commissioning, and control-system process seeds beyond generic four-step shells', () => {
    const expectations = [
      {
        code: '02-01-06-P01',
        stepCount: 6,
        fragments: ['构件拆分编号', '连接节点清单', '吊点埋件复核', '套筒位置复核', '变更闭合台账', '构件清单移交'],
      },
      {
        code: '02-01-06-P04',
        stepCount: 6,
        fragments: ['钢筋骨架尺寸', '吊点型号位置', '预埋件固定', '保护层垫块', '隐蔽影像编号', '工厂验收记录'],
      },
      {
        code: '02-01-06-P05',
        stepCount: 6,
        fragments: ['套筒规格批次', '定位胎架复核', '套筒垂直度', '出浆孔通畅', '预埋件防偏移', '隐蔽签认资料'],
      },
      {
        code: '02-01-06-P10',
        stepCount: 6,
        fragments: ['构件二维码核验', '外观裂损检查', '支垫位置标识', '堆放稳定复核', '倒运吊点保护', '接收台账移交'],
      },
      {
        code: '02-01-06-P14',
        stepCount: 6,
        fragments: ['支撑立杆间距', '可调托撑标高', '扫地杆水平杆', '梁板搁置长度', '沉降观测点', '验收签认记录'],
      },
      {
        code: '02-01-06-P15',
        stepCount: 6,
        fragments: ['构件编号方向', '吊装平衡检查', '搁置长度实测', '板缝宽度复核', '临时固定状态', '安装影像归档'],
      },
      {
        code: '02-01-06-P19',
        stepCount: 6,
        fragments: ['封仓密实检查', '灌浆料流动度', '灌浆压力记录', '出浆饱满确认', '试块编号养护', '灌浆记录移交'],
      },
      {
        code: '02-01-06-P21',
        stepCount: 6,
        fragments: ['桁架筋清理', '叠合层钢筋间距', '机电管线定位', '预留洞口复核', '隐蔽验收影像', '浇筑资料移交'],
      },
      {
        code: '06-20-01-P02',
        stepCount: 6,
        fragments: ['点表版本核对', '量程单位复核', '测点位置标识', '安装方向检查', '校验证书归集', '测点清册移交'],
      },
      {
        code: '06-20-02-P03',
        stepCount: 6,
        fragments: ['阀位行程标定', '开闭方向核验', '限位开关测试', '反馈信号比对', '手自动切换记录', '复测报告签认'],
      },
      {
        code: '06-20-02-P04',
        stepCount: 6,
        fragments: ['端子编号核对', 'DDC地址校验', '反馈状态采集', '点对点测试截图', '异常点销项', '点表回写移交'],
      },
      {
        code: '06-20-03-P05',
        stepCount: 6,
        fragments: ['场景矩阵核对', '风机启停反馈', '风阀状态复核', '风量测点记录', '压差梯度复测', '联动记录归档'],
      },
      {
        code: '05-13-04-P09',
        stepCount: 6,
        fragments: ['一二次侧边界', '循环泵状态', '调节阀开度', '供回水温差', '流量平衡记录', '运行参数移交'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens chiller commissioning, fire alarm, BMS, weak-current room, curtain wall, and waterproof checks', () => {
    const expectations = [
      {
        code: '06-16-06-P05',
        stepCount: 6,
        fragments: ['加载工况设定', '冷冻水流量', '冷却水温差', '压缩机电流', '能效参数记录', '试运行报告签认'],
      },
      {
        code: '06-18-07-P04',
        stepCount: 6,
        fragments: ['控制线端子', '膨胀阀开度', '室内外机地址', '压力温度采样', '报警反馈复测', '联调记录移交'],
      },
      {
        code: '08-15-02-P04',
        stepCount: 6,
        fragments: ['主机柜固定', '回路卡配置', '端子编号核对', '接地绝缘测试', '地址点导入', '安装验收资料'],
      },
      {
        code: '08-15-02-P05',
        stepCount: 6,
        fragments: ['手报声光点位', '模块地址编码', '消防电话插孔', '广播切换模块', '设备标签清册', '抽测记录归档'],
      },
      {
        code: '08-14-02-P05',
        stepCount: 6,
        fragments: ['DDC箱体固定', '箱内端子排', '通讯地址设置', '电源接地测试', '箱门标识编号', '控制箱验收记录'],
      },
      {
        code: '08-10-02-P04',
        stepCount: 6,
        fragments: ['主机矩阵安装', '话筒单元编号', '音视频接口', '控制软件配置', '场景预设测试', '设备清单移交'],
      },
      {
        code: '08-18-10-P04',
        stepCount: 6,
        fragments: ['供配电状态', '空调温湿度', '消防报警点', '门禁监控联动', '动环告警记录', '系统调试报告'],
      },
      {
        code: '03-09-01-P08',
        stepCount: 6,
        fragments: ['胶缝基层清洁', '泡沫棒深度', '胶缝宽厚比', '打胶连续饱满', '表面修整检查', '相容性资料归档'],
      },
      {
        code: '03-09-01-P09',
        stepCount: 6,
        fragments: ['淋水分区编号', '喷淋压力时长', '室内渗漏巡查', '渗漏点标识', '整改复淋记录', '幕墙验收资料'],
      },
      {
        code: '04-03-01-P08',
        stepCount: 6,
        fragments: ['试验分区编号', '水位高度标识', '观察时长记录', '渗漏点定位', '修补复验影像', '防水验收签认'],
      },
      {
        code: '01-07-03-P06',
        stepCount: 6,
        fragments: ['洞口接口清理', '止水构造复核', '密封材料批次', '节点闭合检查', '渗漏复测记录', '防水资料移交'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens water, HVAC, refrigeration, and public-broadcast commissioning process shells', () => {
    const expectations = [
      {
        code: '05-06-02-P08',
        stepCount: 6,
        fragments: ['消火栓编号核对', '出水压力复测', '水带接口检查', '阀门启闭复查', '问题整改复测', '交接资料签认'],
      },
      {
        code: '05-06-03-P07',
        stepCount: 6,
        fragments: ['调试问题清单', '冲洗压力复核', '排放状态复测', '阀门状态复查', '整改影像归档', '复测签认闭合'],
      },
      {
        code: '06-01-07-P01',
        stepCount: 6,
        fragments: ['测点布置复核', '风量目标确认', '风阀状态清单', '仪表校验证书', '分区调试边界', '记录表单交底'],
      },
      {
        code: '06-02-08-P01',
        stepCount: 6,
        fragments: ['排风分区边界', '测点风口清单', '风机工况确认', '支路平衡目标', '串味风险点', '调试记录模板'],
      },
      {
        code: '06-06-10-P01',
        stepCount: 6,
        fragments: ['精度目标冻结', '温湿度测点', '压差边界确认', '传感器校验', '连续运行时段', '偏差处理台账'],
      },
      {
        code: '06-10-09-P01',
        stepCount: 6,
        fragments: ['试压分段边界', '冷凝水坡度', '排水点核对', '冲洗排放路径', '漏水复测点', '调试记录签认'],
      },
      {
        code: '06-13-07-P01',
        stepCount: 6,
        fragments: ['地埋侧边界', '流量平衡目标', '水温测点计划', '热泵工况表', '切换策略确认', '异常复测台账'],
      },
      {
        code: '06-16-06-P01',
        stepCount: 6,
        fragments: ['制冷系统边界', '冷媒水路状态', '负荷工况设定', '保护参数清单', '仪表校验', '试运行记录表'],
      },
      {
        code: '06-17-08-P01',
        stepCount: 6,
        fragments: ['真空状态复核', '溴化锂液位', '蒸汽热水边界', '吸收器工况', '结晶风险控制', '调试签认表'],
      },
      {
        code: '08-09-04-P01',
        stepCount: 6,
        fragments: ['分区矩阵核对', '强切回路清单', '功放容量复核', '消防联动场景', '广播音量测点', '问题销项表'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens BMS labeling, drainage handover, waterproof, roof, and finish curing process shells', () => {
    const expectations = [
      {
        code: '08-14-02-P02',
        stepCount: 6,
        fragments: ['DDC线缆路径', '桥架管路线', '牵引保护措施', '强弱电间距', '屏蔽接地检查', '作业面移交'],
      },
      {
        code: '08-14-02-P06',
        stepCount: 6,
        fragments: ['回路编号规则', '端子标签核对', '点表映射校验', '永久标识粘贴', '竣工图同步', '抽查复核记录'],
      },
      {
        code: '08-14-09-P09',
        stepCount: 6,
        fragments: ['试运行数据汇总', '报警事件抽查', '趋势曲线复核', '用户权限移交', '缺陷复测闭合', '验收签认包'],
      },
      {
        code: '05-07-01-P07',
        stepCount: 6,
        fragments: ['坡度流向复核', '通球通水复测', '接口渗漏复查', '检查井连通确认', '整改闭合记录', '交接签认'],
      },
      {
        code: '01-07-02-P06',
        stepCount: 6,
        fragments: ['节点试水分区', '水位时长记录', '穿墙管观察', '施工缝巡查', '渗漏点定位', '修补复验签认'],
      },
      {
        code: '04-01-01-P04',
        stepCount: 6,
        fragments: ['屋面坡向复核', '雨水口标高', '找坡厚度测点', '低洼积水排查', '偏差整改复测', '验收资料签认'],
      },
      {
        code: '04-03-03-P03',
        stepCount: 6,
        fragments: ['成膜时间记录', '厚度抽测复核', '节点附加层保护', '污染破损巡查', '养护条件确认', '下道放行签认'],
      },
      {
        code: '03-04-05-P05',
        stepCount: 6,
        fragments: ['胶材批次核对', '相容性报告', '基材清洁确认', '样板打胶观察', '污染风险复核', '施工放行签认'],
      },
      {
        code: '03-02-01-P07',
        stepCount: 6,
        fragments: ['养护起止记录', '湿润覆盖检查', '开裂空鼓巡查', '强度增长复核', '污染保护措施', '移交条件确认'],
      },
      {
        code: '03-02-03-P06',
        stepCount: 6,
        fragments: ['养护环境记录', '表面清洗控制', '纹理保护检查', '色差污染复核', '缺陷修补闭合', '观感移交签认'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have activity-step children`)
        .toHaveLength(expectation.stepCount)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(expectation.stepCount)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens additional MEP, intelligent, roof-detail, and finish-safety thin processes', () => {
    const expectations = [
      {
        code: '03-04-04-P01',
        fragments: ['特种门图纸型号', '洞口尺寸门框预埋件', '五金闭门器顺序器', '样板门安装偏差', '专项验收资料'],
      },
      {
        code: '03-12-04-P07',
        fragments: ['护栏扶手受力点位', '连接件锚固深度', '抗水平荷载测试', '松动变形开裂', '安全验收签认'],
      },
      {
        code: '04-01-03-P02',
        fragments: ['基层含水率', '阴阳角管根', '干燥度检测记录', '修补打磨清理', '隔离层施工条件'],
      },
      {
        code: '04-01-03-P03',
        fragments: ['隔离层铺设方向', '搭接宽度错缝', '转角管根水落口', '褶皱破损污染点', '隐蔽影像记录'],
      },
      {
        code: '04-05-01-P04',
        fragments: ['檐口试水范围', '淋水水量时长', '滴水线泛水收头', '渗漏污染问题', '试水记录影像'],
      },
      {
        code: '04-05-05-P01',
        fragments: ['变形缝设计宽度', '两侧基层标高', '防水附加层收头', '缝内杂物积水', '节点隐蔽影像'],
      },
      {
        code: '04-05-11-P01',
        fragments: ['屋顶窗洞口尺寸', '防水翻边高度', '排水槽泛水板', '洞口偏差', '安装界面移交'],
      },
      {
        code: '05-10-06-P01',
        fragments: ['回用系统调试范围', '阀门泵组', '水质检测项目', '试运行参数', '调试报告签认'],
      },
      {
        code: '05-12-04-P01',
        fragments: ['水景调试范围', '漏电保护状态', '防滑隔离措施', '喷水高度水形效果', '运行移交签认'],
      },
      {
        code: '06-03-02-P02',
        fragments: ['防火阀排烟阀', '型式报告', '动作温度', '风管耐火材料', '进场使用放行'],
      },
      {
        code: '06-04-09-P01',
        fragments: ['粉尘源工况', '防爆附件状态', '除尘效率', '联锁功能记录', '调试资料签认'],
      },
      {
        code: '06-07-02-P07',
        fragments: ['净化部件编号', '洁净保护状态', '端口封闭复测', '返修更换', '移交清册'],
      },
      {
        code: '06-11-03-P01',
        fragments: ['冷热水系统冲洗分区', '排污路径过滤器', '水质浊度', '二次冲洗', '试压调试界面'],
      },
      {
        code: '06-12-03-P01',
        fragments: ['冷却水管网冲洗范围', '排污口临时管线', '水质观察记录', '复冲洗', '水处理调试移交'],
      },
      {
        code: '06-17-03-P01',
        fragments: ['真空试验范围', '检漏仪器校验证书', '保压记录', '泄漏点定位', '溶液加灌条件'],
      },
      {
        code: '06-18-06-P01',
        fragments: ['追加充注量计算', '制冷剂型号', '真空保压', '分次充注重量', '充注标签'],
      },
      {
        code: '07-04-02-P01',
        fragments: ['电动机铭牌功率', '电缆规格保护整定', '相序绝缘', '点动试转', '检查接线资料'],
      },
      {
        code: '07-06-09-P01',
        fragments: ['备用电源接地系统图', 'UPS EPS柜体', '接地干线截面', '接地电阻连续性', '接地标识'],
      },
      {
        code: '08-01-02-P01',
        fragments: ['软件版本授权', '接口协议点表', '数据库备份策略', '软件部署参数', '版本基线配置'],
      },
      {
        code: '08-05-02-P01',
        fragments: ['铜缆光纤规格', '转弯半径', '牵引张力', '线缆标签', '隐蔽验收签认'],
      },
      {
        code: '08-12-03-P01',
        fragments: ['时钟系统机房', 'GPS北斗授时', '母钟子钟设备', 'NTP接口', '授时基线资料'],
      },
      {
        code: '05-01-08-P04',
        fragments: ['消毒浸泡分区', '药剂浓度', '循环泵阀门', '余氯浊度', '复消毒'],
      },
      {
        code: '05-05-05-P01',
        fragments: ['供电容量', '漏电保护参数', '发热电缆', '温控器点位', '试运行记录'],
      },
      {
        code: '05-05-05-P08',
        fragments: ['填充层厚度', '发热元件保护层', '温控线保护', '养护期间', '成品保护移交'],
      },
      {
        code: '05-08-03-P01',
        fragments: ['供热检查井轴线', '固定墩位置', '伸缩补偿界面', '基底承载', '土建作业放行'],
      },
      {
        code: '05-08-03-P03',
        fragments: ['固定墩钢筋模板', '混凝土浇筑坍落度', '管道锚固件', '养护保温防冻', '管道安装界面'],
      },
      {
        code: '05-13-01-P08',
        fragments: ['烘炉煮炉方案', '安全阀压力表', '炉墙干燥记录', '煮炉加药排污', '运行放行签认'],
      },
      {
        code: '06-09-09-P01',
        fragments: ['真空吸尘调试范围', '快速接口状态', '系统负压测点', '吸尘效率', '调试资料签认'],
      },
      {
        code: '06-10-03-P01',
        fragments: ['冷凝水冲洗排放范围', '临时排水条件', '积水风险巡查', '通水复测记录', '吊顶封闭前签认'],
      },
      {
        code: '06-14-08-P01',
        fragments: ['水源热泵调试范围', '取退水边界', '水质', '制热制冷切换', '调试报告签认'],
      },
      {
        code: '06-15-05-P01',
        fragments: ['蓄水罐基础尺寸', '蓄能容量', '检修空间', '温度分层测点', '隐蔽资料留存'],
      },
      {
        code: '06-15-05-P08',
        fragments: ['蓄放能模式', '温度分层目标', '趋势采集', '温度混层', '运行移交签认'],
      },
      {
        code: '06-19-07-P01',
        fragments: ['太阳能系统调试边界', '防冻保护状态', '集热温度', '晴阴工况', '运行签认'],
      },
      {
        code: '07-04-02-P04',
        fragments: ['电加热器容量', '限温保护', '绝缘电阻', '升温曲线', '接线验收签认'],
      },
      {
        code: '07-01-10-P06',
        fragments: ['室外照明回路编号', '亮灯率照度', '防水接线盒', '光控远程控制', '移交资料签认'],
      },
      {
        code: '07-03-02-P09',
        fragments: ['母线槽回路编号', '接地连续性', '送电试运行', '防火封堵', '运维边界移交'],
      },
      {
        code: '05-05-04-P08',
        fragments: ['地暖填充层', '温湿度', '盘管保护', '裂缝空鼓', '成品保护签认'],
      },
      {
        code: '05-05-08-P01',
        fragments: ['热计量调控', '温控阀', '供回水温度', '数据上传接口', '调控资料签认'],
      },
      {
        code: '06-01-02-P05',
        fragments: ['风阀部件编号', '启闭动作灵活性', '开度标识', '卡滞问题', '安装移交签认'],
      },
      {
        code: '06-02-07-P07',
        fragments: ['排风支路', '风口风量', '止回阀防串味', '异常气味', '排风系统签认'],
      },
      {
        code: '06-05-02-P04',
        fragments: ['消声静压箱', '检修口尺寸', '吸声材料', '箱体密封', '问题销项签认'],
      },
      {
        code: '06-10-05-P01',
        fragments: ['热交换器基础标高', '设备铭牌参数', '排污接口', '检修空间', '安装放行签认'],
      },
      {
        code: '06-10-05-P03',
        fragments: ['热交换器吊装', '水平度复测', '地脚螺栓', '支吊架状态', '质量验收签认'],
      },
      {
        code: '06-13-03-P01',
        fragments: ['地源侧管网分区', '埋地换热回路', '集分水器', '冲洗浊度', '复冲洗'],
      },
      {
        code: '06-14-06-P01',
        fragments: ['水质检测报告', '除垢设备型号', '药剂投加', '设备压差记录', '投用签认'],
      },
      {
        code: '07-05-06-P01',
        fragments: ['钢索配线路径', '锚固件规格', '钢索张力', '接地状态复测', '安装放行签认'],
      },
      {
        code: '08-03-04-P01',
        fragments: ['号码规划', '语音网关', '分机注册', '故障告警', '运维资料签认'],
      },
      {
        code: '08-05-06-P01',
        fragments: ['网管软件版本授权', '端口资产', '账号权限', '日志路径', '软件验收签认'],
      },
      {
        code: '08-13-03-P01',
        fragments: ['部署架构', '网络安全策略', '备份策略', '服务启动日志', '验收资料签认'],
      },
      {
        code: '06-10-05-P09',
        fragments: ['热交换器', '换热效率', '过滤器状态', '保温缺陷', '运维边界'],
      },
      {
        code: '06-14-03-P01',
        fragments: ['水源侧管网冲洗', '取退水边界', '临时过滤', '复冲洗', '调试移交'],
      },
      {
        code: '06-15-03-P01',
        fragments: ['蓄能系统冲洗', '蓄水罐边界', '温度分层保护', '阀门卡涩', '蓄放能调试'],
      },
      {
        code: '06-15-05-P03',
        fragments: ['蓄水罐吊装', '水平度复测', '二次灌浆', '检修空间', '安装验收签认'],
      },
      {
        code: '06-17-04-P01',
        fragments: ['溴化锂溶液', '安全防护措施', '计量器具校验', '结晶风险', '真空试验资料'],
      },
      {
        code: '07-05-01-P09',
        fragments: ['照明配电箱柜', '箱内接线端子', '通电试运行', '竣工图', '运维移交签认'],
      },
      {
        code: '07-05-09-P02',
        fragments: ['应急照明疏散指示', '集中电源容量', '疏散路径', '持续供电时间', '安装使用放行'],
      },
      {
        code: '07-05-11-P06',
        fragments: ['室内照明通电', '照度功率密度', '回路标签', '眩光问题', '使用移交签认'],
      },
      {
        code: '07-06-04-P09',
        fragments: ['备用电源母线槽', '接地连续性', '切换送电', '防火封堵', '应急供电运维'],
      },
      {
        code: '07-07-03-P08',
        fragments: ['等电位连接点', '导通测试记录', '隐蔽影像', '漏标错标', '防雷接地移交'],
      },
      {
        code: '08-03-01-P06',
        fragments: ['语音线缆回路', '配线架模块', '号码端口映射', '错标漏标', '永久标识清册'],
      },
      {
        code: '08-03-05-P07',
        fragments: ['运维账号', '配置备份', '故障告警', '密码策略', '系统接管签认'],
      },
      {
        code: '08-04-04-P07',
        fragments: ['网络安全策略', '白名单备份', '端口扫描', '误拦截', '变更记录'],
      },
      {
        code: '08-04-06-P07',
        fragments: ['试运行配置备份', '核心交换', '故障切换', '告警策略', '备份介质'],
      },
      {
        code: '08-07-01-P02',
        fragments: ['卫星天线', '方位角仰角', '防雷接地', '载噪比', '运营商资料'],
      },
      {
        code: '08-08-04-P01',
        fragments: ['频道清单', '信号源', '终端电平', '图像声音', '用户端移交'],
      },
      {
        code: '08-12-02-P04',
        fragments: ['RS485总线', '端接电阻', '子钟同步', '地址冲突', '系统调试移交'],
      },
      {
        code: '08-13-02-P01',
        fragments: ['线缆规格', '接口协议', '强弱电间距', '测试计划', '敷设放行签认'],
      },
      {
        code: '08-17-02-P01',
        fragments: ['应急响应软件', '联动对象', '报警策略', '接口连通测试', '验收签认'],
      },
      {
        code: '08-18-08-P01',
        fragments: ['机房装修方案', '防火等级', '设备搬入路径', '防火封堵', '安装界面移交'],
      },
      {
        code: '10-02-12-P09',
        fragments: ['液压电梯竣工资料', '监督检验报告', '安全部件', '使用登记接口', '使用单位签认'],
      },
      {
        code: '08-02-01-P01',
        fragments: ['运营商进场范围', '机房接入位置', '现场交底记录', '安全条件检查', '施工界面移交'],
      },
      {
        code: '08-02-01-P02',
        fragments: ['接入机房空间', '电源接地', '接口资料', '条件签认', '责任边界归档'],
      },
      {
        code: '08-02-01-P03',
        fragments: ['点位开放', '接入设备', '带宽质量', '联调问题', '运维信息归集'],
      },
      {
        code: '08-02-01-P04',
        fragments: ['测试报告', '端口编号', '账号权限', '版本回写', '遗留事项闭合'],
      },
      {
        code: '08-07-01-P01',
        fragments: ['天线安装区域', '承载接地', '馈线通道', '进场交底', '风险事项闭合'],
      },
      {
        code: '08-07-01-P03',
        fragments: ['方位仰角', '接地连续性', '载噪比', '联调缺陷', '运维边界签认'],
      },
      {
        code: '08-07-01-P04',
        fragments: ['链路测试报告', '天线馈线编号', '防雷接地', '服务边界', '遗留问题闭合'],
      },
      {
        code: '08-08-01-P01',
        fragments: ['安装高度', '接地跨接', '弱电间距', '隐蔽影像', '问题闭合签认'],
      },
      {
        code: '08-09-01-P01',
        fragments: ['广播线路', '接地跨接', '消防广播强切', '穿墙封堵', '隐蔽验收记录'],
      },
      {
        code: '08-10-01-P01',
        fragments: ['会议室点位', '屏蔽接地', '音视频线缆', '检修空间', '整改复查签认'],
      },
      {
        code: '08-12-01-P01',
        fragments: ['母钟子钟', '接地跨接', '授时天线馈线', '预留容量', '资料闭合签认'],
      },
      {
        code: '08-17-01-P01',
        fragments: ['应急设备点位', '供电网络', '地址编码', '报警联动接口', '问题闭合'],
      },
      {
        code: '06-20-01-P01',
        fragments: ['传感器点位', '取样条件', '接线地址', '单点读数校验', '问题闭合签认'],
      },
      {
        code: '06-20-02-P01',
        fragments: ['执行机构点位', '安装方向', '手自动切换', '行程限位', '闭合签认'],
      },
      {
        code: '06-20-04-P01',
        fragments: ['软件版本', '通讯链路', '点表导入', '历史趋势报警', '备份留存'],
      },
      {
        code: '10-01-01-P01',
        fragments: ['随机资料', '安全部件', '箱件编号', '证书缺项', '进场验收记录'],
      },
      {
        code: '10-02-01-P01',
        fragments: ['液压泵站', '阀组证明', '箱件编号', '油品资料', '补证闭合'],
      },
      {
        code: '10-03-01-P01',
        fragments: ['部件合格证明', '梯级扶手带', '包装状态', '主机桁架', '缺项闭合'],
      },
      {
        code: '04-05-03-P01',
        fragments: ['泛水高度', '墙根基层', '附加层铺设', '淋水检查', '影像记录闭合'],
      },
      {
        code: '04-05-04-P01',
        fragments: ['水落口标高', '附加层', '雨水篦子', '排水通畅性', '检查记录闭合'],
      },
      {
        code: '04-05-06-P01',
        fragments: ['套管高度', '圆弧处理', '泛水收头', '防水保护', '渗漏检查'],
      },
      {
        code: '03-12-01-P01',
        fragments: ['柜体深化尺寸', '基层平整度', '五金规格', '收口复查', '移交签认'],
      },
      {
        code: '03-12-05-P01',
        fragments: ['花饰排版', '连接件规格', '防坠措施', '色差污染整改', '资料签认'],
      },
      {
        code: '06-04-02-P01',
        fragments: ['除尘部件加工图', '磨蚀工况', '防爆泄压', '加工尺寸', '放行记录'],
      },
      {
        code: '06-04-02-P02',
        fragments: ['防静电软接', '阻燃防静电', '安装方向', '密封面', '入库标识'],
      },
      {
        code: '06-04-04-P02',
        fragments: ['耐磨叶轮', '防爆等级', '动平衡', '接线盒密封', '缺陷整改闭合'],
      },
      {
        code: '06-07-02-P02',
        fragments: ['过滤等级', '洁净包装', '密封面', '安装方向', '洁净保护'],
      },
      {
        code: '06-07-02-P05',
        fragments: ['组装区域清洁', '启闭方向', '连接密封', '整改复测', '安装移交签认'],
      },
      {
        code: '06-10-02-P09',
        fragments: ['冷凝水泵组', '备用切换', '振动噪声', '报警异常', '运维移交签认'],
      },
      {
        code: '06-10-07-P02',
        fragments: ['热泵机组', '控制接口', '基础接口', '成品保护', '缺项补正闭合'],
      },
      {
        code: '06-16-01-P02',
        fragments: ['制冷机组', '控制柜外观', '随机附件', '检修空间', '缺损项闭合签认'],
      },
      {
        code: '07-01-05-P02',
        fragments: ['电缆盘规格', '绝缘耐压', '外护套', '弯曲半径', '标识入库签认'],
      },
      {
        code: '07-06-03-P09',
        fragments: ['UPS/EPS', '电池组容量', '逆变切换', '告警通讯', '应急电源运维'],
      },
      {
        code: '08-05-01-P08',
        fragments: ['综合布线桥架', '防火封堵', '强弱电间距', '标识缺失', '线缆敷设界面'],
      },
      {
        code: '08-05-02-P03',
        fragments: ['分层规则', '牵引张力', '标签编号', '错路由', '敷设记录'],
      },
      {
        code: '08-06-01-P03',
        fragments: ['POI或RRU', '传输接口', '运营商参数', '防雷条件', '安装放行签认'],
      },
      {
        code: '08-07-01-P06',
        fragments: ['卫星通信界面', '防雷接地资料', '运营商服务资料', '遗留问题', '运维签认闭合'],
      },
      {
        code: '08-08-02-P05',
        fragments: ['终端电平抽测', '衰减值', '载噪比', '低电平串扰', '用户端口资料'],
      },
      {
        code: '08-13-05-P08',
        fragments: ['运维移交范围', '配置备份', '数据备份恢复', '应急联系人', '系统接管签认'],
      },
      {
        code: '08-16-02-P07',
        fragments: ['安防线缆标签', '回路编号', '竣工图一致性', '错标漏标', '移交签认'],
      },
      {
        code: '08-19-08-P07',
        fragments: ['运维资料移交', '控制逻辑', '报警通知', '参数调整记录', '系统接管签认'],
      },
      {
        code: '10-01-01-P07',
        fragments: ['缺损件登记', '缺项拍照记录', '补件补证', '成品保护', '缺损闭合归档'],
      },
      {
        code: '10-03-01-P07',
        fragments: ['箱件清单', '梯级扶手带', '包装破损', '保管条件', '缺项闭合归档'],
      },
      {
        code: '05-01-05-P07',
        fragments: ['给水防腐', '涂层厚度', '阀门支架', '整改', '交接签认'],
      },
      {
        code: '05-01-06-P06',
        fragments: ['绝热节能', '接缝严密性', '结露破损', '整改复测', '交接签认'],
      },
      {
        code: '05-02-04-P08',
        fragments: ['排水试验', '通球灌水', '通气管', '坡度异常', '资料归档'],
      },
      {
        code: '05-04-03-P08',
        fragments: ['卫生器具', '存水弯', '防返味', '器具晃动', '交接签认'],
      },
      {
        code: '05-11-02-P12',
        fragments: ['水处理系统', '过滤消毒', '水质检测', '药剂投加', '培训记录'],
      },
      {
        code: '05-13-01-P12',
        fragments: ['锅炉系统', '安全附件', '烘炉煮炉', '超温', '运行参数'],
      },
      {
        code: '06-01-05-P07',
        fragments: ['送风系统防腐', '涂层厚度', '补涂', '整改复测', '交接签认'],
      },
      {
        code: '06-02-07-P08',
        fragments: ['厨房卫生间排风', '止回阀', '防串味', '阀件失效', '交接签认'],
      },
      {
        code: '06-04-07-P08',
        fragments: ['除尘联动吸尘罩', '联动启停', '防爆泄压', '粉尘外逸', '运维移交'],
      },
      {
        code: '06-05-07-P08',
        fragments: ['附属设备', '紫外灭菌器', '维护参数', '维护空间', '参数签认'],
      },
      {
        code: '06-06-07-P11',
        fragments: ['电加热加湿', '电气保护', '联锁报警', '结垢漏水', '运维资料'],
      },
      {
        code: '06-08-06-P12',
        fragments: ['人防专项验收', '过滤吸收器', '密闭性能', '整改闭合', '质量移交'],
      },
      {
        code: '06-10-06-P09',
        fragments: ['辐射末端', '分集水器', '表面温度', '温控异常', '交接签认'],
      },
      {
        code: '06-15-05-P09',
        fragments: ['蓄水罐', '温度测点', '温度分层', '混层泄漏', '运维移交'],
      },
      {
        code: '06-17-04-P09',
        fragments: ['溴化锂溶液', '真空状态', '结晶风险', '浓度偏差', '运行移交'],
      },
      {
        code: '08-01-01-P08',
        fragments: ['集成硬件', '接口状态', '网络连通', '离线告警', '交接签认'],
      },
      {
        code: '08-05-08-P07',
        fragments: ['综合布线试运行', '链路测试', '问题销项', '竣工图', '移交签认'],
      },
      {
        code: '08-09-05-P06',
        fragments: ['公共广播', '消防强切', '分区切换', '错区无声', '资料移交'],
      },
      {
        code: '08-11-03-P12',
        fragments: ['信息导引显示', '远程发布', '花屏黑屏', '错播', '交接签认'],
      },
      {
        code: '08-18-06-P08',
        fragments: ['监控安防', '审计日志', '录像存储', '越权', '账号资料移交'],
      },
      {
        code: '06-02-02-P03',
        fragments: ['排风部件加工图', '咬口法兰', '严密性', '分区堆放', '验收签认'],
      },
      {
        code: '06-02-06-P07',
        fragments: ['吸风罩缺陷', '集气边界', '风量捕集', '整改影像', '销项'],
      },
      {
        code: '06-04-02-P03',
        fragments: ['耐磨防爆', '焊缝坡口', '泄爆口', '防静电跨接', '验收资料'],
      },
      {
        code: '06-04-06-P12',
        fragments: ['除尘排污', '排污阀', '负压泄漏', '备件资料', '运维资料签认'],
      },
      {
        code: '06-05-08-P07',
        fragments: ['末端设备', '冷凝水排放', '阀件动作', '设备台账', '交接签认'],
      },
      {
        code: '06-06-02-P01',
        fragments: ['恒温恒湿', '传感器接口', '气密等级', '图纸会签', '资料闭合'],
      },
      {
        code: '06-07-02-P06',
        fragments: ['净化风管端口', '封堵材料', '气流等级', '污染风险', '编号台账'],
      },
      {
        code: '06-08-04-P02',
        fragments: ['人防通风机', '防爆波阀', '密闭面', '补证', '台账闭合'],
      },
      {
        code: '06-10-06-P04',
        fragments: ['辐射板', '弯曲半径', '伸缩补偿', '压力保持', '隐蔽验收'],
      },
      {
        code: '08-03-01-P03',
        fragments: ['语音线缆', '弯曲半径', '线序', '端口台账', '闭合签认'],
      },
      {
        code: '08-05-02-P08',
        fragments: ['路由图', '配线架映射', '隐蔽影像', '竣工图版本', '端口台账'],
      },
      {
        code: '08-08-02-P03',
        fragments: ['分支分配器', 'F头压接', '接地跨接', '端口电平', '压接质量'],
      },
      {
        code: '08-09-02-P02',
        fragments: ['广播分区', '防火分区', '回路通断', '分区音源', '闭合签认'],
      },
      {
        code: '08-10-02-P02',
        fragments: ['接口矩阵', '抗干扰距离', '话筒拾音', '端口连通', '端口台账'],
      },
      {
        code: '08-12-02-P02',
        fragments: ['授时接口', '终端电阻', '子钟同步', '故障显示', '点位台账'],
      },
      {
        code: '08-13-02-P02',
        fragments: ['牵引路径', '防火封堵', '牵引工具', '样段敷设', '测试计划'],
      },
      {
        code: '08-14-02-P09',
        fragments: ['BMS点表', '屏蔽接地', '通信状态', '地址冲突', '运维台账'],
      },
      {
        code: '05-03-02-P02',
        fragments: ['辅助设备', '铭牌型号', '检修空间', '补正复查', '设备台账'],
      },
      {
        code: '05-04-04-P08',
        fragments: ['卫生器具', '水封高度', '成品保护', '试验记录', '资料签认'],
      },
      {
        code: '05-05-04-P05',
        fragments: ['伸缩缝', '边界保温条', '保护套管', '隐蔽影像', '资料闭合'],
      },
      {
        code: '05-07-02-P07',
        fragments: ['排水管沟', '爬梯', '倒坡', '井池台账', '资料闭合'],
      },
      {
        code: '05-12-01-P09',
        fragments: ['水景喷泉', '排空防冻', '专项试验', '运维台账', '资料闭合'],
      },
      {
        code: '03-01-02-P02',
        fragments: ['找平层', '分格缝', '摊铺厚度', '空鼓裂缝', '验收资料'],
      },
      {
        code: '04-01-01-P03',
        fragments: ['屋面找坡', '坡度标高', '压实度', '积水点', '隐蔽验收'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have five field activity steps`)
        .toHaveLength(5)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(5)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens remaining thin 03 to 08 standard processes across finish, envelope, MEP, and weak-current work', () => {
    const expectations = [
      {
        code: '03-01-01-P03',
        fragments: ['虚铺厚度', '含水率抽测', '压实机具', '压实系数', '隐蔽验收'],
      },
      {
        code: '03-01-01-P06',
        fragments: ['基层标高', '松散积水', '养护覆盖', '移交界面', '放行签认'],
      },
      {
        code: '03-01-02-P01',
        fragments: ['油污浮浆', '凿毛深度', '湿润界面', '清理影像', '作业面移交'],
      },
      {
        code: '03-01-02-P03',
        fragments: ['水泥砂石', '试拌配比', '塌落扩展', '留样编号', '配合比放行'],
      },
      {
        code: '03-01-02-P06',
        fragments: ['收光时机', '平整度靠尺', '压痕起砂', '边角收口', '养护交接'],
      },
      {
        code: '03-01-03-P01',
        fragments: ['基层空鼓', '平整度偏差', '找补打磨', '含水率', '铺贴放行'],
      },
      {
        code: '03-01-03-P02',
        fragments: ['结合层材料', '砂浆稠度', '界面剂', '试铺样段', '材料放行'],
      },
      {
        code: '03-01-04-P01',
        fragments: ['木竹材料', '含水率抽测', '变形色差', '防潮包装', '进场复验'],
      },
      {
        code: '03-01-04-P03',
        fragments: ['龙骨间距', '垫木防腐', '粘结层厚度', '平整度', '隐蔽验收'],
      },
      {
        code: '03-12-04-P01',
        fragments: ['栏杆高度', '防坠净距', '预埋件', '节点样板', '深化尺寸'],
      },
      {
        code: '04-01-01-P06',
        fragments: ['养护起止', '表面裂缝', '平整度', '积水点', '移交资料'],
      },
      {
        code: '04-01-01-P07',
        fragments: ['坡向坡度', '排水口', '找坡找平', '蓄水', '防水放行'],
      },
      {
        code: '04-01-03-P01',
        fragments: ['隔汽隔离', '搭接宽度', '基层干燥', '节点样板', '进场复验'],
      },
      {
        code: '04-01-03-P05',
        fragments: ['褶皱空鼓', '破损切补', '搭接压实', '转角收头', '连续性复测'],
      },
      {
        code: '04-01-03-P06',
        fragments: ['厚度坡向', '搭接密封', '穿屋面管根', '问题销项', '实测复核'],
      },
      {
        code: '04-02-04-P02',
        fragments: ['发泡剂水泥', '设计密度', '试配试块', '泵送压力', '配合比签认'],
      },
      {
        code: '04-04-02-P03',
        fragments: ['起始线', '分层错缝', '钉距', '泛水天沟', '铺贴影像'],
      },
      {
        code: '04-04-02-P05',
        fragments: ['脊瓦中心线', '斜脊搭接', '封闭砂浆', '端部收口', '淋水复查'],
      },
      {
        code: '05-02-03-P09',
        fragments: ['除锈除污', '涂层遍数', '漏涂流挂', '管卡支架', '隐蔽移交'],
      },
      {
        code: '05-03-03-P08',
        fragments: ['涂层厚度', '阀门法兰', '补口补伤', '色标流向', '资料归档'],
      },
      {
        code: '05-06-01-P08',
        fragments: ['通水试验', '压力波动', '渗漏点', '阀门启闭', '功能移交'],
      },
      {
        code: '05-09-04-P06',
        fragments: ['保温厚度', '接缝胶带', '防潮层', '饮用水标识', '节能签认'],
      },
      {
        code: '05-12-02-P09',
        fragments: ['补口范围', '附着力', '电火花检漏', '返修复测', '资料闭合'],
      },
      {
        code: '05-13-04-P12',
        fragments: ['换热参数', '安全阀', '控制点表', '运行培训', '资料移交'],
      },
      {
        code: '06-02-02-P06',
        fragments: ['部件规格', '咬口焊缝', '方向标识', '编号标签', '入库台账'],
      },
      {
        code: '06-02-05-P07',
        fragments: ['排风风管', '防腐遍数', '支吊架补涂', '漏涂起皮', '交接签认'],
      },
      {
        code: '06-04-08-P06',
        fragments: ['高温风管', '绝热材料', '保护层搭接', '热桥冷桥', '节能资料'],
      },
      {
        code: '06-06-02-P06',
        fragments: ['恒温恒湿', '阀件编号', '密封面', '分区标签', '入库台账'],
      },
      {
        code: '06-09-02-P01',
        fragments: ['加工图', '管径接口', '检修口', '管线碰撞', '下料制作'],
      },
      {
        code: '06-17-04-P08',
        fragments: ['泄漏点', '结晶风险', '溶液浓度', '整改复测', '运行签认'],
      },
      {
        code: '08-03-01-P02',
        fragments: ['电话线缆', '跳线批次', '盘号抽查', '导通绝缘', '布线放行'],
      },
      {
        code: '08-03-01-P05',
        fragments: ['号码标签', '整理弯曲', '端口对应', '线序错误', '台账签认'],
      },
      {
        code: '08-03-01-P08',
        fragments: ['通断测试', '导通串扰', '号码核验', '测试记录', '归档和移交'],
      },
      {
        code: '08-08-02-P06',
        fragments: ['线缆标签', '用户端口', '电平测试', '端口清册', '记录归档'],
      },
      {
        code: '08-11-02-P02',
        fragments: ['LED屏体', '信号线', '控制网线', '电源线安全', '敷设验收'],
      },
      {
        code: '08-16-02-P08',
        fragments: ['安防线缆', '绝缘导通', '摄像机门禁', '线缆清册', '归档签认'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have five field activity steps`)
        .toHaveLength(5)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(5)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens high-value remaining thin process handoff and field verification nodes', () => {
    const expectations = [
      {
        code: '02-06-07-P06',
        fragments: ['空间网格卸载', '支座标高', '杆件应力', '整体复测', '交接签认'],
      },
      {
        code: '03-01-03-P05',
        fragments: ['板块排版', '缝宽控制', '拨缝修整', '空鼓翘角', '成品保护'],
      },
      {
        code: '03-01-03-P06',
        fragments: ['勾缝材料', '灌缝饱满', '污染清洁', '缝隙复查', '验收记录'],
      },
      {
        code: '03-01-04-P02',
        fragments: ['防潮隔离', '含水率', '搭接上翻', '破损修补', '铺装放行'],
      },
      {
        code: '03-12-05-P07',
        fragments: ['锚固点补强', '空鼓脱落', '拉拔抽查', '防坠措施', '修补闭合'],
      },
      {
        code: '04-01-04-P05',
        fragments: ['分格缝定位', '切缝深度', '嵌缝密实', '养护记录', '裂缝复测'],
      },
      {
        code: '04-04-02-P04',
        fragments: ['搭接长度', '钉固间距', '抗风揭', '破损松动', '隐蔽记录'],
      },
      {
        code: '04-05-01-P05',
        fragments: ['檐口收边', '滴水构造', '节点拍照', '渗漏风险', '资料闭合'],
      },
      {
        code: '04-05-03-P04',
        fragments: ['女儿墙', '山墙泛水', '收头密封', '淋水或闭水', '渗漏整改'],
      },
      {
        code: '04-05-08-P04',
        fragments: ['过水孔', '排水路径', '附加层', '淋水或闭水', '积水堵塞'],
      },
      {
        code: '05-08-03-P08',
        fragments: ['供热土建', '基础标高', '预留孔洞', '承载条件', '交接签认'],
      },
      {
        code: '06-03-05-P07',
        fragments: ['防排烟防腐', '涂层厚度', '法兰支架', '破损漏涂', '交接签认'],
      },
      {
        code: '06-07-05-P07',
        fragments: ['净化空调防腐', '洁净保护', '涂层完整', '污染破损', '交接签认'],
      },
      {
        code: '06-08-05-P07',
        fragments: ['人防通风防腐', '密闭面', '防护涂层', '漏涂锈蚀', '交接签认'],
      },
      {
        code: '06-09-07-P08',
        fragments: ['快速接口', '卡扣密封', '启闭插拔', '泄漏松脱', '交接签认'],
      },
      {
        code: '06-17-04-P02',
        fragments: ['溴化锂溶液', '浓度复验', '批次编号', '污染沉淀', '加灌放行'],
      },
      {
        code: '06-17-04-P05',
        fragments: ['过滤器', '加灌管路', '液位真空', '泄漏结晶', '加灌记录'],
      },
      {
        code: '06-19-06-P07',
        fragments: ['填充层浇筑', '盘管压力', '厚度标高', '养护覆盖', '隐蔽验收'],
      },
      {
        code: '07-05-05-P04',
        fragments: ['固定间距', '弯曲半径', '绝缘护套', '防损伤', '隐蔽记录'],
      },
      {
        code: '08-08-03-P06',
        fragments: ['终端电平', '均衡调试', '设备软件', '频道质量', '资料移交'],
      },
      {
        code: '08-10-05-P06',
        fragments: ['会议系统', '试运行问题', '音视频复测', '销项闭合', '资料移交'],
      },
      {
        code: '08-11-02-P03',
        fragments: ['发送卡', '接收卡', '链路端接', '编号映射', '点亮测试'],
      },
      {
        code: '08-16-03-P08',
        fragments: ['图像质量', '事件记录', '设备安装', '功能复测', '交接签认'],
      },
      {
        code: '08-17-04-P07',
        fragments: ['试运行报告', '响应数据', '事件回放', '问题复测', '资料归档'],
      },
      {
        code: '10-02-07-P06',
        fragments: ['监督检验', '整改销项', '资料交接', '使用登记', '签认闭合'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have five field activity steps`)
        .toHaveLength(5)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(5)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens remaining finish, roof, HVAC, and weak-current handover thin nodes', () => {
    const expectations = [
      {
        code: '03-01-02-P09',
        fragments: ['整体面层验收', '空鼓裂缝', '强度报告', '修补打磨', '移交签认'],
      },
      {
        code: '03-01-03-P08',
        fragments: ['养护范围', '上人时间', '空鼓翘角', '成品保护', '移交签认'],
      },
      {
        code: '03-01-03-P09',
        fragments: ['板块面层验收', '缝宽高低差', '空鼓率', '返修复测', '移交签认'],
      },
      {
        code: '03-01-04-P05',
        fragments: ['拼缝宽度', '伸缩缝', '起翘异响', '堵塞问题', '成品保护'],
      },
      {
        code: '03-01-04-P06',
        fragments: ['踢脚线', '直线度', '平整度色差', '污染破损', '验收签认'],
      },
      {
        code: '04-01-04-P06',
        fragments: ['保护层成品移交', '分格缝', '积水点', '修补养护', '资料闭合'],
      },
      {
        code: '04-04-02-P07',
        fragments: ['沥青瓦', '脊瓦封闭', '破损松动', '淋水观察', '移交签认'],
      },
      {
        code: '04-05-10-P04',
        fragments: ['屋脊节点', '脊瓦搭接', '淋水或闭水', '渗漏松动', '验收签认'],
      },
      {
        code: '04-05-11-P06',
        fragments: ['屋顶窗', '防水附加层', '启闭五金', '淋水观察', '移交签认'],
      },
      {
        code: '06-04-05-P07',
        fragments: ['除尘系统防腐', '涂层厚度', '防静电跨接', '漏涂锈蚀', '交接签认'],
      },
      {
        code: '06-05-04-P07',
        fragments: ['舒适空调风机', '减振软接', '振动噪声', '异响超振', '交接签认'],
      },
      {
        code: '06-06-04-P07',
        fragments: ['恒温恒湿风机', '温湿度控制', '漏水结露', '报警异常', '交接签认'],
      },
      {
        code: '06-09-08-P07',
        fragments: ['真空吸尘设备联调', '负压管网', '堵塞报警', '控制异常', '交接签认'],
      },
      {
        code: '06-17-04-P06',
        fragments: ['溴化锂溶液循环', '液位', '稳定性', '结晶泄漏', '运行移交'],
      },
      {
        code: '07-05-05-P06',
        fragments: ['塑料护套线', '弯曲半径', '绝缘测试', '回路错接', '隐蔽移交'],
      },
      {
        code: '08-05-03-P08',
        fragments: ['柜机机架配线架', '固定接地', '端口映射', '标签缺失', '交接签认'],
      },
      {
        code: '08-05-04-P08',
        fragments: ['信息插座', '编号标签', '端接线序', '链路失败', '交接签认'],
      },
      {
        code: '08-08-05-P06',
        fragments: ['有线电视试运行', '终端电平', '图像质量', '故障整改', '资料移交'],
      },
      {
        code: '08-11-02-P06',
        fragments: ['链路标签', '屏体分区', '点亮测试', '花屏', '资料归档'],
      },
      {
        code: '08-16-06-P06',
        fragments: ['安防试运行', '录像回放', '权限异常', '复测签认', '资料闭合'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have five field activity steps`)
        .toHaveLength(5)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(5)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens HVAC equipment, roof-detail, finish, electrical, and low-current residual thin nodes', () => {
    const expectations = [
      {
        code: '03-12-05-P03',
        fragments: ['基层空鼓裂缝', '平整度', '界面剂', '修补找平', '作业面移交'],
      },
      {
        code: '03-12-05-P04',
        fragments: ['胶粘剂', '配合比', '开放时间', '试粘样块', '失效材料'],
      },
      {
        code: '03-12-05-P06',
        fragments: ['基准线', '拼缝宽度', '阴阳角', '收口胶缝', '成品保护'],
      },
      {
        code: '03-12-05-P08',
        fragments: ['污染', '颜色匹配', '打磨处理', '保护膜', '移交签认'],
      },
      {
        code: '04-02-04-P06',
        fragments: ['泡沫混凝土', '养护覆盖', '干密度', '送检记录', '整改复测'],
      },
      {
        code: '04-05-03-P05',
        fragments: ['女儿墙', '泛水高度', '密封收口', '渗漏隐患', '影像编号'],
      },
      {
        code: '04-05-08-P05',
        fragments: ['过水孔', '防水附加层', '通畅性', '堵塞隐患', '影像编号'],
      },
      {
        code: '04-05-10-P05',
        fragments: ['屋脊', '脊瓦', '密封连续性', '防风固定件', '渗漏隐患'],
      },
      {
        code: '05-09-03-P07',
        fragments: ['饮用水防腐', '底漆覆盖', '面漆厚度', '补口质量', '通水前'],
      },
      {
        code: '05-10-05-P06',
        fragments: ['中水雨水绝热', '阀件保温', '防潮层', '冷桥', '系统标识'],
      },
      {
        code: '05-13-05-P07',
        fragments: ['热源机房', '涂层遍数', '干膜厚度', '支架补涂', '缺陷修补'],
      },
      {
        code: '06-06-02-P03',
        fragments: ['恒温恒湿', '下料尺寸', '咬口法兰', '方正度', '分区堆放'],
      },
      {
        code: '06-09-02-P03',
        fragments: ['真空吸尘', '接口尺寸', '密封面', '气密外观', '分区堆放'],
      },
      {
        code: '06-10-06-P02',
        fragments: ['辐射末端', '壁厚', '盘管弯折', '抽样复验', '材料隔离'],
      },
      {
        code: '06-10-07-P09',
        fragments: ['热泵机组', '软连接', '接地连续性', '保护动作', '运行压力'],
      },
      {
        code: '06-11-02-P09',
        fragments: ['冷热水泵组', '过滤器', '电机转向', '振动噪声', '流量扬程'],
      },
      {
        code: '06-12-02-P09',
        fragments: ['冷却水泵组', '阀件状态', '绝缘接地', '试运转', '压力温升'],
      },
      {
        code: '06-13-02-P09',
        fragments: ['地源侧泵组', '集分水器', '接地连续性', '排气补水', '流量压力'],
      },
      {
        code: '06-14-05-P09',
        fragments: ['水源换热', '取排水接口', '换热接口', '通水试运行', '流量温差'],
      },
      {
        code: '06-17-05-P09',
        fragments: ['蒸汽热水管道', '疏水器', '保温防烫', '升温暖管', '压力温度'],
      },
      {
        code: '06-18-01-P09',
        fragments: ['室外机组', '冷媒管', '防雨防雷', '风机运转', '运行压力'],
      },
      {
        code: '06-18-02-P09',
        fragments: ['室内机组', '冷凝水坡度', '接地测试', '送回风', '漏水检查'],
      },
      {
        code: '06-19-06-P09',
        fragments: ['低温热水地板', '回路编号', '水压保压', '流量平衡', '成品保护'],
      },
      {
        code: '07-04-02-P08',
        fragments: ['端子排', '压接牢固度', '绝缘', '联锁动作', '错接松动'],
      },
      {
        code: '07-05-05-P02',
        fragments: ['塑料护套线', '固定点间距', '保护管', '穿墙穿板', '成品保护'],
      },
      {
        code: '07-05-09-P07',
        fragments: ['专用灯具', '防坠措施', '接线极性', '控制回路', '专用功能'],
      },
      {
        code: '07-06-09-P07',
        fragments: ['备用电源接地', '跨接线', '防腐处理', '接地电阻', '漏接问题'],
      },
      {
        code: '08-09-02-P04',
        fragments: ['广播分区', '线缆端子', '功放输出', '声压抽测', '错接漏标'],
      },
      {
        code: '08-10-03-P12',
        fragments: ['会议终端', '音视频线缆', '拾音效果', '联动复测', '账号权限'],
      },
      {
        code: '08-13-02-P05',
        fragments: ['信息点位', '编号一致性', '永久标签', '对应测试', '错标漏标'],
      },
      {
        code: '08-17-01-P08',
        fragments: ['应急响应设备', '控制线', '平台联动', '断电恢复', '功能复测'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have six field activity steps`)
        .toHaveLength(6)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(6)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens residual steel, finish, roof, MEP, HVAC, and intelligent handoff thin nodes', () => {
    const expectations = [
      {
        code: '02-01-03-P03',
        fragments: ['浇筑分区', '模板钢筋', '坍落度', '试块留置', '放行记录'],
      },
      {
        code: '02-03-07-P01',
        fragments: ['专项方案', '张拉膜材', '专家论证', '施工监测', '首件作业'],
      },
      {
        code: '02-05-07-P02',
        fragments: ['配合比报告', '坍落度', '首车检测', '二次检测', '浇筑放行'],
      },
      {
        code: '02-05-07-P03',
        fragments: ['浇筑分区', '泵管布置', '高低跨节点', '试块留置', '责任闭合'],
      },
      {
        code: '02-06-06-P02',
        fragments: ['起重设备', '站位地基', '构件重量', '警戒区', '作业放行'],
      },
      {
        code: '02-06-07-P02',
        fragments: ['空间结构', '起重设备', '临时支撑', '监测点位', '首段施工'],
      },
      {
        code: '02-07-04-P06',
        fragments: ['防护部位', '覆盖围挡', '巡检记录', '整改', '移交边界'],
      },
      {
        code: '03-02-04-P03',
        fragments: ['勾缝砂浆', '颜色样板', '试勾样段', '色差污染', '大面勾缝'],
      },
      {
        code: '03-10-01-P05',
        fragments: ['样板房间', '色板编号', '阴阳角', '观感色差', '大面施工'],
      },
      {
        code: '03-10-01-P09',
        fragments: ['观感复测', '刷痕污染', '补涂边界', '整改影像', '移交签认'],
      },
      {
        code: '03-10-02-P05',
        fragments: ['饰面样板', '色板纹理', '节点收口', '样板观感', '展开施工'],
      },
      {
        code: '03-10-02-P09',
        fragments: ['饰面观感', '光泽裂纹', '修补打磨', '复测影像', '资料闭合'],
      },
      {
        code: '03-10-03-P05',
        fragments: ['特种涂饰', '材料批次', '肌理纹路', '附着性能', '大面施工'],
      },
      {
        code: '03-10-03-P09',
        fragments: ['特种涂饰', '厚薄不均', '纹理衔接', '问题销项', '资料闭合'],
      },
      {
        code: '04-01-02-P02',
        fragments: ['隔汽材料', '卷材外观', '搭接胶带', '见证取样', '隔汽施工'],
      },
      {
        code: '04-01-04-P01',
        fragments: ['保护层材料', '细石混凝土', '分格缝', '试块留置', '保护层施工'],
      },
      {
        code: '04-02-03-P03',
        fragments: ['试喷区域', '喷涂设备', '样板厚度', '厚度偏差', '大面喷涂'],
      },
      {
        code: '04-04-04-P04',
        fragments: ['密封胶', '基层清洁', '试打胶', '粘结不良', '节点验收'],
      },
      {
        code: '05-03-04-P08',
        fragments: ['绝热节能', '绝热厚度', '冷桥处理', '整改复验', '系统移交'],
      },
      {
        code: '05-05-10-P07',
        fragments: ['供暖防腐', '干膜厚度', '色标流向', '整改复验', '交接签认'],
      },
      {
        code: '05-10-04-P07',
        fragments: ['中水雨水防腐', '涂层厚度', '色环标识', '整改复测', '交接签认'],
      },
      {
        code: '05-11-03-P07',
        fragments: ['泳池浴池防腐', '耐水耐药剂', '泵房潮湿', '药剂腐蚀', '交接签认'],
      },
      {
        code: '06-04-02-P06',
        fragments: ['除尘部件', '泄爆口', '防静电跨接', '分区堆放', '领用交接'],
      },
      {
        code: '06-05-05-P07',
        fragments: ['舒适空调防腐', '涂层厚度', '冷凝水区域', '整改复测', '交接签认'],
      },
      {
        code: '06-05-09-P09',
        fragments: ['舒适空调绝热', '防潮层', '保温检查', '整改复验', '系统移交'],
      },
      {
        code: '06-06-05-P07',
        fragments: ['恒温恒湿防腐', '密封面', '过滤段', '涂层破损', '交接签认'],
      },
      {
        code: '06-06-09-P06',
        fragments: ['恒温恒湿绝热', '防潮层', '冷桥热桥', '结露', '交接签认'],
      },
      {
        code: '06-09-02-P06',
        fragments: ['真空吸尘部件', '集尘桶', '负压管件', '分区堆放', '领用交接'],
      },
      {
        code: '06-09-05-P07',
        fragments: ['真空吸尘防腐', '涂层厚度', '跨接点', '整改复测', '交接签认'],
      },
      {
        code: '06-10-04-P08',
        fragments: ['防腐成品保护', '围挡', '涂层破损', '修补复测', '移交签认'],
      },
      {
        code: '08-01-04-P07',
        fragments: ['运行报表', '报警事件', '缺报错报', '数据导出', '运维移交'],
      },
      {
        code: '08-01-04-P08',
        fragments: ['运维账号', '角色矩阵', '权限抽测', '操作手册', '系统接管'],
      },
      {
        code: '08-02-01-P06',
        fragments: ['运营商交接', '端口编号', '信号测试', '维保联系人', '通信开通'],
      },
      {
        code: '08-05-06-P08',
        fragments: ['软件版本', '配置参数', '端口映射', '配置备份', '交接签认'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have five field activity steps`)
        .toHaveLength(5)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(5)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('deepens final residual handover, archive, commissioning, and acceptance thin nodes', () => {
    const expectations = [
      {
        code: '03-11-01-P08',
        fragments: ['裱糊观感', '拼缝搭接', '色差', '问题销项', '成品保护移交'],
      },
      {
        code: '03-11-02-P08',
        fragments: ['软包观感', '面料色差', '边角收口', '返修', '成品保护移交'],
      },
      {
        code: '03-12-04-P09',
        fragments: ['护栏扶手', '固定节点', '防坠措施', '安全隐患', '交接签认'],
      },
      {
        code: '03-12-05-P02',
        fragments: ['花饰构件', '样板编号', '尺寸偏差', '试装样段', '安装放行'],
      },
      {
        code: '03-12-05-P09',
        fragments: ['花饰观感', '固定牢固度', '防坠措施', '局部更换', '交接签认'],
      },
      {
        code: '05-11-04-P06',
        fragments: ['泳池浴池绝热', '防潮层', '结露', '整改复测', '交接签认'],
      },
      {
        code: '05-12-03-P09',
        fragments: ['水景喷泉绝热', '防冻保护', '泵房潮湿', '保温缺口', '运维移交'],
      },
      {
        code: '05-13-02-P09',
        fragments: ['热源辅助设备', '控制柜', '报警参数', '控制偏差', '运行参数台账'],
      },
      {
        code: '06-10-05-P02',
        fragments: ['换热器板片', '垫片材质', '外观', '资料缺项', '组装放行'],
      },
      {
        code: '06-10-08-P09',
        fragments: ['冷凝水绝热', '坡向', '保温收口', '结露滴水', '移交签认'],
      },
      {
        code: '06-11-04-P09',
        fragments: ['冷热水防腐', '附着力', '色标流向', '破损缺陷', '交接签认'],
      },
      {
        code: '06-12-04-P09',
        fragments: ['冷却水防腐', '冷却塔接口', '潮湿部位', '破损问题', '交接签认'],
      },
      {
        code: '06-12-06-P09',
        fragments: ['冷却水绝热', '保护层', '塔侧接口', '收口缺陷', '交接签认'],
      },
      {
        code: '06-13-04-P09',
        fragments: ['地源侧防腐', '集分水器', '潮湿区域', '标识缺失', '交接签认'],
      },
      {
        code: '06-13-06-P09',
        fragments: ['地源侧绝热', '集分水器', '穿墙部位', '整改复验', '交接签认'],
      },
      {
        code: '06-14-02-P09',
        fragments: ['水源侧水泵', '过滤器', '流量压力', '参数偏差', '交接签认'],
      },
      {
        code: '06-14-04-P09',
        fragments: ['水源侧防腐', '取排水接口', '漏涂锈蚀', '整改', '交接签认'],
      },
      {
        code: '06-14-07-P09',
        fragments: ['水源侧绝热', '换热接口', '结露破损', '整改复验', '交接签认'],
      },
      {
        code: '06-15-02-P09',
        fragments: ['蓄能水泵', '蓄放能联动', '控制偏差', '整改复验', '交接签认'],
      },
      {
        code: '06-15-04-P09',
        fragments: ['蓄能系统防腐', '蓄水罐', '潮湿部位', '破损问题', '交接签认'],
      },
      {
        code: '06-15-06-P09',
        fragments: ['蓄能系统绝热', '温度测点', '支架冷桥', '标识缺失', '交接签认'],
      },
      {
        code: '06-16-02-P09',
        fragments: ['制冷设备防腐', '机组外壳', '潮湿部位', '保护缺陷', '交接签认'],
      },
      {
        code: '06-16-05-P09',
        fragments: ['制冷管道绝热', '穿墙部位', '结露破损', '整改复验', '交接签认'],
      },
      {
        code: '06-17-01-P02',
        fragments: ['吸收式机组', '铭牌型号', '运输损伤', '补证补件', '安装作业放行'],
      },
      {
        code: '06-17-01-P09',
        fragments: ['吸收式机组', '真空', '噪声振动', '结晶风险', '交接签认'],
      },
      {
        code: '06-17-02-P09',
        fragments: ['吸收式系统防腐', '补口涂层', '色标', '破损问题', '交接签认'],
      },
      {
        code: '06-17-07-P09',
        fragments: ['吸收式管道绝热', '溶液管道', '收口缺陷', '整改复验', '交接签认'],
      },
      {
        code: '06-19-04-P09',
        fragments: ['太阳能系统防腐', '屋面接口', '露天耐候', '破损问题', '交接签认'],
      },
      {
        code: '06-19-05-P09',
        fragments: ['太阳能绝热', '穿屋面', '紫外老化', '整改', '交接签认'],
      },
      {
        code: '07-02-03-P09',
        fragments: ['母线槽功能', '接地连续性', '通电运行', '接头发热', '交接签认'],
      },
      {
        code: '07-02-05-P02',
        fragments: ['高低压电缆', '护套', '电压等级', '长度偏差', '敷设放行'],
      },
      {
        code: '07-05-06-P06',
        fragments: ['钢索配线', '张力', '导线绑扎', '绝缘破损', '隐蔽移交'],
      },
      {
        code: '07-06-02-P09',
        fragments: ['柴油发电机组', '排烟燃油', '带载运行', '切换失败', '交接签认'],
      },
      {
        code: '07-06-07-P07',
        fragments: ['穿线验收', '回路清册', '端子压接', '错穿', '隐蔽交接'],
      },
      {
        code: '08-06-01-P06',
        fragments: ['运营商进场', '设备安装面', '信号测试', '现场障碍', '施工放行'],
      },
      {
        code: '08-11-04-P12',
        fragments: ['信息导引', '播放器', '节目发布', '备品备件', '接管签认'],
      },
      {
        code: '08-11-07-P06',
        fragments: ['信息导引试运行', '播放终端', '花屏断网', '配置备份', '移交签认'],
      },
      {
        code: '08-12-02-P06',
        fragments: ['子钟回路', '线缆标签', '同步偏差', '通信异常', '清册签认'],
      },
      {
        code: '08-12-03-P12',
        fragments: ['时钟系统交接', 'NTP接口', '授时精度', '备品备件', '接管签认'],
      },
      {
        code: '08-12-05-P06',
        fragments: ['时钟系统试运行', '同步状态', '掉电恢复', '配置备份', '移交签认'],
      },
      {
        code: '08-13-02-P07',
        fragments: ['线缆清册', '竣工图', '配线架', '测试失败', '移交签认'],
      },
      {
        code: '08-13-05-P07',
        fragments: ['试运行报告', '系统日志', '培训签到', '账号权限', '移交签认'],
      },
      {
        code: '08-14-02-P08',
        fragments: ['线缆测试记录', 'BMS点表', '通信状态', '地址冲突', '点表移交'],
      },
      {
        code: '08-17-02-P08',
        fragments: ['应急响应软件', '应急场景', '报警推送', '配置备份', '交接签认'],
      },
      {
        code: '08-17-03-P07',
        fragments: ['复测签认', '场景脚本', '响应时效', '配置备份', '调试报告'],
      },
      {
        code: '09-02-02-P09',
        fragments: ['节能验收', '检测资料', '能耗数据', '问题销项', '资料归档'],
      },
      {
        code: '10-02-01-P07',
        fragments: ['缺损件登记', '安全部件', '包装损伤', '补件补证', '缺损闭合'],
      },
    ]

    for (const expectation of expectations) {
      const node = flatChinaCatalog.find((candidate) => candidate.stableCode === expectation.code)
      expect(node, `${expectation.code} should exist`).toBeDefined()
      expect(node?.categoryType, `${expectation.code} should remain a process node`).toBe('process')
      expect(node?.children, `${expectation.code} should have five field activity steps`)
        .toHaveLength(5)
      expect(node?.expectedChildCount, `${expectation.code} expectedChildCount should match runtime children`)
        .toBe(5)

      const activityText = node?.children?.map((child) => child.name).join('\n') ?? ''
      for (const fragment of expectation.fragments) {
        expect(activityText, `${expectation.code} should include ${fragment}`).toContain(fragment)
      }
    }
  })

  it('keeps standard-seed depth patches out of the five-layer dependency rule surface', () => {
    const overrides = activityStepOverrideBlock()

    for (const forbiddenToken of [
      'predecessorStableCode',
      'successorStableCode',
      'additionalPredecessorStableCodes',
      'relationKind',
      'lagDays',
      'dependency',
      '->',
    ]) {
      expect(overrides, `activity-step overrides should not carry ${forbiddenToken}`)
        .not.toContain(forbiddenToken)
    }
  })
})
