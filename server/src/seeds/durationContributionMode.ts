export type DurationContributionMode =
  | 'duration_bearing'
  | 'embedded_check'
  | 'quality_gate'
  | 'external_wait'
  | 'record_only'
  | 'handover_marker'

// Algorithm-layer semantics. This is deliberately separate from planItemKind:
// planItemKind drives UI/progress behavior, while durationContributionMode
// decides whether a row contributes schedule duration or sibling dependencies.
export const DURATION_CONTRIBUTION_MODES: DurationContributionMode[] = [
  'duration_bearing',
  'embedded_check',
  'quality_gate',
  'external_wait',
  'record_only',
  'handover_marker',
]

const DURATION_BEARING_ACTION_TERMS = [
  '施工', '安装', '制作', '加工', '浇筑', '绑扎', '支设', '开挖', '回填', '砌筑',
  '抹灰', '铺贴', '铺设', '铺装', '敷设', '吊装', '焊接', '涂刷', '喷涂',
  '打胶', '调试', '联调', '试运行', '试压', '冲洗', '张拉', '压浆', '灌浆',
  '植筋', '成孔', '压桩', '沉桩', '喷浆', '搅拌', '封闭', '修补',
  '带载测试', '切换测试', '故障演练', '恢复演练', '带料功能测试',
  'construction', 'install', 'installation', 'fabrication', 'erection', 'casting',
  'pouring', 'excavation', 'backfill', 'commissioning', 'trial run',
]

const EXPLICIT_DURATION_ACTION_TERMS = [
  '\u65bd\u5de5', '\u5b89\u88c5', '\u5236\u4f5c', '\u52a0\u5de5', '\u6d47\u7b51', '\u7ed1\u624e', '\u652f\u8bbe', '\u5f00\u6316', '\u56de\u586b', '\u780c\u7b51',
  '\u62b9\u7070', '\u94fa\u8d34', '\u94fa\u8bbe', '\u94fa\u88c5', '\u6577\u8bbe', '\u540a\u88c5', '\u710a\u63a5', '\u6d82\u5237', '\u55b7\u6d82',
  '\u6253\u80f6', '\u8c03\u8bd5', '\u8054\u8c03', '\u8bd5\u8fd0\u884c', '\u8bd5\u538b', '\u51b2\u6d17', '\u5f20\u62c9', '\u538b\u6d46', '\u704c\u6d46',
  '\u6ce8\u6d46', '\u538b\u704c', '\u63d0\u94bb', '\u690d\u7b4b', '\u6210\u5b54', '\u538b\u6869', '\u6c89\u6869', '\u55b7\u6869', '\u5c01\u95ed', '\u4fee\u8865',
  '\u5e26\u8f7d\u6d4b\u8bd5', '\u5207\u6362\u6d4b\u8bd5', '\u6545\u969c\u6f14\u7ec3', '\u6062\u590d\u6f14\u7ec3', '\u5e26\u6599\u529f\u80fd\u6d4b\u8bd5',
  'construction', 'install', 'installation', 'fabrication', 'erection', 'casting',
  'pouring', 'excavation', 'backfill', 'commissioning', 'trial run',
]

const EMBEDDED_CHECK_TERMS = [
  '测量', '放线', '定位', '复核', '标高', '轴线', '垂直度', '尺寸', '校正',
  'measurement', 'setting out', 'layout review', 'dimension review',
]

const EXTERNAL_WAIT_TERMS = [
  '复验', '送检', '见证取样', '第三方', '检测报告', '试验报告', '强度报告',
  '复试报告', '材料报告', '监督检验', 'retest', 'lab report', 'third party', 'test report',
]

const QUALITY_GATE_TERMS = [
  '验收', '隐蔽', '核验', '检查', '复查', '复测', '检测', '试验', '测试', '检验', '验槽',
  'acceptance', 'inspection', 'quality gate', 'test',
]

const RECORD_ONLY_TERMS = [
  '资料', '记录', '归档', '台账', '签认', '报审', '组卷', 'archive', 'record',
  'document', 'submittal',
]

const HANDOVER_TERMS = [
  '移交', '交接', '交付', 'handover', 'turnover',
]

const EMBEDDED_CHECK_SUPPLEMENTAL_TERMS = [
  '\u6d4b\u91cf', '\u653e\u7ebf', '\u5b9a\u4f4d', '\u590d\u6838', '\u6807\u9ad8', '\u8f74\u7ebf',
  '\u5782\u76f4\u5ea6', '\u5c3a\u5bf8', '\u6821\u6b63', '\u6761\u4ef6\u786e\u8ba4',
  '\u65b9\u6848\u786e\u8ba4', '\u6e05\u5355\u786e\u8ba4', '\u6d4b\u70b9\u6e05\u5355',
  '\u7f16\u5236\u5ba1\u6279', '\u6838\u5bf9', '\u65b9\u6848\u6838\u5bf9',
]

const STRONG_EMBEDDED_CHECK_TERMS = [
  '\u4f5c\u4e1a\u9762\u51c6\u5907',
  '\u4f5c\u4e1a\u9762\u786e\u8ba4',
  '\u51c6\u5907\u4e0e\u4ea4\u5e95',
  '\u65b9\u6848\u4ea4\u5e95',
  '\u6280\u672f\u4ea4\u5e95',
  '\u5de5\u827a\u8bc4\u5b9a',
  '\u4f5c\u4e1a\u4ea4\u5e95',
  '\u63aa\u65bd\u4ea4\u5e95',
  '\u5de5\u827a\u53c2\u6570\u63a7\u5236',
  '\u65bd\u5de5\u53c2\u6570\u786e\u8ba4',
  '\u65bd\u5de5\u65b9\u6848',
  '\u65b9\u6848\u6216\u6761\u4ef6\u786e\u8ba4',
  '\u65b9\u6848\u7f16\u5236',
  '\u65b9\u6848\u5ba1\u6279',
  '\u65b9\u6848\u4ea4\u5e95',
  '\u6280\u672f\u4ea4\u5e95',
  '\u5f00\u6316\u65b9\u6848',
  '\u6ce8\u6d46\u65b9\u6848',
  '\u5b89\u88c5\u65b9\u6848',
  '\u65b9\u6848\u548c',
  '\u65bd\u5de5\u534f\u8c03\u7a97\u53e3\u786e\u8ba4',
  '\u8f6f\u4ef6\u7248\u672c\u548c\u8bb8\u53ef\u6838\u67e5',
  '\u4eba\u5458\u8d44\u683c\u6838\u67e5',
  '\u7b7e\u5b57\u786e\u8ba4',
  '\u62c6\u9664\u6761\u4ef6',
  '\u505c\u7528\u62c6\u9664\u6761\u4ef6',
  '\u5378\u8f7d\u987a\u5e8f\u786e\u8ba4',
  '\u8d44\u6599\u6838\u5bf9',
  '\u8d44\u6599\u6838\u9a8c',
  '\u6392\u7248\u56fe\u786e\u8ba4',
  '\u5206\u683c\u7f1d\u534f\u8c03',
  '\u6df1\u5316\u6392\u7248',
  '\u5c3a\u5bf8\u590d\u6838',
  '\u6761\u4ef6\u786e\u8ba4',
  '\u7ec4\u7ec7\u6216\u8ba1\u5212\u786e\u8ba4',
  '\u6761\u4ef6\u6216\u6570\u636e\u6838\u67e5',
  '\u7f16\u5236\u6216\u51c6\u5907',
  '\u754c\u9762\u786e\u8ba4',
  '\u9700\u6c42\u51bb\u7ed3',
  '\u8303\u56f4\u6e05\u5355',
  '\u6392\u4ea7\u8ba1\u5212\u6838\u67e5',
  '\u64cd\u4f5c\u7968\u786e\u8ba4',
  '\u8bba\u8bc1\u51c6\u5907\u548c\u4e13\u5bb6\u7ec4\u7ec7',
  '\u65b9\u6848\u4fee\u8ba2',
  '\u5206\u533a\u7ec4\u7ec7',
  '\u8282\u594f\u534f\u8c03',
  '\u89c4\u5219\u914d\u7f6e',
  '\u7ed9\u6392\u6c34\u7528\u7535\u548c\u6d88\u9632\u914d\u7f6e',
  '\u6750\u6599\u6807\u8bc6\u548c\u9632\u96e8\u9632\u706b\u914d\u7f6e',
  '\u5b9e\u540d\u5236\u95f8\u673a\u548c\u4eba\u5458\u8003\u52e4\u63a5\u5165',
  '\u8d23\u4efb\u5236\u7f16\u5236',
  '\u76ee\u6807\u5206\u89e3',
  '\u5b89\u5168\u8d44\u91d1\u4f7f\u7528\u8ba1\u5212',
  '\u8d44\u91d1\u8ba1\u5212\u7f16\u5236',
  '\u5b89\u5168\u5458\u914d\u7f6e\u6838\u67e5',
  '\u73ed\u524d\u5b89\u5168\u6d3b\u52a8',
  '\u4f5c\u4e1a\u8bb8\u53ef\u786e\u8ba4',
  '\u8fdd\u7ae0\u7ea0\u504f\u548c\u6574\u6539',
  '\u4fdd\u9669\u529e\u7406',
  '\u5ba1\u6279\u548c\u52a0\u56fa\u786e\u8ba4',
  '\u9884\u7559\u534f\u8c03',
  '\u8303\u56f4\u8bc6\u522b\u548c\u6e05\u5355\u7f16\u5236',
  '\u5907\u54c1\u5907\u4ef6\u548c\u8d23\u4efb\u4eba\u4ea4\u5e95',
  '\u6a21\u62df\u6f14\u7ec3\u548c\u95ee\u9898\u6574\u6539',
  '\u8de8\u754c\u9762\u6536\u53e3\u6e05\u5355\u548c\u6837\u677f\u786e\u8ba4',
  '\u95ee\u9898\u6e05\u5355\u5206\u7ea7',
  '\u8d23\u4efb\u95ed\u5408',
  '\u7ba1\u7ebf\u63a2\u67e5\u4e0e\u4ea4\u5e95',
  '\u4ea4\u901a\u7ec4\u7ec7\u5ba1\u6279',
  'URS\u8bc4\u5ba1',
  'DQ\u62a5\u544a\u5ba1\u6279',
  'IQ\u65b9\u6848\u5ba1\u6279',
  'OQ\u811a\u672c\u5ba1\u6279',
  'PQ\u6807\u51c6\u786e\u8ba4',
]

const EXTERNAL_WAIT_SUPPLEMENTAL_TERMS = [
  '\u590d\u9a8c', '\u9001\u68c0', '\u89c1\u8bc1\u53d6\u6837', '\u7b2c\u4e09\u65b9',
  '\u68c0\u6d4b\u62a5\u544a', '\u8bd5\u9a8c\u62a5\u544a', '\u5f3a\u5ea6\u62a5\u544a',
  '\u590d\u8bd5\u62a5\u544a', '\u6750\u6599\u62a5\u544a', '\u76d1\u7763\u68c0\u9a8c',
]

const QUALITY_GATE_SUPPLEMENTAL_TERMS = [
  '\u9a8c\u6536', '\u9690\u853d', '\u6838\u9a8c', '\u68c0\u67e5', '\u590d\u67e5',
  '\u590d\u6d4b', '\u68c0\u6d4b', '\u8bd5\u9a8c', '\u6d4b\u8bd5', '\u68c0\u9a8c',
  '\u9a8c\u69fd', '\u5408\u683c\u786e\u8ba4',
]

const STRONG_QUALITY_GATE_TERMS = [
  '\u9a8c\u6536', '\u9690\u853d', '\u6838\u9a8c', '\u68c0\u67e5', '\u590d\u67e5',
  '\u590d\u6838', '\u590d\u6d4b', '\u68c0\u9a8c', '\u9a8c\u69fd', '\u5408\u683c\u786e\u8ba4',
]

const RECTIFICATION_RECHECK_TERMS = [
  '检测问题整改',
  '监督检验问题整改',
  '问题整改复测',
  '问题整改闭合',
  '问题整改',
  '整改复测',
  '整改闭合',
  '整改验收',
  '验收整改记录',
  '整改验收记录',
  '自检整改记录',
  '质量检查和整改',
  '质量安全检查',
  '问题闭合',
  '销项',
  '销项复查',
  '销项闭合',
]

const HANDOVER_MARKER_COMPOUND_TERMS = [
  '验收移交记录',
  '专项验收移交',
  '验收和移交',
  '移交记录',
  '交接签认',
  '移交签认',
]

const RECORD_ONLY_COMPOUND_TERMS = [
  '资料核验',
  '资料复核',
  '报告复核',
  '签认记录闭合',
  '确认记录闭合',
  '记录闭合',
  '记录签认',
  '台账签认',
]

const QUALITY_GATE_COMPOUND_TERMS = [
  '试验检查或隐蔽验收',
  '检查或隐蔽验收',
  '隐蔽验收',
  '隐蔽检查',
  '性能复核',
  '功能复核',
  '关键节点检查',
  '淋水或性能复核',
  '验收和成品保护',
]

const PHYSICAL_TEST_GATE_TERMS = [
  '\u95ed\u6c34\u8bd5\u9a8c',
  '\u6dcb\u6c34\u8bd5\u9a8c',
  '\u84c4\u6c34\u8bd5\u9a8c',
  '\u6dcb\u6c34\u6216\u84c4\u6c34\u8bd5\u9a8c',
  '\u901a\u6c34\u8bd5\u9a8c',
  '\u901a\u7403\u8bd5\u9a8c',
  '\u8bd5\u5c04\u548c\u8054\u52a8\u6d4b\u8bd5',
  '\u7cfb\u7edf\u8054\u52a8\u8c03\u8bd5',
  '\u8054\u52a8\u6d4b\u8bd5',
  '\u8054\u52a8\u8c03\u8bd5',
  '\u5e26\u8f7d\u6d4b\u8bd5',
  '\u8d1f\u8f7d\u5207\u6362\u6d4b\u8bd5',
  '\u5e26\u6599\u529f\u80fd\u6d4b\u8bd5',
  '\u6d4b\u8bd5\u6267\u884c\u548c\u8fc7\u7a0b\u8bb0\u5f55',
]

const FIELD_ACTION_CONTEXT_TERMS = [
  '\u51b2\u6d17',
  '\u8bd5\u538b',
  '\u8c03\u8bd5',
  '\u8054\u8c03',
  '\u8bd5\u8fd0\u884c',
  '\u8bd5\u8fd0\u8f6c',
  '\u529f\u80fd\u6d4b\u8bd5',
  '\u8054\u52a8\u6d4b\u8bd5',
  '\u8054\u52a8\u8c03\u8bd5',
]

const FIELD_ACTION_PREPARATION_CONTEXT_TERMS = [
  '\u65b9\u6848',
  '\u65b9\u6848\u786e\u8ba4',
  '\u65b9\u6848\u7f16\u5236',
  '\u65b9\u6848\u5ba1\u6279',
  '\u65b9\u6848\u4ea4\u5e95',
  '\u8303\u56f4\u786e\u8ba4',
  '\u8fb9\u754c\u786e\u8ba4',
  '\u6e05\u5355',
  '\u70b9\u8868',
  '\u77e9\u9635\u786e\u8ba4',
  '\u811a\u672c',
  '\u6761\u4ef6\u786e\u8ba4',
  '\u653e\u884c\u8bb0\u5f55',
]

const FIELD_ACTION_GATE_CONTEXT_TERMS = [
  '\u5408\u683c\u786e\u8ba4',
  '\u5b89\u88c5\u9a8c\u6536',
]

const FIELD_FUNCTIONAL_TEST_DURATION_TERMS = [
  '\u529f\u80fd\u6d4b\u8bd5',
  '\u8054\u52a8\u6d4b\u8bd5',
  '\u8054\u9501\u6d4b\u8bd5',
  '\u4fdd\u62a4\u529f\u80fd\u6d4b\u8bd5',
  '\u5b89\u5168\u529f\u80fd\u6d4b\u8bd5',
  '\u5207\u6362\u6d4b\u8bd5',
  '\u5e26\u8f7d\u6d4b\u8bd5',
  '\u8d1f\u8f7d\u5207\u6362\u6d4b\u8bd5',
  '\u5e26\u6599\u529f\u80fd\u6d4b\u8bd5',
  '\u6ee1\u6c34\u8bd5\u9a8c',
  '\u51b2\u6d17\u529f\u80fd',
  '\u901a\u7545\u6027',
]

const FIELD_FUNCTIONAL_TEST_CONTEXT_ONLY_TERMS = [
  '\u529f\u80fd\u6d4b\u8bd5\u62a5\u544a',
  '\u529f\u80fd\u6d4b\u8bd5\u8bb0\u5f55',
  '\u529f\u80fd\u6d4b\u8bd5\u8d44\u6599',
  '\u529f\u80fd\u6d4b\u8bd5\u5f52\u6863',
  '\u529f\u80fd\u6d4b\u8bd5\u7b7e\u8ba4',
  '\u8054\u52a8\u6d4b\u8bd5\u62a5\u544a',
  '\u8054\u52a8\u6d4b\u8bd5\u8bb0\u5f55',
  '\u8054\u52a8\u6d4b\u8bd5\u8d44\u6599',
  '\u8054\u52a8\u6d4b\u8bd5\u5f52\u6863',
  '\u8054\u52a8\u6d4b\u8bd5\u7b7e\u8ba4',
  '\u6d4b\u8bd5\u62a5\u544a',
  '\u6d4b\u8bd5\u8bb0\u5f55',
  '\u6d4b\u8bd5\u8d44\u6599',
  '\u6d4b\u8bd5\u5f52\u6863',
  '\u6d4b\u8bd5\u7b7e\u8ba4',
  '\u6d4b\u8bd5\u6761\u4ef6',
  '\u6d4b\u8bd5\u524d',
  '\u6d4b\u8bd5\u65b9\u6848',
  '\u6d4b\u8bd5\u811a\u672c',
]

const FIELD_PHYSICAL_TEST_DURATION_TERMS = [
  '\u704c\u6c34\u8bd5\u9a8c',
  '\u901a\u6c34\u8bd5\u9a8c',
  '\u901a\u7403\u8bd5\u9a8c',
  '\u95ed\u6c34\u8bd5\u9a8c',
  '\u6dcb\u6c34\u8bd5\u9a8c',
  '\u95ed\u6c34\u6216\u6dcb\u6c34\u8bd5\u9a8c',
  '\u84c4\u6c34\u8bd5\u9a8c',
  '\u6f0f\u98ce\u91cf',
  '\u6f0f\u5149\u6d4b\u8bd5',
  '\u4e25\u5bc6\u6027\u6d4b\u8bd5',
  '\u6c14\u5bc6\u6d4b\u8bd5',
  '\u7edd\u7f18\u7535\u963b',
  '\u63a5\u5730\u8fde\u7eed\u6027',
  '\u63a5\u5730\u5bfc\u901a',
]

const FIELD_PHYSICAL_TEST_CONTEXT_ONLY_TERMS = [
  '\u8bd5\u9a8c\u65b9\u6848',
  '\u8bd5\u9a8c\u6761\u4ef6',
  '\u8bd5\u9a8c\u524d',
  '\u8bd5\u9a8c\u62a5\u544a',
  '\u8bd5\u9a8c\u8bb0\u5f55',
  '\u8bd5\u9a8c\u8d44\u6599',
  '\u8bd5\u9a8c\u5f52\u6863',
  '\u8bd5\u9a8c\u7b7e\u8ba4',
  '\u6d4b\u8bd5\u62a5\u544a',
  '\u6d4b\u8bd5\u8bb0\u5f55',
  '\u6d4b\u8bd5\u8d44\u6599',
  '\u6d4b\u8bd5\u5f52\u6863',
  '\u6d4b\u8bd5\u7b7e\u8ba4',
]

const FIELD_PRESSURE_TEST_DURATION_TERMS = [
  '\u8bd5\u538b',
  '\u6c34\u538b\u8bd5\u9a8c',
  '\u6c14\u5bc6\u6027\u8bd5\u9a8c',
  '\u538b\u529b\u8bd5\u9a8c',
  '\u7a33\u538b',
  '\u4fdd\u538b',
  '\u67e5\u6f0f',
  '\u63a5\u53e3\u67e5\u6f0f',
  '\u6cc4\u6f0f\u6574\u6539',
  '\u6e17\u6f0f\u6574\u6539',
  '\u538b\u529b\u6062\u590d',
]

const FIELD_FLUSHING_VALIDATION_DURATION_TERMS = [
  '\u6392\u6c61\u6c34\u6d4a\u5ea6',
  '\u6d4a\u5ea6',
  '\u6742\u8d28\u590d\u6d4b',
]

const FIELD_PRESSURE_TEST_CONTEXT_ONLY_TERMS = [
  '\u8bd5\u538b\u65b9\u6848',
  '\u8bd5\u538b\u5206\u6bb5\u548c\u76f2\u677f\u5c01\u5835\u65b9\u6848\u786e\u8ba4',
  '\u8bd5\u538b\u6761\u4ef6',
  '\u8bd5\u538b\u524d',
  '\u8bd5\u538b\u62a5\u544a',
  '\u8bd5\u538b\u8bb0\u5f55',
  '\u8bd5\u538b\u8d44\u6599',
  '\u8bd5\u538b\u5f52\u6863',
  '\u8bd5\u538b\u7b7e\u8ba4',
  '\u6c34\u538b\u8bd5\u9a8c\u62a5\u544a',
  '\u6c34\u538b\u8bd5\u9a8c\u8bb0\u5f55',
  '\u6c14\u5bc6\u6027\u8bd5\u9a8c\u62a5\u544a',
  '\u6c14\u5bc6\u6027\u8bd5\u9a8c\u8bb0\u5f55',
  '\u538b\u529b\u8bd5\u9a8c\u62a5\u544a',
  '\u538b\u529b\u8bd5\u9a8c\u8bb0\u5f55',
]

const FIELD_REMEDIATION_CLOSURE_DURATION_TERMS = [
  '\u95ee\u9898\u6574\u6539\u95ed\u5408',
  '\u6574\u6539\u95ed\u5408',
  '\u95ee\u9898\u9500\u9879',
]

const FIELD_REMEDIATION_CLOSURE_ACTION_TERMS = [
  '\u51b2\u6d17',
  '\u8bd5\u538b',
  '\u6c34\u538b',
  '\u6c14\u5bc6',
  '\u7a33\u538b',
  '\u67e5\u6f0f',
  '\u6cc4\u6f0f',
  '\u6e17\u6f0f',
  '\u8c03\u8bd5',
  '\u8054\u8c03',
  '\u8bd5\u8fd0\u884c',
]

const QUALITY_GATE_CONTEXT_TERMS = [
  '\u9884\u7559\u9884\u57cb', '\u9690\u853d',
  '\u6750\u6599', '\u6784\u4ef6', '\u5b9e\u4f53', '\u5916\u89c2', '\u4fdd\u62a4\u5c42',
  '\u5f3a\u5ea6', '\u710a\u7f1d', '\u8282\u70b9', '\u8bd5\u5757', '\u9632\u6c34',
  '\u4fdd\u6e29', '\u95e8\u7a97', '\u7cfb\u7edf', '\u8bbe\u5907', '\u7ba1\u9053',
  '\u98ce\u7ba1', '\u7535\u6c14', '\u6d88\u9632',
]

const RECORD_ONLY_SUPPLEMENTAL_TERMS = [
  '\u8d44\u6599', '\u8bb0\u5f55', '\u5f52\u6863', '\u53f0\u8d26', '\u7b7e\u8ba4',
  '\u62a5\u5ba1', '\u7ec4\u5377', '\u62a5\u544a', '\u6570\u636e\u6c47\u603b',
]

const STRONG_RECORD_ONLY_CLOSURE_TERMS = [
  '\u62a5\u544a\u7b7e\u8ba4',
  '\u590d\u9a8c\u8d44\u6599\u6838\u9a8c',
  '\u8fdb\u573a\u590d\u9a8c\u8d44\u6599\u6838\u9a8c',
  '\u590d\u9a8c\u62a5\u544a\u5f52\u6863',
  '\u590d\u8bd5\u62a5\u544a\u5f52\u6863',
  '\u68c0\u6d4b\u62a5\u544a\u5f52\u6863',
  '\u8bd5\u9a8c\u62a5\u544a\u5f52\u6863',
  '\u62a5\u544a\u5f52\u6863',
  '\u73ed\u7ec4\u81ea\u68c0\u8bb0\u5f55',
  '\u8d28\u91cf\u81ea\u68c0\u8bb0\u5f55',
  '\u9a8c\u6536\u8bb0\u5f55',
  '\u68c0\u67e5\u8bb0\u5f55',
  '\u7b7e\u8ba4\u5f52\u6863',
  '\u8bb0\u5f55\u7b7e\u8ba4',
  '\u8d44\u6599\u5f52\u6863',
  '\u8bb0\u5f55\u590d\u6838',
  '\u6d4b\u91cf\u6210\u679c\u8bb0\u5f55',
  '\u68c0\u6d4b\u8bb0\u5f55',
  '\u5145\u76c8\u7cfb\u6570\u8bb0\u5f55',
  '\u62a5\u544a\u95ed\u5408\u5f52\u6863',
  '\u68c0\u6d4b\u62a5\u544a\u95ed\u5408',
  '\u68c0\u6d4b\u8d44\u6599',
  '\u79fb\u4ea4\u7b7e\u8ba4',
  '\u5f00\u5de5\u4ee4\u53d6\u5f97',
  '\u65bd\u5de5\u8bb8\u53ef\u8bc1\u5f00\u5de5\u4ee4\u53d6\u5f97',
  '\u95ee\u9898\u6574\u6539\u95ed\u5408\u548c\u62a5\u544a',
  '\u6574\u6539\u95ed\u5408\u548c\u62a5\u544a',
  '\u95ee\u9898\u6574\u6539\u95ed\u5408',
  '\u6e17\u6f0f\u6574\u6539\u95ed\u5408',
  '\u7f3a\u9677\u6574\u6539\u95ed\u5408',
  '\u95ee\u9898\u9500\u9879',
  '\u95ee\u9898\u6e05\u5355\u95ed\u5408',
  '\u7ae3\u5de5\u56fe\u540c\u6b65',
  '\u7ae3\u5de5\u56fe\u7eb8\u7ed8\u5236',
  '\u7ae3\u5de5\u56fe\u7ed8\u5236',
  '\u6807\u8bc6\u6807\u7b7e\u548c\u7ae3\u5de5\u56fe\u7ed8\u5236',
  '\u88c5\u7bb1\u6e05\u5355\u548c\u5408\u683c\u6587\u4ef6\u6838\u67e5',
  '\u529f\u80fd\u590d\u6d4b\u548c\u4ea4\u63a5\u7b7e\u8ba4',
  '\u590d\u6d4b\u548c\u4ea4\u63a5\u7b7e\u8ba4',
  '\u65bd\u5de5\u8fc7\u7a0b\u7ed3\u7b97',
  '\u5206\u6bb5\u8ba1\u91cf',
  '\u65bd\u5de5\u53c2\u6570\u8bb0\u5f55',
  '\u9a8c\u6536\u6d4b\u8bd5\u6267\u884c\u548c\u8fc7\u7a0b\u8bb0\u5f55',
  '\u81ea\u68c0\u9a8c\u6536',
  '\u786e\u8ba4\u8bb0\u5f55',
  '\u9690\u853d\u5f71\u50cf\u7b7e\u8ba4',
  '\u5f71\u50cf\u7b7e\u8ba4',
  '\u53f0\u8d26\u95ed\u5408',
  '\u8d28\u91cf\u8bc1\u660e\u548c\u504f\u5dee\u53f0\u8d26\u95ed\u5408',
  '\u65c1\u7ad9\u8bb0\u5f55\u95ed\u5408',
  '\u9690\u853d\u5f71\u50cf\u548c\u65c1\u7ad9\u8bb0\u5f55\u95ed\u5408',
  '\u7ae3\u5de5\u56fe\u56de\u5199',
  '\u5907\u6848\u610f\u89c1\u548c\u8f6c\u6362\u6784\u4ef6\u6e05\u5355\u95ed\u5408',
  'FAT\u8bb0\u5f55\u548c\u51fa\u5382\u53c2\u6570\u6838\u9a8c',
  'FAT\u8d44\u6599\u6838\u9a8c',
  'SAT\u62a5\u544a\u7b7e\u8ba4',
  'SAT\u62a5\u544a\u7b7e\u8ba4\u5f52\u6863',
  'IQ\u62a5\u544a\u7b7e\u8ba4',
  'IQ\u62a5\u544a\u7b7e\u8ba4\u5f52\u6863',
  'OQ\u62a5\u544a\u7b7e\u8ba4',
  'OQ\u62a5\u544a\u7b7e\u8ba4\u5f52\u6863',
  'PQ\u62a5\u544a\u7b7e\u8ba4',
  '\u9a8c\u8bc1\u62a5\u544a\u7b7e\u8ba4\u5f52\u6863',
  'SOP\u63d0\u4ea4',
  '\u8fd0\u7ef4\u8d44\u6599\u79fb\u4ea4',
  '\u5907\u54c1\u5907\u4ef6\u79fb\u4ea4',
]

const HANDOVER_SUPPLEMENTAL_TERMS = [
  '\u79fb\u4ea4', '\u4ea4\u63a5', '\u4ea4\u4ed8',
]

const PHYSICAL_WORK_TERMS = [
  '\u65bd\u5de5', '\u5b89\u88c5', '\u5236\u4f5c', '\u52a0\u5de5', '\u6d47\u7b51',
  '\u7ed1\u624e', '\u652f\u8bbe', '\u5f00\u6316', '\u56de\u586b', '\u780c\u7b51',
  '\u62b9\u7070', '\u94fa\u8d34', '\u94fa\u8bbe', '\u94fa\u88c5', '\u6577\u8bbe',
  '\u540a\u88c5', '\u710a\u63a5', '\u6d82\u5237', '\u55b7\u6d82', '\u6253\u80f6',
  '\u8c03\u8bd5', '\u8054\u8c03', '\u8bd5\u8fd0\u884c', '\u8bd5\u8fd0\u8f6c', '\u8bd5\u538b', '\u51b2\u6d17',
  '\u5f20\u62c9', '\u538b\u6d46', '\u704c\u6d46', '\u6ce8\u6d46', '\u538b\u704c', '\u63d0\u94bb', '\u690d\u7b4b', '\u6210\u5b54',
  '\u538b\u6869', '\u6c89\u6869', '\u55b7\u6869', '\u5c01\u95ed', '\u4fee\u8865',
  '\u914d\u5236\u6295\u52a0', '\u5faa\u73af\u63a7\u5236',
]

const PHYSICAL_CONTEXT_ONLY_TERMS = [
  '\u65bd\u5de5\u65b9\u6848',
  '\u4e13\u9879\u65bd\u5de5\u65b9\u6848',
  '\u65bd\u5de5\u56fe',
  '\u65bd\u5de5\u8bb8\u53ef',
  '\u65bd\u5de5\u51c6\u5907',
  '\u65bd\u5de5\u53c2\u6570',
  '\u65bd\u5de5\u534f\u8c03',
  '\u65bd\u5de5\u8bb0\u5f55',
  '\u8fc7\u7a0b\u65bd\u5de5',
  '\u7279\u6b8a\u65bd\u5de5\u6cd5',
  '\u4f5c\u4e1a\u9762\u51c6\u5907',
  '\u65b9\u6848\u6216\u6761\u4ef6\u786e\u8ba4',
  '\u6e05\u5355\u5f62\u6210',
]

const FIELD_COMMISSIONING_DURATION_TERMS = [
  '单机试运行',
  '联动试运行',
  '通电试运行',
  '升温试运行',
  '带载试运行',
  '空载试运行',
  '连续试运行',
  '试运行',
  '单机试运转',
  '联合试运转',
  '试运转',
  '系统联动调试',
  '联动调试',
  '接口联调',
  '联调报警',
  '联锁点表',
  'BMS接口联调',
  '数据上传调试',
  '远传平台点表和数据上传调试',
  '系统联调',
  '系统调试',
  '调试功能复测',
  '水力平衡调试',
  '热力平衡调试',
  '平衡调试',
  '调试验收',
]

const FIELD_COMMISSIONING_CONTEXT_ONLY_TERMS = [
  '调试方案',
  '调试条件',
  '调试范围',
  '调试脚本',
  '调试参数复核',
  '调试放行',
  '调试记录',
  '调试报告',
  '调试资料',
  '调试前',
  '试运行条件',
  '试运行数据',
  '试运行记录',
  '试运行报告',
  '试运行前',
  '试运转前',
  '方案确认',
  '方案编制',
  '方案审批',
  '方案交底',
  '范围确认',
  '边界确认',
  '清单确认',
  '条件确认',
  '计划会签',
  '报告签认',
  '报告编制',
  '报告归档',
  '报告整理',
  '记录签认',
  '记录汇总',
  '资料归档',
  '资料移交',
  '运维资料移交',
  '运维移交',
  '交接签认',
  '移交签认',
  '台账',
]

function includesAny(text: string, terms: string[]) {
  const normalized = text.toLowerCase()
  return terms.some((term) => normalized.includes(term.toLowerCase()))
}

function stripParentheticalContext(text: string) {
  return text.replace(/[\uFF08(][^\uFF09)]*[\uFF09)]/g, '')
}

function removeTerms(text: string, terms: string[]) {
  return terms.reduce((current, term) => current.split(term).join(''), text)
}

function includesFieldCommissioningDurationWork(text: string) {
  if (!includesAny(text, FIELD_COMMISSIONING_DURATION_TERMS)) return false

  const fieldWorkText = removeTerms(text, FIELD_COMMISSIONING_CONTEXT_ONLY_TERMS)
  return includesAny(fieldWorkText, FIELD_COMMISSIONING_DURATION_TERMS)
}

function includesFieldFunctionalTestDurationWork(text: string) {
  if (!includesAny(text, FIELD_FUNCTIONAL_TEST_DURATION_TERMS)) return false

  const fieldWorkText = removeTerms(text, FIELD_FUNCTIONAL_TEST_CONTEXT_ONLY_TERMS)
  return includesAny(fieldWorkText, FIELD_FUNCTIONAL_TEST_DURATION_TERMS)
}

function includesFieldPhysicalTestDurationWork(text: string) {
  if (!includesAny(text, FIELD_PHYSICAL_TEST_DURATION_TERMS)) return false

  const fieldWorkText = removeTerms(text, FIELD_PHYSICAL_TEST_CONTEXT_ONLY_TERMS)
  return includesAny(fieldWorkText, FIELD_PHYSICAL_TEST_DURATION_TERMS)
}

function includesFieldPressureTestDurationWork(text: string) {
  if (!includesAny(text, FIELD_PRESSURE_TEST_DURATION_TERMS)) return false

  const fieldWorkText = removeTerms(text, FIELD_PRESSURE_TEST_CONTEXT_ONLY_TERMS)
  return includesAny(fieldWorkText, FIELD_PRESSURE_TEST_DURATION_TERMS)
}

function includesFieldFlushingValidationDurationWork(text: string) {
  if (!includesAny(text, FIELD_FLUSHING_VALIDATION_DURATION_TERMS)) return false
  return includesAny(text, ['\u6392\u6c61\u6c34', '\u51b2\u6d17', '\u8fc7\u6ee4', '\u5faa\u73af'])
}

function includesFieldRemediationClosureDurationWork(text: string) {
  if (!includesAny(text, FIELD_REMEDIATION_CLOSURE_DURATION_TERMS)) return false
  return includesAny(text, FIELD_REMEDIATION_CLOSURE_ACTION_TERMS)
}

function includesFieldActionPreparationContext(text: string) {
  return includesAny(text, FIELD_ACTION_CONTEXT_TERMS)
    && includesAny(text, FIELD_ACTION_PREPARATION_CONTEXT_TERMS)
}

function includesFieldActionGateContext(text: string) {
  return includesAny(text, FIELD_ACTION_CONTEXT_TERMS)
    && includesAny(text, FIELD_ACTION_GATE_CONTEXT_TERMS)
}

export function normalizeDurationContributionMode(value: unknown): DurationContributionMode | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return DURATION_CONTRIBUTION_MODES.includes(normalized as DurationContributionMode)
    ? normalized as DurationContributionMode
    : null
}

function readMetadataMode(metadata?: Record<string, unknown> | null) {
  if (!metadata) return null
  return normalizeDurationContributionMode(
    metadata.durationContributionMode
      ?? metadata.duration_contribution_mode
      ?? metadata.durationMode
      ?? metadata.duration_mode,
  )
}

export function isDurationBearingContributionMode(value: unknown) {
  return (normalizeDurationContributionMode(value) ?? 'duration_bearing') === 'duration_bearing'
}

export function inferDurationContributionMode(input: {
  name?: unknown
  metadata?: Record<string, unknown> | null
  planItemKind?: unknown
  relationRole?: unknown
} = {}): DurationContributionMode {
  const explicit = readMetadataMode(input.metadata)
  if (explicit) return explicit

  const planItemKind = String(input.planItemKind ?? input.metadata?.planItemKind ?? input.metadata?.plan_item_kind ?? '').trim()
  if (planItemKind === 'milestone' || planItemKind === 'linked_projection') return 'handover_marker'
  if (planItemKind === 'document_task' || planItemKind === 'commercial_task') return 'record_only'
  if (planItemKind === 'inspection_task' || planItemKind === 'safety_control') return 'quality_gate'

  const relationRole = String(input.relationRole ?? input.metadata?.relationRole ?? input.metadata?.relation_role ?? '').trim()
  if (relationRole === 'handover') return 'handover_marker'
  if (relationRole === 'evidence') return 'record_only'
  if (relationRole === 'inspection') return 'quality_gate'

  const text = stripParentheticalContext(String(input.name ?? '').trim())
  if (!text) return 'duration_bearing'

  if (includesFieldCommissioningDurationWork(text)) return 'duration_bearing'
  if (includesFieldFunctionalTestDurationWork(text)) return 'duration_bearing'
  if (includesFieldPhysicalTestDurationWork(text)) return 'duration_bearing'
  if (includesFieldPressureTestDurationWork(text)) return 'duration_bearing'
  if (includesFieldFlushingValidationDurationWork(text)) return 'duration_bearing'
  if (includesFieldRemediationClosureDurationWork(text)) return 'duration_bearing'

  if (
    includesAny(text, ['\u4ea4\u63a5\u7b7e\u8ba4', '\u79fb\u4ea4\u7b7e\u8ba4'])
    && includesAny(text, ['\u590d\u6d4b', '\u9a8c\u6536', '\u89c2\u611f', '\u529f\u80fd', '\u8d28\u91cf', '\u8282\u80fd'])
  ) return 'handover_marker'
  if (includesAny(text, ['\u65bd\u5de5\u8bb8\u53ef\u8bc1\u5f00\u5de5\u4ee4\u53d6\u5f97', '\u5f00\u5de5\u4ee4\u53d6\u5f97'])) return 'handover_marker'
  if (includesAny(text, ['\u81ea\u68c0\u9a8c\u6536', '\u6574\u673a\u5b89\u88c5\u81ea\u68c0\u9a8c\u6536'])) return 'quality_gate'
  if (includesAny(text, HANDOVER_MARKER_COMPOUND_TERMS)) return 'handover_marker'
  if (includesAny(text, ['\u62c6\u6a21\u5f3a\u5ea6\u62a5\u544a\u590d\u6838', '\u62c6\u6a21\u62a5\u544a\u590d\u6838'])) return 'quality_gate'
  if (includesAny(text, ['\u6869\u57fa\u9a8c\u6536\u590d\u6838'])) return 'quality_gate'
  if (includesFieldActionPreparationContext(text)) return 'embedded_check'
  if (includesFieldActionGateContext(text)) return 'quality_gate'
  if (includesAny(text, RECORD_ONLY_COMPOUND_TERMS)) return 'record_only'
  if (includesAny(text, STRONG_RECORD_ONLY_CLOSURE_TERMS)) return 'record_only'
  if (includesAny(text, RECTIFICATION_RECHECK_TERMS)) return 'quality_gate'
  if (includesAny(text, QUALITY_GATE_COMPOUND_TERMS)) return 'quality_gate'
  if (includesAny(text, PHYSICAL_TEST_GATE_TERMS)) return 'quality_gate'
  if (includesAny(text, STRONG_EMBEDDED_CHECK_TERMS)) return 'embedded_check'
  if (includesAny(text, ['\u5f00\u7bb1\u9a8c\u6536'])) return 'quality_gate'
  if (includesAny(text, ['\u8d28\u91cf\u590d\u6838\u548c\u9690\u853d\u9a8c\u6536'])) return 'quality_gate'

  const hasExplicitDurationAction = includesAny(text, EXPLICIT_DURATION_ACTION_TERMS)
  const hasDurationAction = hasExplicitDurationAction || includesAny(text, DURATION_BEARING_ACTION_TERMS)
  const hasPhysicalWork = includesAny(
    removeTerms(removeTerms(text, PHYSICAL_CONTEXT_ONLY_TERMS), FIELD_COMMISSIONING_CONTEXT_ONLY_TERMS),
    PHYSICAL_WORK_TERMS,
  )
  const hasStrongQualityGate = includesAny(text, STRONG_QUALITY_GATE_TERMS)
  if (includesAny(text, [...HANDOVER_TERMS, ...HANDOVER_SUPPLEMENTAL_TERMS]) && !hasPhysicalWork) return 'handover_marker'
  if (includesAny(text, [...EXTERNAL_WAIT_TERMS, ...EXTERNAL_WAIT_SUPPLEMENTAL_TERMS]) && !hasPhysicalWork) return 'external_wait'
  if (includesAny(text, [...RECORD_ONLY_TERMS, ...RECORD_ONLY_SUPPLEMENTAL_TERMS]) && !hasPhysicalWork) return 'record_only'
  if (hasStrongQualityGate && includesAny(text, QUALITY_GATE_CONTEXT_TERMS) && !hasPhysicalWork) return 'quality_gate'
  if (includesAny(text, [...EMBEDDED_CHECK_TERMS, ...EMBEDDED_CHECK_SUPPLEMENTAL_TERMS]) && !hasPhysicalWork) return 'embedded_check'
  if (hasStrongQualityGate && !hasPhysicalWork) return 'quality_gate'
  if (hasDurationAction) return 'duration_bearing'
  if (includesAny(text, [...QUALITY_GATE_TERMS, ...QUALITY_GATE_SUPPLEMENTAL_TERMS]) && !hasPhysicalWork) return 'quality_gate'

  return 'duration_bearing'
}

export function describeDurationContributionMode(mode: DurationContributionMode) {
  switch (mode) {
    case 'embedded_check':
      return '内嵌检查项，不单独承载施工工期'
    case 'quality_gate':
      return '质量门禁项，不按普通施工工期排期'
    case 'external_wait':
      return '外部等待项，等待周期由约束或验收规则处理'
    case 'record_only':
      return '资料记录项，不独立贡献计划工期'
    case 'handover_marker':
      return '移交节点项，作为节点或条件而非普通工期'
    case 'duration_bearing':
    default:
      return '施工承载工序，参与参考工期计算'
  }
}
