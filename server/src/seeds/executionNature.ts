export type ExecutionNature =
  | 'physical_work'
  | 'technical_preparation'
  | 'inspection_test'
  | 'monitoring_wait'
  | 'document_record'
  | 'management_action'
  | 'handover_milestone'

export const EXECUTION_NATURES: ExecutionNature[] = [
  'physical_work',
  'technical_preparation',
  'inspection_test',
  'monitoring_wait',
  'document_record',
  'management_action',
  'handover_milestone',
]

const PHYSICAL_WORK_TERMS = [
  '\u6837\u677f\u65bd\u5de5',
  '\u6837\u677f\u6bb5\u65bd\u5de5',
  '\u9996\u4ef6\u65bd\u5de5',
  '\u9996\u6bb5\u65bd\u5de5',
  '\u65bd\u5de5',
  '\u5b89\u88c5',
  '\u5236\u4f5c',
  '\u52a0\u5de5',
  '\u4e0b\u6599',
  '\u7ec4\u7acb',
  '\u6d47\u7b51',
  '\u7ed1\u624e',
  '\u652f\u8bbe',
  '\u642d\u8bbe',
  '\u6577\u8bbe',
  '\u540a\u88c5',
  '\u5f00\u6316',
  '\u56de\u586b',
  '\u780c\u7b51',
  '\u62b9\u7070',
  '\u94fa\u8d34',
  '\u94fa\u8bbe',
  '\u94fa\u88c5',
  '\u710a\u63a5',
  '\u70d8\u5e72',
  '\u6d82\u5237',
  '\u55b7\u6d82',
  '\u6253\u80f6',
  '\u5c01\u5835',
  '\u5c01\u95ed',
  '\u6e05\u7406',
  '\u5904\u7406',
  '\u5f00\u69fd',
  '\u56fa\u5b9a',
  '\u8fde\u63a5',
  '\u521d\u62e7',
  '\u7ec8\u62e7',
  '\u704c\u6d46',
  '\u6ce8\u6d46',
  '\u538b\u704c',
  '\u63d0\u94bb',
  '\u5c01\u4ed3',
  '\u5f20\u62c9',
  '\u538b\u6d46',
  '\u538b\u6869',
  '\u6c89\u6869',
  '\u690d\u7b4b',
  '\u517b\u62a4',
  '\u8c03\u8bd5',
  '\u8054\u8c03',
  '\u8bd5\u8fd0\u8f6c',
  '\u8bd5\u8fd0\u884c',
  '\u8bd5\u538b',
  '\u51b2\u6d17',
  '\u6d88\u6bd2',
  '\u4fdd\u6e29',
  '\u9632\u8150',
  '\u9664\u9508',
  '\u4fee\u8865',
  'install',
  'installation',
  'fabrication',
  'erection',
  'casting',
  'pouring',
  'excavation',
  'backfill',
  'commissioning',
]

const PHYSICAL_PROGRESS_TERMS = [
  '\u6837\u677f\u65bd\u5de5',
  '\u6837\u677f\u6bb5\u65bd\u5de5',
  '\u9996\u4ef6\u65bd\u5de5',
  '\u9996\u6bb5\u65bd\u5de5',
  '\u65bd\u5de5',
  '\u5b89\u88c5',
  '\u5236\u4f5c',
  '\u52a0\u5de5',
  '\u4e0b\u6599',
  '\u7ec4\u7acb',
  '\u6d47\u7b51',
  '\u632f\u6363',
  '\u7ed1\u624e',
  '\u652f\u8bbe',
  '\u642d\u8bbe',
  '\u6577\u8bbe',
  '\u540a\u88c5',
  '\u5f00\u6316',
  '\u56de\u586b',
  '\u780c\u7b51',
  '\u62b9\u7070',
  '\u94fa\u8d34',
  '\u94fa\u8bbe',
  '\u94fa\u88c5',
  '\u710a\u63a5',
  '\u6d82\u5237',
  '\u55b7\u6d82',
  '\u6253\u80f6',
  '\u5c01\u5835',
  '\u5c01\u95ed',
  '\u6e05\u7406',
  '\u5904\u7406',
  '\u5f00\u69fd',
  '\u56fa\u5b9a',
  '\u8fde\u63a5',
  '\u521d\u62e7',
  '\u7ec8\u62e7',
  '\u704c\u6d46',
  '\u6ce8\u6d46',
  '\u538b\u704c',
  '\u63d0\u94bb',
  '\u5c01\u4ed3',
  '\u5f20\u62c9',
  '\u538b\u6d46',
  '\u538b\u6869',
  '\u6c89\u6869',
  '\u690d\u7b4b',
  '\u517b\u62a4',
  '\u8c03\u8bd5',
  '\u8054\u8c03',
  '\u8bd5\u8fd0\u8f6c',
  '\u8bd5\u8fd0\u884c',
  '\u8bd5\u538b',
  '\u51b2\u6d17',
  '\u6d88\u6bd2',
  '\u4fdd\u6e29',
  '\u9632\u8150',
  '\u9664\u9508',
  '\u4fee\u8865',
  'fabrication',
  'erection',
  'casting',
  'pouring',
  'excavation',
  'backfill',
  'commissioning',
]

const STRONG_MANAGEMENT_TERMS = [
  '\u65b9\u6848',
  '\u5ba1\u6279',
  '\u5ba1\u6838',
  '\u8bba\u8bc1',
  '\u8bc6\u522b',
  '\u6e05\u5355',
  '\u62a5\u5ba1',
  '\u529e\u7406',
  '\u7f16\u5236',
  '\u4f1a\u7b7e',
  '\u95ee\u9898\u6574\u6539',
  '\u95ee\u9898\u5904\u7406',
  '\u6574\u6539\u95ed\u5408',
  '\u95ee\u9898\u9500\u9879',
  '\u9500\u9879',
]

const STRONG_DOCUMENT_TERMS = [
  '\u8d44\u6599',
  '\u8d44\u6599\u6838\u9a8c',
  '\u8bb0\u5f55',
  '\u53f0\u8d26',
  '\u5f52\u6863',
  '\u7ec4\u5377',
  '\u7b7e\u8ba4',
  '\u62a5\u544a',
]

const STRONG_INSPECTION_TERMS = [
  '\u5b9e\u6d4b\u5b9e\u91cf',
  '\u5b9e\u6d4b',
  '\u590d\u6d4b',
  '\u504f\u5dee',
  '\u5408\u683c\u786e\u8ba4',
  '\u590d\u67e5',
  '\u8d28\u91cf\u590d\u6d4b',
  '\u529f\u80fd\u590d\u6d4b',
  '\u6750\u6599\u9a8c\u6536',
  '\u8bd5\u5757\u7559\u7f6e',
  '\u5916\u89c2\u6570\u91cf\u68c0\u67e5',
  '\u5782\u76f4\u5e73\u6574\u68c0\u67e5',
  '\u6210\u578b\u5c3a\u5bf8\u68c0\u67e5',
  '\u5916\u89c2\u7f3a\u9677\u68c0\u67e5',
  '\u710a\u7f1d\u5916\u89c2\u68c0\u67e5',
  '\u52a0\u5de5\u8bbe\u5907\u68c0\u67e5',
]

const STRONG_MONITORING_TERMS = [
  '\u76d1\u6d4b',
  '\u89c2\u6d4b',
  '\u6d4b\u6e29',
  '\u6c89\u964d',
  '\u4f4d\u79fb',
]

const STRONG_TECHNICAL_PREPARATION_TERMS = [
  '\u4f5c\u4e1a\u9762\u51c6\u5907',
  '\u4f5c\u4e1a\u9762\u786e\u8ba4',
  '\u51c6\u5907\u4e0e\u4ea4\u5e95',
  '\u5de5\u827a\u8bc4\u5b9a',
  '\u4f5c\u4e1a\u4ea4\u5e95',
  '\u63aa\u65bd\u4ea4\u5e95',
  '\u5de5\u827a\u53c2\u6570\u63a7\u5236',
  '\u65bd\u5de5\u53c2\u6570\u786e\u8ba4',
  '\u6761\u4ef6\u786e\u8ba4',
  'workface readiness',
  'work face readiness',
  'operation surface readiness',
  'readiness confirmation',
]

const PHYSICAL_TEST_OPERATION_TERMS = [
  'water pressure test',
  '\u901a\u7403\u8bd5\u9a8c',
  '\u704c\u6c34\u8bd5\u9a8c',
  '\u901a\u6c34\u8bd5\u9a8c',
  '\u95ed\u6c34\u8bd5\u9a8c',
  '\u6ee1\u6c34\u8bd5\u9a8c',
  '\u84c4\u6c34\u8bd5\u9a8c',
  '\u6dcb\u6c34\u8bd5\u9a8c',
  '\u95ed\u6c34\u6216\u6dcb\u6c34\u8bd5\u9a8c',
  '\u6dcb\u6c34\u6216\u84c4\u6c34\u8bd5\u9a8c',
  '\u84c4\u6c34\u6dcb\u6c34\u8bd5\u9a8c',
  '\u704c\u6c34\u901a\u7403\u548c\u901a\u6c34\u8bd5\u9a8c',
  '\u6f0f\u98ce\u91cf\u6216\u6f0f\u5149\u6d4b\u8bd5',
  '\u6f0f\u98ce\u91cf\u548c\u65ad\u9762\u98ce\u901f\u6d4b\u8bd5',
  '\u6f0f\u98ce\u91cf\u6216\u4e25\u5bc6\u6027\u6d4b\u8bd5',
  '\u98ce\u7ba1\u6f0f\u5149\u6f0f\u98ce\u91cf\u6d4b\u8bd5',
  '\u7edd\u7f18\u7535\u963b',
  '\u63a5\u5730\u8fde\u7eed\u6027',
  '\u63a5\u5730\u5bfc\u901a',
  '\u8bd5\u5c04\u548c\u8054\u52a8\u6d4b\u8bd5',
  '\u5355\u673a\u8bd5\u8fd0\u8f6c',
  '\u7cfb\u7edf\u8bd5\u8fd0\u884c',
  '\u8054\u52a8\u8c03\u8bd5',
  '\u5e26\u8f7d\u6d4b\u8bd5',
  '\u8d1f\u8f7d\u5207\u6362\u6d4b\u8bd5',
  '\u5e26\u6599\u529f\u80fd\u6d4b\u8bd5',
  '\u6a21\u62df\u6545\u969c\u5207\u6362',
  '\u4e3b\u5907\u5207\u6362\u6f14\u7ec3',
  '\u5e94\u6025\u65c1\u8def\u56de\u5207\u6f14\u7ec3',
  '\u9ed1\u542f\u52a8\u548c\u5e26\u8f7d\u8bd5\u9a8c',
  '\u7a7a\u8f7d\u548c\u5e26\u6599\u529f\u80fd\u6d4b\u8bd5',
]

const FIELD_COMMISSIONING_OPERATION_TERMS = [
  '\u5355\u673a\u8bd5\u8fd0\u884c',
  '\u8054\u52a8\u8bd5\u8fd0\u884c',
  '\u901a\u7535\u8bd5\u8fd0\u884c',
  '\u5347\u6e29\u8bd5\u8fd0\u884c',
  '\u5e26\u8f7d\u8bd5\u8fd0\u884c',
  '\u7a7a\u8f7d\u8bd5\u8fd0\u884c',
  '\u8fde\u7eed\u8bd5\u8fd0\u884c',
  '\u8bd5\u8fd0\u884c',
  '\u5355\u673a\u8bd5\u8fd0\u8f6c',
  '\u8054\u5408\u8bd5\u8fd0\u8f6c',
  '\u8bd5\u8fd0\u8f6c',
  '\u7cfb\u7edf\u8054\u52a8\u8c03\u8bd5',
  '\u8054\u52a8\u8c03\u8bd5',
  '\u7cfb\u7edf\u8054\u8c03',
  '\u7cfb\u7edf\u8c03\u8bd5',
  '\u6c34\u529b\u5e73\u8861\u8c03\u8bd5',
  '\u70ed\u529b\u5e73\u8861\u8c03\u8bd5',
  '\u5e73\u8861\u8c03\u8bd5',
]

const FIELD_COMMISSIONING_CONTEXT_ONLY_TERMS = [
  '\u8c03\u8bd5\u65b9\u6848',
  '\u8c03\u8bd5\u6761\u4ef6',
  '\u8c03\u8bd5\u8303\u56f4',
  '\u8c03\u8bd5\u811a\u672c',
  '\u8c03\u8bd5\u53c2\u6570\u590d\u6838',
  '\u8c03\u8bd5\u8bb0\u5f55',
  '\u8c03\u8bd5\u62a5\u544a',
  '\u8c03\u8bd5\u8d44\u6599',
  '\u8c03\u8bd5\u524d',
  '\u8bd5\u8fd0\u884c\u6761\u4ef6',
  '\u8bd5\u8fd0\u884c\u6570\u636e',
  '\u8bd5\u8fd0\u884c\u8bb0\u5f55',
  '\u8bd5\u8fd0\u884c\u62a5\u544a',
  '\u8bd5\u8fd0\u884c\u524d',
  '\u8bd5\u8fd0\u8f6c\u524d',
]

const FIELD_FUNCTIONAL_TEST_OPERATION_TERMS = [
  '\u529f\u80fd\u6d4b\u8bd5',
  '\u8054\u52a8\u6d4b\u8bd5',
  '\u8054\u52a8\u529f\u80fd\u6d4b\u8bd5',
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

const NON_PHYSICAL_TEST_CONTEXT_TERMS = [
  '\u65b9\u6848',
  '\u6761\u4ef6\u786e\u8ba4',
  '\u786e\u8ba4',
  '\u8bb0\u5f55',
  '\u62a5\u544a',
  '\u8d44\u6599',
  '\u6838\u67e5',
  '\u5f52\u6863',
  '\u7b7e\u8ba4',
  '\u6574\u6539',
  '\u9500\u9879',
  '\u95ed\u5408',
  '\u590d\u67e5',
  '\u4ea4\u63a5',
  '\u79fb\u4ea4',
  '\u4f5c\u4e1a\u9762',
  '\u5b9e\u6d4b',
  '\u68c0\u67e5',
  '\u9a8c\u6536',
  '\u62a5\u544a\u7b7e\u8ba4',
  '\u62a5\u544a\u5f52\u6863',
  '\u8d44\u6599\u63d0\u4ea4',
  '\u8bc1\u636e\u8865\u9f50',
  '\u53f0\u8d26\u5efa\u7acb',
]

const DOCUMENT_SIGNOFF_TERMS = [
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
  '\u8d44\u6599\u7b7e\u8ba4',
  '\u8d44\u6599\u5f52\u6863',
  '\u6570\u636e\u6c47\u603b',
  '\u8bb0\u5f55\u590d\u6838',
  '\u6d4b\u91cf\u6210\u679c\u8bb0\u5f55',
  '\u68c0\u6d4b\u8bb0\u5f55',
  '\u5145\u76c8\u7cfb\u6570\u8bb0\u5f55',
  '\u9690\u853d\u5f71\u50cf\u7b7e\u8ba4',
  '\u5f71\u50cf\u7b7e\u8ba4',
  '\u53f0\u8d26\u95ed\u5408',
  '\u786e\u8ba4\u8bb0\u5f55',
  '\u7ae3\u5de5\u56fe\u56de\u5199',
  'FAT\u8d44\u6599\u6838\u9a8c',
  'FAT\u8bb0\u5f55\u6838\u9a8c',
  'SAT\u62a5\u544a\u7b7e\u8ba4',
  'SAT\u62a5\u544a\u7b7e\u8ba4\u5f52\u6863',
  'IQ\u62a5\u544a\u7b7e\u8ba4',
  'IQ\u62a5\u544a\u7b7e\u8ba4\u5f52\u6863',
  'OQ\u62a5\u544a\u7b7e\u8ba4',
  'OQ\u62a5\u544a\u7b7e\u8ba4\u5f52\u6863',
  'PQ\u62a5\u544a\u7b7e\u8ba4',
  '\u9a8c\u8bc1\u62a5\u544a\u7b7e\u8ba4\u5f52\u6863',
  'SOP\u63d0\u4ea4',
  '\u5907\u54c1\u5907\u4ef6\u79fb\u4ea4',
]

const INSPECTION_SIGNOFF_TERMS = [
  '\u9a8c\u6536\u7b7e\u8ba4',
  '\u9690\u853d\u7b7e\u8ba4',
  '\u9690\u853d\u9a8c\u6536\u7b7e\u8ba4',
  '\u53c2\u6570\u7b7e\u8ba4',
  '\u590d\u9a8c\u7b7e\u8ba4',
  '\u6574\u6539\u590d\u9a8c\u7b7e\u8ba4',
  '\u9a8c\u6536\u6d4b\u8bd5\u6267\u884c\u548c\u8fc7\u7a0b\u8bb0\u5f55',
  '\u590d\u6d4b\u548c\u9690\u853d\u7b7e\u8ba4',
  '\u81ea\u68c0\u9a8c\u6536',
  '\u6574\u673a\u5b89\u88c5\u81ea\u68c0\u9a8c\u6536',
  '\u95ed\u5408\u68c0\u67e5\u9a8c\u6536',
  'FAT\u9a8c\u6536',
  'SAT\u9a8c\u6536',
  'UAT\u573a\u666f\u6d4b\u8bd5',
  '\u9a8c\u8bc1\u62a5\u544a\u7b7e\u8ba4',
  '\u53ef\u7528\u6027\u9a8c\u6536\u7b7e\u8ba4',
]

const PHYSICAL_WITH_QUALITY_RETEST_TERMS = [
  '\u51b2\u6d17',
  '\u9632\u8150',
  '\u6d88\u6bd2',
  '\u8bd5\u538b',
  '\u8c03\u8bd5',
]

const QUALITY_RETEST_TERMS = [
  '\u8d28\u91cf\u590d\u6d4b',
  '\u529f\u80fd\u590d\u6d4b',
]

const TECHNICAL_PREPARATION_TERMS = [
  '\u786e\u8ba4',
  '\u590d\u6838',
  '\u6838\u5bf9',
  '\u6d4b\u91cf',
  '\u653e\u7ebf',
  '\u5b9a\u4f4d',
  '\u6807\u9ad8',
  '\u6837\u677f',
  '\u914d\u5408\u6bd4',
  '\u53c2\u6570',
  '\u6df1\u5316',
  '\u6392\u7248',
  '\u56fe\u7eb8',
  '\u6761\u4ef6',
  'layout',
  'setting out',
  'mockup',
  'readiness',
  'confirmation',
]

const INSPECTION_TEST_TERMS = [
  '\u9a8c\u6536',
  '\u68c0\u6d4b',
  '\u68c0\u67e5',
  '\u8bd5\u9a8c',
  '\u6d4b\u8bd5',
  '\u590d\u9a8c',
  '\u9001\u68c0',
  '\u89c1\u8bc1\u53d6\u6837',
  '\u9690\u853d',
  '\u9a8c\u69fd',
  '\u63a2\u4f24',
  'acceptance',
  'inspection',
  'test',
]

const MONITORING_WAIT_TERMS = [
  '\u76d1\u6d4b',
  '\u8fde\u7eed\u8fd0\u884c',
  '\u517b\u62a4',
  '\u7b49\u5f85',
  '\u95f4\u6b47',
  '\u62a5\u544a\u63a5\u6536',
  '\u5f3a\u5ea6\u62a5\u544a',
  '\u6c89\u964d',
  '\u6d4b\u6e29',
  '\u89c2\u6d4b',
  'monitoring',
  'curing',
  'wait',
]

const DOCUMENT_RECORD_TERMS = [
  '\u8d44\u6599',
  '\u8bb0\u5f55',
  '\u53f0\u8d26',
  '\u5f52\u6863',
  '\u7ec4\u5377',
  '\u7b7e\u8ba4',
  '\u62a5\u5ba1',
  '\u62a5\u9a8c',
  'document',
  'record',
  'archive',
  'submittal',
]

const MANAGEMENT_ACTION_TERMS = [
  '\u65b9\u6848',
  '\u5ba1\u6279',
  '\u5ba1\u6838',
  '\u8bba\u8bc1',
  '\u4ea4\u5e95',
  '\u7ec4\u7ec7',
  '\u534f\u8c03',
  '\u6e05\u5355',
  '\u8ba1\u5212',
  '\u8bc6\u522b',
  '\u8d44\u683c',
  '\u8bb8\u53ef',
  '\u529e\u7406',
  '\u7f16\u5236',
  'approval',
  'coordination',
  'briefing',
  'URS',
  'DQ',
  'CAPA',
  'SOP',
]

const HANDOVER_TERMS = [
  '\u79fb\u4ea4',
  '\u4ea4\u63a5',
  '\u4ea4\u4ed8',
  '\u7ae3\u5de5',
  '\u5907\u6848',
  '\u6295\u8fd0',
  '\u901a\u8fc7',
  'handover',
  'turnover',
]

function includesAny(text: string, terms: string[]) {
  const normalized = text.toLowerCase()
  return terms.some((term) => normalized.includes(term.toLowerCase()))
}

function isStructuralSettlementJointText(text: string) {
  return includesAny(text, [
    '\u6c89\u964d\u7f1d',
    '\u4f38\u7f29\u7f1d',
    '\u53d8\u5f62\u7f1d',
  ])
}

function isInstallAcceptanceCheckText(text: string) {
  if (!includesAny(text, ['\u5b89\u88c5']) || !includesAny(text, ['\u9a8c\u6536'])) return false
  return !includesAny(text, [
    '\u6577\u8bbe',
    '\u63a5\u7ebf',
    '\u7aef\u63a5',
    '\u5730\u5740\u7f16\u7801',
    '\u90e8\u4ef6\u5b89\u88c5\u8c03\u6574',
    '\u5b89\u88c5\u7aef\u63a5',
    '\u5b89\u88c5\u8c03\u6574',
    '\u6d47\u7b51',
    '\u517b\u62a4',
    '\u8fc7\u7a0b\u65bd\u5de5',
    '\u65bd\u5de5',
    '\u5f00\u6316',
    '\u56de\u586b',
    '\u780c\u7b51',
    '\u710a\u63a5',
    '\u642d\u8bbe',
    '\u540a\u88c5',
    '\u5236\u4f5c',
    '\u52a0\u5de5',
    '\u8c03\u8bd5',
    '\u8bd5\u8fd0\u884c',
    '\u8bd5\u8fd0\u8f6c',
  ])
}

function isPhysicalTestOperationText(text: string) {
  return includesAny(text, PHYSICAL_TEST_OPERATION_TERMS)
    && (
      !includesAny(text, NON_PHYSICAL_TEST_CONTEXT_TERMS)
      || includesAny(text, ['\u6267\u884c'])
    )
}

function removeTerms(text: string, terms: string[]) {
  return terms.reduce((current, term) => current.split(term).join(''), text)
}

function isFieldCommissioningOperationText(text: string) {
  if (!includesAny(text, FIELD_COMMISSIONING_OPERATION_TERMS)) return false

  const fieldWorkText = removeTerms(text, FIELD_COMMISSIONING_CONTEXT_ONLY_TERMS)
  return includesAny(fieldWorkText, FIELD_COMMISSIONING_OPERATION_TERMS)
}

function isFieldFunctionalTestOperationText(text: string) {
  if (!includesAny(text, FIELD_FUNCTIONAL_TEST_OPERATION_TERMS)) return false

  const fieldWorkText = removeTerms(text, FIELD_FUNCTIONAL_TEST_CONTEXT_ONLY_TERMS)
  return includesAny(fieldWorkText, FIELD_FUNCTIONAL_TEST_OPERATION_TERMS)
}

function hasPhysicalWorkWithQualityRetest(text: string) {
  return includesAny(text, PHYSICAL_WITH_QUALITY_RETEST_TERMS)
    && includesAny(text, QUALITY_RETEST_TERMS)
    && !includesAny(text, NON_PHYSICAL_TEST_CONTEXT_TERMS)
}

function stripParentheticalContext(text: string) {
  return text.replace(/[\uFF08(][^\uFF09)]*[\uFF09)]/g, '')
}

function isDocumentSignoffText(text: string) {
  return includesAny(stripParentheticalContext(text), DOCUMENT_SIGNOFF_TERMS)
}

function isInspectionSignoffText(text: string) {
  return includesAny(stripParentheticalContext(text), INSPECTION_SIGNOFF_TERMS)
}

export function normalizeExecutionNature(value: unknown): ExecutionNature | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return EXECUTION_NATURES.includes(normalized as ExecutionNature)
    ? normalized as ExecutionNature
    : null
}

function readMetadataNature(metadata?: Record<string, unknown> | null) {
  if (!metadata) return null
  return normalizeExecutionNature(
    metadata.executionNature
      ?? metadata.execution_nature
      ?? metadata.executionKind
      ?? metadata.execution_kind,
  )
}

export function inferExecutionNature(input: {
  name?: unknown
  metadata?: Record<string, unknown> | null
  planItemKind?: unknown
  relationRole?: unknown
  durationContributionMode?: unknown
} = {}): ExecutionNature {
  const explicit = readMetadataNature(input.metadata)
  if (explicit) return explicit

  const planItemKind = String(input.planItemKind ?? input.metadata?.planItemKind ?? input.metadata?.plan_item_kind ?? '').trim()
  const relationRole = String(input.relationRole ?? input.metadata?.relationRole ?? input.metadata?.relation_role ?? '').trim()
  const text = String(input.name ?? '').trim()
  const semanticText = stripParentheticalContext(text)
  const durationMode = String(input.durationContributionMode ?? input.metadata?.durationContributionMode ?? input.metadata?.duration_contribution_mode ?? '').trim()

  const hasPhysicalWork = includesAny(semanticText, PHYSICAL_WORK_TERMS)
  const hasManagement = includesAny(semanticText, MANAGEMENT_ACTION_TERMS)
  const hasTechnicalPreparation = includesAny(semanticText, TECHNICAL_PREPARATION_TERMS)
  const hasInspection = includesAny(semanticText, INSPECTION_TEST_TERMS)
  const hasMonitoringWait = includesAny(semanticText, MONITORING_WAIT_TERMS)
  const hasDocumentRecord = includesAny(semanticText, DOCUMENT_RECORD_TERMS)
  const hasHandover = includesAny(semanticText, HANDOVER_TERMS)
  const hasPhysicalProgress = includesAny(semanticText, PHYSICAL_PROGRESS_TERMS)
  const hasStrongManagement = includesAny(semanticText, STRONG_MANAGEMENT_TERMS)
  const hasStrongDocument = includesAny(semanticText, STRONG_DOCUMENT_TERMS)
  const hasStrongInspection = includesAny(semanticText, STRONG_INSPECTION_TERMS)
  const hasStrongMonitoring = includesAny(semanticText, STRONG_MONITORING_TERMS)
  const hasStrongTechnicalPreparation = includesAny(semanticText, STRONG_TECHNICAL_PREPARATION_TERMS)
  const hasPhysicalTestOperation = isPhysicalTestOperationText(semanticText)
  const hasFieldCommissioningOperation = durationMode === 'duration_bearing' && isFieldCommissioningOperationText(semanticText)
  const hasFieldFunctionalTestOperation = durationMode === 'duration_bearing' && isFieldFunctionalTestOperationText(semanticText)

  if (hasFieldCommissioningOperation || hasFieldFunctionalTestOperation) return 'physical_work'

  if (
    includesAny(semanticText, ['\u7efc\u5408\u8054\u8c03\u548c\u95ee\u9898\u6574\u6539'])
    && !includesAny(semanticText, ['\u6a21\u62df\u6f14\u7ec3', '\u95ed\u5408', '\u62a5\u544a', '\u8bb0\u5f55'])
  ) return 'physical_work'
  if (includesAny(semanticText, ['\u56f4\u62a4\u65bd\u5de5']) && !includesAny(semanticText, ['\u6761\u4ef6\u6216\u6570\u636e\u6838\u67e5', '\u786e\u8ba4\u8bb0\u5f55'])) return 'physical_work'
  if (includesAny(semanticText, ['\u6d88\u9632\u5668\u6750\u548c\u8d23\u4efb\u724c\u914d\u7f6e', '\u6d88\u9632\u5668\u6750\u914d\u7f6e', '\u8d23\u4efb\u724c\u914d\u7f6e'])) return 'physical_work'
  if (hasHandover && hasDocumentRecord && !hasPhysicalProgress) return 'document_record'
  if (hasHandover && !hasPhysicalProgress) return 'handover_milestone'
  if (hasStrongManagement && includesAny(semanticText, [
    '\u65b9\u6848',
    '\u8bbe\u8ba1',
    '\u5ba1\u6279',
    '\u5ba1\u6838',
    '\u8bba\u8bc1',
    '\u62a5\u5ba1',
    '\u6e05\u5355',
    '\u529e\u7406',
    '\u7f16\u5236',
    '\u4f1a\u7b7e',
    '\u95ee\u9898\u5904\u7406',
    '\u95ee\u9898\u6574\u6539',
    '\u6574\u6539\u95ed\u5408',
    '\u95ee\u9898\u9500\u9879',
    '\u9500\u9879',
  ])) return 'management_action'
  if (hasStrongDocument && includesAny(semanticText, [
    '\u8bb0\u5f55\u7b7e\u8ba4',
    '\u8d44\u6599\u6574\u7406',
    '\u53cc\u65b9\u7b7e\u8ba4',
    '\u62a5\u544a\u7b7e\u8ba4',
    '\u7b7e\u8ba4\u5f52\u6863',
    '\u62a5\u544a\u95ed\u5408',
    '\u68c0\u6d4b\u62a5\u544a',
    '\u8bd5\u9a8c\u62a5\u544a',
    '\u8d44\u6599\u5f52\u6863',
    '\u8d44\u6599\u7ec4\u5377',
    '\u8bb0\u5f55\u95ed\u5408',
  ])) return 'document_record'
  if (isDocumentSignoffText(text)) return 'document_record'
  if (isInspectionSignoffText(text)) return 'inspection_test'
  if (
    durationMode === 'record_only'
    && includesAny(semanticText, [
      '\u8d44\u6599',
      '\u8bb0\u5f55',
      '\u5f52\u6863',
      '\u62a5\u544a',
      '\u6761\u4ef6',
      '\u786e\u8ba4',
      '\u6838\u9a8c',
      '\u590d\u6838',
      '\u70b9\u4f4d\u8def\u7531',
      '\u987a\u5e8f',
      '\u95ed\u5408',
      '\u7b7e\u8ba4',
      '\u7ed3\u7b97',
      '\u8ba1\u91cf',
      '\u7ae3\u5de5\u56fe',
      '\u6807\u8bc6',
    ])
    && !hasPhysicalTestOperation
  ) return 'document_record'
  if (
    durationMode === 'handover_marker'
    && includesAny(semanticText, ['\u4ea4\u63a5', '\u79fb\u4ea4', '\u4ea4\u4ed8', '\u7b7e\u8ba4', '\u5b8c\u6210', '\u901a\u8fc7', '\u53d6\u5f97', '\u8bb8\u53ef\u8bc1', '\u5f00\u5de5\u4ee4'])
  ) return 'handover_milestone'
  if (
    durationMode === 'external_wait'
    && includesAny(semanticText, ['\u590d\u9a8c', '\u9001\u68c0', '\u68c0\u6d4b', '\u8bd5\u9a8c', '\u8fdb\u573a'])
  ) return 'inspection_test'
  if (includesAny(semanticText, ['\u8bd5\u5757\u7559\u7f6e', '\u8bd5\u4ef6\u7559\u7f6e', '\u89c1\u8bc1\u53d6\u6837']) && !includesAny(semanticText, ['\u6d47\u7b51', '\u65bd\u5de5'])) return 'inspection_test'
  if (
    includesAny(stripParentheticalContext(text), ['\u8d28\u91cf\u590d\u6d4b', '\u529f\u80fd\u590d\u6d4b', '\u590d\u9a8c\u7b7e\u8ba4', '\u4ea4\u63a5\u7b7e\u8ba4'])
    && !includesAny(stripParentheticalContext(text), ['\u65bd\u5de5', '\u6267\u884c', '\u5b89\u88c5', '\u6d82\u5237', '\u55b7\u6d82', '\u51b2\u6d17', '\u8bd5\u538b', '\u8c03\u8bd5'])
  ) return 'inspection_test'
  if (includesAny(semanticText, ['\u5408\u683c\u786e\u8ba4']) && !includesAny(semanticText, ['\u6267\u884c', '\u65bd\u5de5'])) return 'inspection_test'
  if (
    durationMode === 'quality_gate'
    && includesAny(semanticText, [
      '\u9a8c\u6536\u7ed3\u8bba\u7b7e\u8ba4',
      '\u73b0\u573a\u62bd\u67e5\u590d\u6838',
      '\u73b0\u573a\u590d\u67e5\u590d\u6d4b',
      '\u95ee\u9898\u6574\u6539\u590d\u67e5',
      '\u6574\u6539\u8d23\u4efb\u786e\u8ba4',
      '\u95ed\u5408\u7b7e\u8ba4',
      '\u9a8c\u6536\u6761\u4ef6\u6838\u67e5',
      '\u95ee\u9898\u6e05\u5355\u6838\u67e5',
    ])
  ) return 'inspection_test'
  if (hasPhysicalTestOperation || hasPhysicalWorkWithQualityRetest(text)) return 'physical_work'
  if ((hasStrongDocument || hasDocumentRecord) && !hasPhysicalProgress) return 'document_record'
  if ((hasStrongManagement || hasManagement) && !hasPhysicalProgress) return 'management_action'
  if (hasStrongTechnicalPreparation) return 'technical_preparation'
  if (hasStrongMonitoring && !includesAny(semanticText, ['\u6d4b\u6e29\u7ba1\u5b89\u88c5']) && !isStructuralSettlementJointText(semanticText)) return 'monitoring_wait'
  if (hasStrongInspection && !hasPhysicalProgress) return 'inspection_test'
  if (hasInspection && isInstallAcceptanceCheckText(semanticText)) return 'inspection_test'
  if (hasMonitoringWait && !hasPhysicalProgress && !isStructuralSettlementJointText(semanticText)) return 'monitoring_wait'
  if (hasInspection && !hasPhysicalProgress) return 'inspection_test'
  if (hasTechnicalPreparation && !hasPhysicalProgress) return 'technical_preparation'
  if (hasPhysicalWork) return 'physical_work'

  if (planItemKind === 'milestone' || planItemKind === 'linked_projection' || relationRole === 'handover') return 'handover_milestone'
  if (planItemKind === 'document_task' || relationRole === 'evidence') return 'document_record'
  if (planItemKind === 'commercial_task' || planItemKind === 'management_task' || planItemKind === 'safety_control') return 'management_action'
  if (planItemKind === 'inspection_task' || relationRole === 'inspection') return 'inspection_test'

  if (durationMode === 'record_only') return 'document_record'
  if (durationMode === 'handover_marker') return 'handover_milestone'
  if (durationMode === 'external_wait') return 'monitoring_wait'
  if (durationMode === 'quality_gate') return 'inspection_test'
  if (durationMode === 'embedded_check') return 'technical_preparation'

  return 'physical_work'
}
