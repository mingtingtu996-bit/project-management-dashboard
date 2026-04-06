/**
 * 验收时间轴页面 - V4.4 力导向网络图版
 * 
 * 核心特性：
 * 1. 力导向网络图可视化
 * 2. 节点可拖拽编辑位置
 * 3. 自定义验收类型
 * 4. 依赖关系连线（带箭头）
 * 5. 双击创建依赖关系
 * 
 * 设计参考：验收时间轴_力导向网络图_V4.4.html
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  BarChart3,
  CheckCircle2, 
  Circle, 
  Loader2, 
  XCircle, 
  AlertCircle,
  Plus,
  Settings,
  Link2,
  Calendar,
  Users,
  FileText,
  MoreHorizontal,
  LayoutGrid,
  List,
  Network,
  Save,
  Trash2,
  Edit3,
  Palette,
  ClipboardCheck,
  Flame,
  MapPin as Map,
  Shield,
  ArrowUpDown,
  CloudLightning,
  FileCheck
} from 'lucide-react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { 
  AcceptancePlan, 
  AcceptanceStatus, 
  AcceptanceType,
  AcceptanceNode,
  AcceptanceLink,
  DEFAULT_ACCEPTANCE_TYPES,
  ACCEPTANCE_STATUS_NAMES,
  ACCEPTANCE_STATUS_CONFIG,
  getAcceptanceTypeColor,
  getAcceptanceTypeName,
  summarizeAcceptancePlans
} from '@/types/acceptance';
import { groupAcceptanceByPhase } from '@/types/acceptance';
import { acceptanceApi } from '@/services/acceptanceApi';
import { useToast } from '@/hooks/use-toast';
import { ForceDirectedGraph } from '@/components/ForceDirectedGraph';
import { useStore } from '@/hooks/useStore';
import { Breadcrumb } from '@/components/Breadcrumb';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';

// 图标映射
const IconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  AlertCircle,
  ClipboardCheck,
  Users,
  Flame,
  Map,
  Shield,
  ArrowUpDown,
  CloudLightning,
  FileCheck,
  Network
};

// 获取图标组件
function getIcon(iconName: string) {
  return IconMap[iconName] || Circle;
}

export default function AcceptanceTimeline() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { currentProject } = useStore();
  
  // 状态
  const [plans, setPlans] = useState<AcceptancePlan[]>([]);
  const [customTypes, setCustomTypes] = useState<AcceptanceType[]>([]);
  const [nodes, setNodes] = useState<AcceptanceNode[]>([]);
  const [links, setLinks] = useState<AcceptanceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>(() => {
    try { return (sessionStorage.getItem(`acceptanceView:${id}`) as 'graph' | 'list') || 'graph' } catch { return 'graph' }
  });
  const [selectedNode, setSelectedNode] = useState<AcceptanceNode | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [typeManagerOpen, setTypeManagerOpen] = useState(false);
  const [editType, setEditType] = useState<AcceptanceType | null>(null);
  const [addPlanOpen, setAddPlanOpen] = useState(false);

  // 加载数据
  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [plansData, typesData] = await Promise.all([
        acceptanceApi.getPlans(id),
        acceptanceApi.getCustomTypes(id)
      ]);
      setPlans(plansData);
      setCustomTypes(typesData);
      
      // 转换验收计划为节点
      const acceptanceNodes: AcceptanceNode[] = plansData.map((plan, index) => ({
        id: plan.id,
        acceptance_plan_id: plan.id,
        name: plan.name,
        description: plan.description,
        status: plan.status,
        planned_date: plan.planned_date,
        actual_date: plan.actual_date,
        typeId: plan.type_id,
        sort_order: index,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
        x: plan.position?.x || 400 + (index % 3) * 200,
        y: plan.position?.y || 200 + Math.floor(index / 3) * 150
      }));
      setNodes(acceptanceNodes);
      
      // 转换依赖关系
      const acceptanceLinks: AcceptanceLink[] = [];
      plansData.forEach(plan => {
        plan.depends_on.forEach(depId => {
          acceptanceLinks.push({
            id: `${depId}-${plan.id}`,
            source: depId,
            target: plan.id,
            type: 'strong'
          });
        });
      });
      setLinks(acceptanceLinks);
    } catch (error) {
      toast({
        title: '加载失败',
        description: '无法加载验收计划数据',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // 计算统计数据
const stats = useMemo(() => summarizeAcceptancePlans(plans), [plans]);
  const phaseGroups = useMemo(() => groupAcceptanceByPhase(plans), [plans]);

  // 所有验收类型
  const allTypes = useMemo(() => [
    ...DEFAULT_ACCEPTANCE_TYPES,
    ...customTypes
  ], [customTypes]);

  // 处理节点更新
  const handleNodeUpdate = useCallback(async (nodeId: string, updates: Partial<AcceptanceNode>) => {
    setNodes(prev => prev.map(n => 
      n.id === nodeId ? { ...n, ...updates } : n
    ));
    
    // 保存位置到后端
    if (updates.x !== undefined || updates.y !== undefined) {
      try {
        await acceptanceApi.updatePosition(nodeId, { 
          x: updates.x, 
          y: updates.y 
        });
      } catch (error) {
        console.error('保存位置失败:', error);
      }
    }
  }, []);

  // 处理节点选择
  const handleNodeSelect = useCallback((node: AcceptanceNode | null) => {
    setSelectedNode(node);
    if (node) {
      setDetailOpen(true);
    }
  }, []);

  // 处理创建依赖关系
  const handleLinkCreate = useCallback(async (sourceId: string, targetId: string) => {
    try {
      await acceptanceApi.addDependency(targetId, sourceId);
      setLinks(prev => [...prev, {
        id: `${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        type: 'strong'
      }]);
      toast({ title: '依赖关系已创建' });
    } catch (error) {
      toast({ title: '创建失败', variant: 'destructive' });
    }
  }, []);

  // 处理删除依赖关系
  const handleLinkDelete = useCallback(async (linkId: string) => {
    try {
      const link = links.find(l => l.id === linkId);
      if (link) {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
        const targetId = typeof link.target === 'string' ? link.target : link.target.id;
        await acceptanceApi.removeDependency(targetId, sourceId);
        setLinks(prev => prev.filter(l => l.id !== linkId));
        toast({ title: '依赖关系已删除' });
      }
    } catch (error) {
      toast({ title: '删除失败', variant: 'destructive' });
    }
  }, [links]);

  // 处理状态更新
  const handleStatusChange = async (planId: string, newStatus: AcceptanceStatus) => {
    try {
      await acceptanceApi.updateStatus(planId, newStatus);
      setNodes(prev => prev.map(n => 
        n.id === planId ? { ...n, status: newStatus } : n
      ));
      setPlans(prev => prev.map(p => 
        p.id === planId ? { ...p, status: newStatus } : p
      ));
      toast({ title: '状态已更新' });
    } catch (error) {
      toast({ title: '更新失败', variant: 'destructive' });
    }
  };

  // 添加自定义类型
  const handleAddType = async (type: Partial<AcceptanceType>) => {
    try {
      const newType = await acceptanceApi.createCustomType(type, id!);
      setCustomTypes(prev => [...prev, newType]);
      toast({ title: '类型已创建' });
    } catch (error) {
      toast({ title: '创建失败', variant: 'destructive' });
    }
  };

  // 删除自定义类型
  const handleDeleteType = async (typeId: string) => {
    try {
      await acceptanceApi.deleteCustomType(typeId);
      setCustomTypes(prev => prev.filter(t => t.id !== typeId));
      toast({ title: '类型已删除' });
    } catch (error) {
      toast({ title: '删除失败', variant: 'destructive' });
    }
  };

  // 添加验收计划处理
  const handleAddPlan = async (planData: Partial<AcceptancePlan>) => {
    if (!id) return;
    try {
      const newPlan = await acceptanceApi.createPlan({ ...planData, project_id: id });
      setPlans(prev => [...prev, newPlan]);
      const newNode: AcceptanceNode = {
        id: newPlan.id,
        acceptance_plan_id: newPlan.id,
        name: newPlan.name,
        description: newPlan.description,
        status: newPlan.status,
        planned_date: newPlan.planned_date,
        actual_date: newPlan.actual_date,
        typeId: newPlan.type_id,
        sort_order: plans.length,
        created_at: newPlan.created_at,
        updated_at: newPlan.updated_at,
        x: 400 + (plans.length % 3) * 200,
        y: 200 + Math.floor(plans.length / 3) * 150
      };
      setNodes(prev => [...prev, newNode]);
      setAddPlanOpen(false);
      toast({ title: '验收计划已创建' });
    } catch (error) {
      toast({ title: '创建失败', description: String(error), variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 page-enter">
      {/* 面包屑导航（N07/N08） */}
      {currentProject && (
        <Breadcrumb items={[
          { label: '公司驾驶舱', href: '/company' },
          { label: currentProject.name, href: `/projects/${id}` },
          { label: '证照管理', href: `/projects/${id}/pre-milestones` },
          { label: '验收时间轴' },
        ]} />
      )}
      {/* 页面头部 */}
      <PageHeader
        eyebrow="证照管理"
        title="验收时间轴"
        subtitle={`证照管理父模块下的验收节点与时间线 · 共 ${stats.total} 项验收 · 完成率 ${stats.completionRate}%`}
      >
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => id && navigate(`/projects/${id}/reports?view=acceptance`)}
            className="gap-2"
          >
            <BarChart3 className="w-4 h-4" />
            验收进度分析
          </Button>
          {/* 视图切换 */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => { setViewMode('graph'); try { sessionStorage.setItem(`acceptanceView:${id}`, 'graph') } catch {} }}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm transition-all flex items-center gap-1.5",
                viewMode === 'graph' 
                  ? 'bg-white shadow-sm text-gray-900' 
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <Network className="w-4 h-4" />
              网络图
            </button>
            <button
              onClick={() => { setViewMode('list'); try { sessionStorage.setItem(`acceptanceView:${id}`, 'list') } catch {} }}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm transition-all flex items-center gap-1.5",
                viewMode === 'list' 
                  ? 'bg-white shadow-sm text-gray-900' 
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <List className="w-4 h-4" />
              列表
            </button>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTypeManagerOpen(true)}
            className="gap-2"
          >
            <Palette className="w-4 h-4" />
            类型管理
          </Button>
          
          <Button className="gap-2" onClick={() => setAddPlanOpen(true)}>
            <Plus className="w-4 h-4" />
            添加验收
          </Button>
        </div>
      </PageHeader>

      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard label="验收总数" value={stats.total} color="gray" />
        <StatCard label="已通过" value={stats.passed} color="green" />
        <StatCard label="验收中" value={stats.inProgress} color="blue" />
        <StatCard label="未通过 / 需补充" value={stats.failed} color="amber" />
        <StatCard label="完成率" value={`${stats.completionRate}%`} color="emerald" />
      </div>

      {phaseGroups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {phaseGroups.map(phase => (
            <Badge
              key={phase.id}
              variant="outline"
              className="rounded-full px-3 py-1 bg-white/80"
            >
              {phase.name} · {phase.plans.length}
            </Badge>
          ))}
        </div>
      )}

      {/* 主内容区 */}
      {plans.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="暂无验收记录"
          description="该项目还没有创建任何验收计划，点击下方按钮开始"
          action={
            <Button className="gap-2" onClick={() => setAddPlanOpen(true)}>
              <Plus className="w-4 h-4" />
              添加验收
            </Button>
          }
        />
      ) : viewMode === 'graph' ? (
        <Card className="h-[600px]">
          <CardContent className="p-0 h-full">
            <ForceDirectedGraph
              nodes={nodes}
              links={links}
              acceptanceTypes={allTypes}
              onNodeUpdate={handleNodeUpdate}
              onNodeSelect={handleNodeSelect}
              onLinkCreate={handleLinkCreate}
              onLinkDelete={handleLinkDelete}
              selectedNodeId={selectedNode?.id}
              width={1200}
              height={600}
            />
          </CardContent>
        </Card>
      ) : (
        <AcceptanceListView 
          nodes={nodes}
          onNodeClick={handleNodeSelect}
          customTypes={allTypes}
        />
      )}

      {/* 节点详情弹窗 */}
      <NodeDetailDialog
        node={selectedNode}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelectedNode(null);
        }}
        onStatusChange={handleStatusChange}
        customTypes={allTypes}
      />

      {/* 类型管理弹窗 */}
      <TypeManagerDialog
        open={typeManagerOpen}
        onClose={() => {
          setTypeManagerOpen(false);
          setEditType(null);
        }}
        customTypes={customTypes}
        onAddType={handleAddType}
        onDeleteType={handleDeleteType}
        editType={editType}
        setEditType={setEditType}
      />

      {/* 添加验收弹窗 */}
      <AddPlanDialog
        open={addPlanOpen}
        onClose={() => setAddPlanOpen(false)}
        onSubmit={handleAddPlan}
        acceptanceTypes={allTypes}
      />
    </div>
  );
}

// 统计卡片组件
function StatCard({ 
  label, 
  value, 
  color 
}: { 
  label: string; 
  value: string | number; 
  color: 'gray' | 'green' | 'blue' | 'amber' | 'emerald';
}) {
  const colorClasses = {
    gray: 'bg-gray-50 text-gray-700',
    green: 'bg-green-50 text-green-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700'
  };

  return (
    <div className={cn("rounded-xl p-5 border-0", colorClasses[color])}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

// 列表视图
interface AcceptanceListViewProps {
  nodes: AcceptanceNode[];
  onNodeClick: (node: AcceptanceNode) => void;
  customTypes: AcceptanceType[];
}

function AcceptanceListView({ nodes, onNodeClick, customTypes }: AcceptanceListViewProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {nodes.map((node) => {
            const statusConfig = ACCEPTANCE_STATUS_CONFIG[node.status];
            const StatusIcon = getIcon(statusConfig.icon);
            const type = customTypes.find(t => t.id === node.typeId) || 
                        DEFAULT_ACCEPTANCE_TYPES.find(t => t.id === node.typeId);
            
            return (
              <div
                key={node.id}
                onClick={() => onNodeClick(node)}
                className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                    style={{ backgroundColor: type?.color || '#94a3b8' }}
                  >
                    <span className="text-lg">{type?.icon || '📋'}</span>
                  </div>
                  <div>
                    <h3 className="font-medium">{node.name}</h3>
                    <p className="text-sm text-gray-500">
                      {type?.name || node.typeId} · 计划: {node.planned_date}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge 
                    variant="outline"
                    className={cn(
                      statusConfig.bg,
                      statusConfig.textColor,
                      statusConfig.borderColor
                    )}
                  >
                    {ACCEPTANCE_STATUS_NAMES[node.status]}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// 节点详情弹窗
interface NodeDetailDialogProps {
  node: AcceptanceNode | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (nodeId: string, status: AcceptanceStatus) => void;
  customTypes: AcceptanceType[];
}

function NodeDetailDialog({
  node,
  open,
  onClose,
  onStatusChange,
  customTypes
}: NodeDetailDialogProps) {
  if (!node) return null;

  const statusConfig = ACCEPTANCE_STATUS_CONFIG[node.status];
  const type = customTypes.find(t => t.id === node.typeId) || 
              DEFAULT_ACCEPTANCE_TYPES.find(t => t.id === node.typeId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">{node.name}</DialogTitle>
            <Badge 
              variant="outline"
              className={cn(
                statusConfig.bg,
                statusConfig.textColor,
                statusConfig.borderColor
              )}
            >
              {ACCEPTANCE_STATUS_NAMES[node.status]}
            </Badge>
          </div>
          <p className="text-sm text-gray-500">
            {type?.name || node.typeId}
          </p>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* 时间信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">计划日期</p>
              <p className="font-medium">{node.planned_date || '未设置'}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">实际日期</p>
              <p className={cn(
                "font-medium",
                node.actual_date ? "text-green-600" : "text-gray-400"
              )}>
                {node.actual_date || '未完成'}
              </p>
            </div>
          </div>

          {/* 位置信息 */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500 mb-1">网络图位置</p>
            <p className="font-medium text-gray-700">
              X: {Math.round(node.x || 0)}, Y: {Math.round(node.y || 0)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              在力导向图中拖拽节点可调整位置
            </p>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 pt-4 border-t">
            {node.status !== 'passed' && (
              <Button 
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={() => onStatusChange(node.id, 'passed')}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                标记通过
              </Button>
            )}
            {node.status === 'pending' && (
              <Button 
                variant="outline"
                className="flex-1"
                onClick={() => onStatusChange(node.id, 'in_progress')}
              >
                <Loader2 className="w-4 h-4 mr-2" />
                开始验收
              </Button>
            )}
            <Button variant="outline">
              <Edit3 className="w-4 h-4 mr-2" />
              编辑
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 类型管理弹窗
interface TypeManagerDialogProps {
  open: boolean;
  onClose: () => void;
  customTypes: AcceptanceType[];
  onAddType: (type: Partial<AcceptanceType>) => void;
  onDeleteType: (typeId: string) => void;
  editType: AcceptanceType | null;
  setEditType: (type: AcceptanceType | null) => void;
}

function TypeManagerDialog({
  open,
  onClose,
  customTypes,
  onAddType,
  onDeleteType,
  editType,
  setEditType
}: TypeManagerDialogProps) {
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeColor, setNewTypeColor] = useState('#3b82f6');
  const [newTypeIcon, setNewTypeIcon] = useState('📋');

  const handleSubmit = () => {
    if (!newTypeName.trim()) return;
    onAddType({
      name: newTypeName,
      shortName: newTypeName.slice(0, 4),
      color: newTypeColor,
      icon: newTypeIcon,
      isSystem: false,
      sortOrder: customTypes.length
    });
    setNewTypeName('');
    setNewTypeColor('#3b82f6');
    setNewTypeIcon('📋');
  };

  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            验收类型管理
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* 现有类型列表 */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">系统默认类型</h4>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_ACCEPTANCE_TYPES.map(type => (
                <div
                  key={type.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm"
                  style={{ 
                    backgroundColor: `${type.color}20`,
                    color: type.color 
                  }}
                >
                  <span>{type.icon}</span>
                  <span>{type.name}</span>
                </div>
              ))}
            </div>
          </div>

          {customTypes.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">自定义类型</h4>
              <div className="flex flex-wrap gap-2">
                {customTypes.map(type => (
                  <div
                    key={type.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm group"
                    style={{ 
                      backgroundColor: `${type.color}20`,
                      color: type.color 
                    }}
                  >
                    <span>{type.icon}</span>
                    <span>{type.name}</span>
                    <button
                      onClick={() => onDeleteType(type.id)}
                      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 添加新类型 */}
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium text-gray-700 mb-3">添加新类型</h4>
            <div className="space-y-3">
              <div>
                <Label>类型名称</Label>
                <Input
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="例如：节能验收"
                />
              </div>
              <div>
                <Label>图标</Label>
                <Input
                  value={newTypeIcon}
                  onChange={(e) => setNewTypeIcon(e.target.value)}
                  placeholder="例如：🌿"
                  maxLength={2}
                />
              </div>
              <div>
                <Label>颜色</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {colors.map(color => (
                    <button
                      key={color}
                      onClick={() => setNewTypeColor(color)}
                      className={cn(
                        "w-8 h-8 rounded-full transition-all",
                        newTypeColor === color && "ring-2 ring-offset-2 ring-gray-400"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <Button 
                onClick={handleSubmit}
                disabled={!newTypeName.trim()}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                添加类型
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 添加验收弹窗 ──────────────────────────────────────────────────────────────

interface AddPlanDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (plan: Partial<AcceptancePlan>) => Promise<void>;
  acceptanceTypes: AcceptanceType[];
}

function AddPlanDialog({ open, onClose, onSubmit, acceptanceTypes }: AddPlanDialogProps) {
  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 重置表单
  const reset = () => {
    setName('');
    setTypeId('');
    setPlannedDate('');
    setDescription('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      // 未选类型时使用第一个可用类型作为默认值
      const fallbackType = acceptanceTypes[0];
      const resolvedTypeId = typeId || fallbackType?.id || 'pre_acceptance';
      const selectedType = acceptanceTypes.find(t => t.id === resolvedTypeId) || fallbackType;
      await onSubmit({
        name: name.trim(),
        type_id: resolvedTypeId,
        type_name: selectedType?.name || resolvedTypeId,
        type_color: selectedType?.color || 'bg-gray-500',
        planned_date: plannedDate || new Date().toISOString().split('T')[0],
        description: description.trim() || undefined,
        status: 'pending' as AcceptanceStatus,
        depends_on: [],
        depended_by: [],
        phase_order: 0,
        is_system: false
      });
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            添加验收计划
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* 验收名称：合并类型和名称，支持选择或自定义输入 */}
          <div>
            <Label>验收名称 *</Label>
            <div className="relative">
              <Input
                list="acceptance-name-options"
                value={name}
                onChange={e => {
                  const value = e.target.value
                  setName(value)
                  // 自动从名称推断类型
                  const typeMap: Record<string, string> = {
                    '地基与基础验收': '地基与基础',
                    '主体结构验收': '主体结构',
                    '节能验收': '节能验收',
                    '竣工验收': '竣工验收',
                    '消防验收': '竣工验收',
                    '环保验收': '竣工验收',
                    '规划验收': '竣工验收',
                    '人防验收': '竣工验收',
                  }
                  const inferredType = typeMap[value]
                  if (inferredType && acceptanceTypes.length > 0) {
                    const matchedType = acceptanceTypes.find(t => t.name === inferredType)
                    if (matchedType) setTypeId(matchedType.id)
                  }
                }}
                placeholder="选择或输入验收名称"
                className="mt-1"
              />
              <datalist id="acceptance-name-options">
                {acceptanceTypes.map(t => (
                  <option key={t.id} value={t.name} />
                ))}
                <option value="地基与基础验收" />
                <option value="主体结构验收" />
                <option value="节能验收" />
                <option value="竣工验收" />
                <option value="消防验收" />
                <option value="环保验收" />
                <option value="规划验收" />
                <option value="人防验收" />
              </datalist>
            </div>
            {/* 快速选择按钮 */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {acceptanceTypes.slice(0, 8).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setName(t.name)
                    setTypeId(t.id)
                  }}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    name === t.name 
                      ? 'bg-blue-500 text-white border-blue-500' 
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>计划日期</Label>
            <Input
              type="date"
              value={plannedDate}
              onChange={e => setPlannedDate(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label>备注说明</Label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="可选备注"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>取消</Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            确认创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
