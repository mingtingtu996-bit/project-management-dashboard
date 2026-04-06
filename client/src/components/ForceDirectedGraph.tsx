import React, { useEffect, useRef, useState, useCallback } from 'react';
// @ts-ignore — d3 类型声明待安装，skipLibCheck 模式下不影响构建
import * as d3 from 'd3';
import { AcceptanceNode, AcceptanceLink, AcceptanceType } from '../types/acceptance';

interface ForceDirectedGraphProps {
  nodes: AcceptanceNode[];
  links: AcceptanceLink[];
  acceptanceTypes: AcceptanceType[];
  onNodeUpdate: (nodeId: string, updates: Partial<AcceptanceNode>) => void;
  onNodeSelect: (node: AcceptanceNode | null) => void;
  onLinkCreate: (sourceId: string, targetId: string) => void;
  onLinkDelete: (linkId: string) => void;
  selectedNodeId?: string | null;
  width?: number;
  height?: number;
}

export const ForceDirectedGraph: React.FC<ForceDirectedGraphProps> = ({
  nodes,
  links,
  acceptanceTypes,
  onNodeUpdate,
  onNodeSelect,
  onLinkCreate,
  onLinkDelete,
  selectedNodeId,
  width = 800,
  height = 600,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [transform, setTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);

  // 颜色映射
  const getNodeColor = (typeId: string) => {
    const type = acceptanceTypes.find(t => t.id === typeId);
    return type?.color || '#94a3b8';
  };

  // 状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'in_progress': return '#3b82f6';
      case 'blocked': return '#ef4444';
      default: return '#f59e0b';
    }
  };

  // 初始化 D3 力导向图
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // 创建缩放行为
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        setTransform(event.transform);
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoom as any);

    // 主容器
    const g = svg.append('g');

    // 箭头标记
    const defs = svg.append('defs');
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#64748b');

    // 力导向模拟
    const simulation = d3.forceSimulation<AcceptanceNode>(nodes)
      .force('link', d3.forceLink<AcceptanceNode, AcceptanceLink>(links)
        .id(d => d.id)
        .distance(150)
      )
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    // 绘制连线
    const linkGroup = g.append('g').attr('class', 'links');
    const link = linkGroup.selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', '#64748b')
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrowhead)')
      .attr('stroke-dasharray', d => d.type === 'weak' ? '5,5' : 'none')
      .on('click', (event, d) => {
        event.stopPropagation();
        if (window.confirm('删除此依赖关系？')) {
          onLinkDelete(d.id);
        }
      })
      .on('mouseover', function() {
        d3.select(this).attr('stroke-width', 3).attr('stroke', '#ef4444');
      })
      .on('mouseout', function() {
        d3.select(this).attr('stroke-width', 2).attr('stroke', '#64748b');
      });

    // 绘制节点组
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const node = nodeGroup.selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .call(d3.drag<SVGGElement, AcceptanceNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
          setIsDragging(true);
          setDragNodeId(d.id);
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
          setIsDragging(false);
          setDragNodeId(null);
          // 保存新位置
          onNodeUpdate(d.id, { x: d.x, y: d.y });
        })
      );

    // 节点外圈（状态指示）
    node.append('circle')
      .attr('r', 28)
      .attr('fill', 'none')
      .attr('stroke', d => getStatusColor(d.status))
      .attr('stroke-width', 3)
      .attr('opacity', 0.6);

    // 节点主体
    node.append('circle')
      .attr('r', 24)
      .attr('fill', d => getNodeColor(d.typeId))
      .attr('stroke', d => selectedNodeId === d.id ? '#3b82f6' : '#fff')
      .attr('stroke-width', d => selectedNodeId === d.id ? 4 : 2)
      .on('click', (event, d) => {
        event.stopPropagation();
        if (isLinking && linkSourceId) {
          if (linkSourceId !== d.id) {
            onLinkCreate(linkSourceId, d.id);
          }
          setIsLinking(false);
          setLinkSourceId(null);
        } else {
          onNodeSelect(d);
        }
      })
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        setIsLinking(true);
        setLinkSourceId(d.id);
      });

    // 节点图标
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '20px')
      .attr('pointer-events', 'none')
      .text(d => {
        const type = acceptanceTypes.find(t => t.id === d.typeId);
        return type?.icon || '📋';
      });

    // 节点标签
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 45)
      .attr('font-size', '12px')
      .attr('font-weight', '500')
      .attr('fill', '#334155')
      .attr('pointer-events', 'none')
      .text(d => d.name.length > 8 ? d.name.slice(0, 8) + '...' : d.name);

    // 状态标签
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 58)
      .attr('font-size', '10px')
      .attr('fill', '#64748b')
      .attr('pointer-events', 'none')
      .text(d => {
        const statusMap: Record<string, string> = {
          pending: '待验收',
          in_progress: '进行中',
          completed: '已完成',
          blocked: '受阻'
        };
        return statusMap[d.status] || d.status;
      });

    // 更新位置
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as AcceptanceNode).x || 0)
        .attr('y1', d => (d.source as AcceptanceNode).y || 0)
        .attr('x2', d => (d.target as AcceptanceNode).x || 0)
        .attr('y2', d => (d.target as AcceptanceNode).y || 0);

      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    // 点击空白处取消选择
    svg.on('click', () => {
      onNodeSelect(null);
      setIsLinking(false);
      setLinkSourceId(null);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, links, acceptanceTypes, selectedNodeId, width, height]);

  // 添加新节点
  const handleAddNode = useCallback((typeId: string) => {
    const ts = Date.now()
    // 用时间戳低位做确定性偏移，避免 Math.random() 导致不必要的重渲染
    const offsetX = ((ts % 100) - 50)
    const offsetY = ((ts % 97) - 48)
    const newNode: Partial<AcceptanceNode> = {
      id: `node_${ts}`,
      name: '新验收节点',
      typeId,
      status: 'pending',
      x: width / 2 + offsetX,
      y: height / 2 + offsetY,
    };
    onNodeUpdate(newNode.id!, newNode);
  }, [width, height, onNodeUpdate]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* 工具栏 */}
      <div className="absolute top-4 left-4 z-10 bg-white rounded-xl shadow-lg p-3 space-y-2">
        <div className="text-sm font-medium text-gray-700 mb-2">添加节点</div>
        <div className="flex flex-wrap gap-2">
          {acceptanceTypes.map(type => (
            <button
              key={type.id}
              onClick={() => handleAddNode(type.id)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
              style={{ backgroundColor: `${type.color}20`, color: type.color }}
            >
              <span>{type.icon}</span>
              <span>{type.name}</span>
            </button>
          ))}
        </div>
        {isLinking && (
          <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
            点击目标节点创建依赖关系
            <button
              onClick={() => { setIsLinking(false); setLinkSourceId(null); }}
              className="ml-2 text-blue-500 hover:text-blue-700"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* 缩放控制 */}
      <div className="absolute bottom-4 right-4 z-10 bg-white rounded-xl shadow-lg p-2 flex flex-col gap-2">
        <button
          onClick={() => {
            const svg = d3.select(svgRef.current);
            svg.transition().duration(300).call(
              (d3.zoom() as any).transform,
              transform.scale(1.2)
            );
          }}
          className="p-2 hover:bg-gray-100 rounded"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </button>
        <button
          onClick={() => {
            const svg = d3.select(svgRef.current);
            svg.transition().duration(300).call(
              (d3.zoom() as any).transform,
              transform.scale(0.8)
            );
          }}
          className="p-2 hover:bg-gray-100 rounded"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={() => {
            const svg = d3.select(svgRef.current);
            svg.transition().duration(300).call(
              (d3.zoom() as any).transform,
              d3.zoomIdentity
            );
          }}
          className="p-2 hover:bg-gray-100 rounded text-xs font-medium"
        >
          重置
        </button>
      </div>

      {/* 提示信息 */}
      <div className="absolute bottom-4 left-4 z-10 bg-white/90 rounded-xl shadow p-3 text-xs text-gray-600 space-y-1">
        <div>🖱️ 拖拽节点调整位置</div>
        <div>👆 单击选择节点</div>
        <div>👆👆 双击创建依赖</div>
        <div>🖱️ 点击连线删除</div>
      </div>

      {/* SVG 画布 */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="w-full h-full bg-gray-50 rounded-lg"
      />
    </div>
  );
};

export default ForceDirectedGraph;