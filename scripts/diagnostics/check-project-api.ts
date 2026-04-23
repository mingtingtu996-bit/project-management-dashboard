async function checkProject() {
  const pid = 'ae3d7eee-a42e-4174-a853-b5ec2ec6d209';
  
  try {
    const response = await fetch(`http://localhost:3001/api/projects/${pid}`);
    
    if (!response.ok) {
      console.log(`❌ HTTP ${response.status}: ${response.statusText}`);
      const text = await response.text();
      console.log(text);
      return;
    }
    
    const project = await response.json();
    console.log(`✅ 项目存在:`);
    console.log(`   ID: ${project.id}`);
    console.log(`   名称: ${project.name}`);
    console.log(`   状态: ${project.status}`);
  } catch (error) {
    console.log(`❌ 错误:`, error.message);
  }
}

checkProject();
