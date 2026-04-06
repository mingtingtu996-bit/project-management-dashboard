import { useEffect, useState } from 'react';
import { DashboardApiService, ProjectSummary } from '@/services/dashboardApi';
import { TrendingUp, TrendingDown, Award, AlertTriangle } from 'lucide-react';

export function ProjectRanking() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    DashboardApiService.getProjectRanking().then(data => {
      setProjects(data);
      setLoading(false);
    }).catch(error => {
      console.error('加载项目排名失败:', error);
      setLoading(false);
    });
  }, []);

  const topProjects = projects.slice(0, 5); // 红榜(前5)
  const bottomProjects = [...projects].reverse().slice(0, 5); // 黑榜(后5)

  const getHealthStatus = (score: number) => {
    if (score >= 90) return { text: '优秀', color: 'text-green-600' };
    if (score >= 75) return { text: '良好', color: 'text-blue-600' };
    if (score >= 60) return { text: '及格', color: 'text-yellow-600' };
    return { text: '不及格', color: 'text-red-600' };
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl p-4 border">
            <div className="h-6 w-32 bg-gray-200 rounded animate-pulse mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((j) => (
                <div key={j} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />
                    <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                  </div>
                  <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">项目排名</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 红榜 */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
          <div className="flex items-center gap-2 mb-4">
            <Award className="h-5 w-5 text-green-600" />
            <h3 className="text-lg font-semibold text-green-900">进度红榜</h3>
            <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
              TOP 5
            </span>
          </div>
          <div className="space-y-3">
            {topProjects.length === 0 ? (
              <div className="text-center py-4 text-sm text-green-700">
                暂无项目数据
              </div>
            ) : (
              topProjects.map((project, idx) => {
                const status = getHealthStatus(project.healthScore);
                return (
                  <div
                    key={project.id}
                    className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          idx === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-white shadow-lg' :
                          idx === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-white' :
                          idx === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white' :
                          'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-medium text-sm text-gray-900">{project.name}</div>
                        <div className="text-xs text-gray-500">
                          里程碑: {project.milestoneProgress}%
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-emerald-600">
                        {project.healthScore}
                      </div>
                      <div className={`text-xs ${status.color}`}>{status.text}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 黑榜 */}
        <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-4 border border-red-200">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="text-lg font-semibold text-red-900">进度黑榜</h3>
            <span className="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
              BOTTOM 5
            </span>
          </div>
          <div className="space-y-3">
            {bottomProjects.length === 0 ? (
              <div className="text-center py-4 text-sm text-red-700">
                暂无项目数据
              </div>
            ) : (
              bottomProjects.map((project, idx) => {
                const status = getHealthStatus(project.healthScore);
                return (
                  <div
                    key={project.id}
                    className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          idx === 0 ? 'bg-gradient-to-br from-red-400 to-red-600 text-white shadow-lg' :
                          idx === 1 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white' :
                          'bg-red-100 text-red-700'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-medium text-sm text-gray-900">{project.name}</div>
                        <div className="text-xs text-gray-500">
                          里程碑: {project.milestoneProgress}%
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-red-600">
                        {project.healthScore}
                      </div>
                      <div className={`text-xs ${status.color}`}>{status.text}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
