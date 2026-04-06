import 'dotenv/config';
import { recordProjectHealthSnapshots } from './src/services/projectHealthService.js';

async function run() {
  console.log('🚀 开始补录当月健康度快照...');
  const result = await recordProjectHealthSnapshots();
  console.log(`✅ 健康度快照记录完成：成功 ${result.recorded} 个，失败 ${result.failed} 个，周期 ${result.period}`);

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('❌ 健康度快照补录失败:', error instanceof Error ? error.message : error);
  process.exit(1);
});
