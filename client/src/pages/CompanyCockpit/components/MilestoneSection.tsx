/**
 * MilestoneSection 组件
 * 
 * 里程碑区域组件，支持图表视图和列表视图切换
 * 
 * @module
 */

import { useState, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MilestoneAchievementChart } from './MilestoneAchievementChart';
import { MilestonesSummaryTable } from './MilestonesSummaryTable';
import type { ProjectSummary } from '@/services/dashboardApi';
import type { ProjectStats } from '../types';
import { useTabPersist } from '@/hooks/useTabPersist';

/** 里程碑区域属性 */
interface MilestoneSectionProps {
  loading: boolean;
  apiProjects: ProjectSummary[];
  allStats: ProjectStats[];
}

/**
 * 里程碑区域组件
 */
export const MilestoneSection = memo(function MilestoneSection({ 
  loading, 
  apiProjects,
  allStats
}: MilestoneSectionProps) {
  const [activeTab, setActiveTab] = useTabPersist('cockpit-milestones', 'chart');
  const navigate = useNavigate();

  // 获取本月里程碑
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  // 从allStats中提取本月到期的里程碑
  const thisMonthMilestones = useMemo(() => {
    const milestones: Array<{
      projectName: string;
      milestoneName: string;
      date: Date;
      daysLeft: number;
    }> = [];
    
    allStats.forEach(stat => {
      stat.milestones.forEach(m => {
        if (m.planned_end_date) {
          const endDate = new Date(m.planned_end_date);
          if (endDate.getMonth() === currentMonth && endDate.getFullYear() === currentYear) {
            const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            milestones.push({
              projectName: stat.project.name,
              milestoneName: m.title || (m as any).name || '未命名里程碑',
              date: endDate,
              daysLeft
            });
          }
        }
      });
    });
    
    return milestones.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [allStats, currentMonth, currentYear]);

  return (
    <Card className="rounded-xl border border-gray-200 shadow-sm bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-gray-800">里程碑管理</CardTitle>
          {/* Tab切换 */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('chart')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'chart' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              图表视图
            </button>
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'list' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              列表视图
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            {/* 图表视图 */}
            {activeTab === 'chart' && (
              <div className="space-y-6">
                {/* 里程碑达成率图表 */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">里程碑达成率</h4>
                  <MilestoneAchievementChart />
                </div>
                
                {/* 本月里程碑 */}
                {thisMonthMilestones.length > 0 && (
                  <div className="border-t border-gray-100 pt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">
                      本月里程碑（{currentMonth + 1}月）
                    </h4>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {thisMonthMilestones.map((m, idx) => (
                        <div 
                          key={idx}
                          className={`flex-shrink-0 w-40 p-3 rounded-lg border ${
                            m.daysLeft < 0 
                              ? 'border-red-200 bg-red-50' 
                              : m.daysLeft <= 7 
                                ? 'border-amber-200 bg-amber-50' 
                                : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <p className="text-xs font-medium text-gray-900 truncate">{m.projectName}</p>
                          <p className="text-xs text-gray-600 mt-1">{m.milestoneName}</p>
                          <p className={`text-xs mt-2 ${
                            m.daysLeft < 0 
                              ? 'text-red-600' 
                              : m.daysLeft <= 7 
                                ? 'text-amber-600' 
                                : 'text-gray-500'
                          }`}>
                            {m.daysLeft < 0 
                              ? `⚠️ 延期${Math.abs(m.daysLeft)}天` 
                              : `剩余${m.daysLeft}天`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* 列表视图 */}
            {activeTab === 'list' && (
              <MilestonesSummaryTable />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
});

export default MilestoneSection;
