/**
 * MemberManageDialog - 项目成员管理弹窗
 * 包含成员列表、添加成员、移除成员、转让负责人功能
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { X, UserPlus, UserMinus, Crown, Shield, Eye, Search } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Member {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  email?: string;
  role?: string;
  permissionLevel: string;
  joinedAt: string;
}

interface MemberManageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

const permissionLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  owner: { label: '所有者', color: 'bg-purple-100 text-purple-800', icon: <Crown className="h-3 w-3" /> },
  editor: { label: '编辑者', color: 'bg-blue-100 text-blue-800', icon: <Shield className="h-3 w-3" /> },
  viewer: { label: '查看者', color: 'bg-gray-100 text-gray-800', icon: <Eye className="h-3 w-3" /> },
};

export const MemberManageDialog: React.FC<MemberManageDialogProps> = ({ isOpen, onClose, projectId }) => {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [addPermission, setAddPermission] = useState('editor');
  const [addLoading, setAddLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const isOwner = members.some(m => m.userId === user?.id && m.permissionLevel === 'owner');

  const fetchMembers = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/members/${projectId}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMembers(data.members || []);
      }
    } catch {
      toast({ title: '获取成员列表失败', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen && projectId) fetchMembers();
  }, [isOpen, projectId, fetchMembers]);

  if (!isOpen) return null;

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUsername.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch(`/api/members/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: addUsername.trim(), permission_level: addPermission }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: data.message, variant: 'default' });
        setAddUsername('');
        setShowAddForm(false);
        fetchMembers();
      } else {
        toast({ title: data.message || '添加失败', variant: 'destructive' });
      }
    } catch {
      toast({ title: '添加失败', variant: 'destructive' });
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveMember = async (member: Member) => {
    if (!confirm(`确定移除成员「${member.displayName || member.username}」吗？`)) return;
    try {
      const res = await fetch(`/api/members/${projectId}/${member.userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: '已移除', variant: 'default' });
        fetchMembers();
      } else {
        toast({ title: data.message || '移除失败', variant: 'destructive' });
      }
    } catch {
      toast({ title: '移除失败', variant: 'destructive' });
    }
  };

  const handleTransferOwner = async (member: Member) => {
    if (!confirm(`确定将项目负责人转让给「${member.displayName || member.username}」吗？转让后你将变为编辑者。`)) return;
    try {
      const res = await fetch(`/api/members/${projectId}/transfer-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetUserId: member.userId }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: '转让成功', variant: 'default' });
        fetchMembers();
      } else {
        toast({ title: data.message || '转让失败', variant: 'destructive' });
      }
    } catch {
      toast({ title: '转让失败', variant: 'destructive' });
    }
  };

  const filteredMembers = members.filter(m =>
    (m.displayName || '').toLowerCase().includes(searchText.toLowerCase()) ||
    m.username.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            项目成员
            <span className="text-sm font-normal text-gray-400 ml-2">({members.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            {isOwner && (
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5" />
                添加
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 添加成员表单 */}
        {showAddForm && isOwner && (
          <form onSubmit={handleAddMember} className="px-5 py-3 bg-gray-50 border-b flex-shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={addUsername}
                onChange={e => setAddUsername(e.target.value)}
                placeholder="输入用户名"
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                disabled={addLoading}
              />
              <select
                value={addPermission}
                onChange={e => setAddPermission(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                disabled={addLoading}
              >
                <option value="editor">编辑者</option>
                <option value="viewer">查看者</option>
              </select>
              <button type="submit" disabled={addLoading || !addUsername.trim()} className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                {addLoading ? '...' : '确定'}
              </button>
              <button type="button" onClick={() => setShowAddForm(false)} className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-100">
                取消
              </button>
            </div>
          </form>
        )}

        {/* 搜索 */}
        <div className="px-5 py-2 border-b flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 text-gray-400 -translate-y-1/2" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="搜索成员..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* 成员列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-gray-400 text-sm">加载中...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">暂无成员</div>
          ) : (
            <div className="divide-y">
              {filteredMembers.map(member => {
                const perm = permissionLabels[member.permissionLevel] || permissionLabels.viewer;
                const isSelf = member.userId === user?.id;
                const canManage = isOwner && !isSelf;

                return (
                  <div key={member.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                        {(member.displayName || member.username).slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">
                          {member.displayName || member.username}
                          {isSelf && <span className="text-xs text-gray-400 ml-1">(我)</span>}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{member.username}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${perm.color}`}>
                        {perm.icon}
                        {perm.label}
                      </span>
                      {canManage && member.permissionLevel !== 'owner' && (
                        <>
                          {isOwner && (
                            <button
                              onClick={() => handleTransferOwner(member)}
                              className="p-1 text-amber-600 hover:bg-amber-50 rounded"
                              title="转让负责人"
                            >
                              <Crown className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveMember(member)}
                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                            title="移除成员"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
