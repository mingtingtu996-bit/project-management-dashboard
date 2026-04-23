async function listProjects() {
  try {
    const response = await fetch('http://localhost:3001/api/projects');
    
    if (!response.ok) {
      console.log(`❌ HTTP ${response.status}: ${response.statusText}`);
      return;
    }
    
    const data = await response.json();
    console.log('📊 API 返回的数据:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.log(`❌ 错误:`, error.message);
  }
}

listProjects();
