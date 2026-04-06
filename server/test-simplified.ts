// 简化测试文件
import { createClient } from '@supabase/supabase-js';

const test = `任务 "测试" 今天到期`;
console.log('Test:', test);

class TestService {
  async testMethod() {
    const task = {
      title: '测试任务'
    };
    const result = {
      description: `任务 "${task.title}" 今天到期，请及时完成`
    };
    console.log('Result:', result);
  }
}

const service = new TestService();
service.testMethod();
