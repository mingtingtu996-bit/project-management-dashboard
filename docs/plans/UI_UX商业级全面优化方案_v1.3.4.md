# UI/UX 商业级全面优化方案 v1.3.4

## 修订说明

本文件承接 `UI_UX商业级全面优化方案_v1.3.3.md`，用于处理 v1.3 页面布局合规审计中经当前代码核验后确认仍存在的问题。

本版不照单全收外部审计结论，而是按当前源码复核后形成执行清单。目标是把 v1.3 的页面布局规则继续收敛到可维护的组件与 token：统一页面外壳、统一 Dialog 尺寸、统一主从分栏、减少局部覆盖造成的视觉漂移，并补齐 reduced-motion 与底栏定位一致性。

## 核验口径

- 核验日期：2026-05-02
- 范围：`client/src`
- 文档位置：`docs/plans/UI_UX商业级全面优化方案_v1.3.4.md`
- 方法：`rg` 静态扫描 + 重点文件人工复核
- 不纳入项：已被源码证明不成立的结论，例如 `.page-content` 替代 `.page-shell`、`GanttView` 缺 Breadcrumb、`WBSTemplates` 缺 page-shell/document.title、`CompanyCockpit` 完全缺错误 UI。

## 总体裁决

| 编号 | 问题 | 结论 | 优先级 | 执行要求 |
|---|---|---|---|---|
| 1 | 页面外壳与三态路径不一致 | 部分属实 | P0 | Loading/Error/Empty 路径统一进入 `.page-shell` 或对应共享 shell |
| 2 | Dialog 尺寸 token 未统一 | 属实 | P1 | 使用 `--dialog-sm-width`、`--dialog-md-width`、`--dialog-lg-width` 三档 |
| 3 | Section 间距被局部覆盖 | 部分属实 | P1 | 页面级 shell 保持 `space-y-8`，二级内容使用 `.page-stack` |
| 4 | Metric/grid 间距存在 `gap-2/gap-3` 漂移 | 属实 | P1 | 关键指标与卡片网格统一 `gap-4` |
| 5 | 2/3 + 1/3 主从分栏缺 SSOT | 属实 | P1 | 新增 `.content-sidebar-grid`，替换手写比例 |
| 6 | Card padding 局部覆盖 | 部分属实 | P2 | 优先治理页面骨架和重点页面 `p-4/p-6` 覆盖 |
| 7 | Button 圆角被页面覆盖 | 属实 | P1 | 操作按钮回归 Button 默认圆角或明确 icon/segmented 场景 |
| 8 | raw shadow 残留 | 属实 | P2 | 业务页面 elevation 改为 `shadow-[var(--el-*)]`，保留基础组件内部 shadow token |
| 9 | BatchActionBar 定位不一致 | 属实 | P0 | 与 Planning 底栏一致：`bottom-4 left-1/2 -translate-x-1/2 max-w-content` |
| 10 | motion-safe 覆盖不完整 | 属实 | P1 | 动画 transition/duration/ease 成组使用 `motion-safe:` |

## 本轮不纳入修复

| 审计说法 | 核验结果 |
|---|---|
| `.page-content` 替代 `.page-shell` | 当前源码未定义 `.page-content`，`.page-shell` 仍是标准页面容器 |
| `GanttView` 无 Breadcrumb | `GanttViewHeader` 已渲染 `Breadcrumb` |
| `WBSTemplates` 缺 page-shell/document.title | 当前页面已有 `.page-shell` 与 `document.title` |
| `CompanyCockpit` 无页面级错误 UI | 错误信息已传入 `CompanyHero` 并以 `Alert` 展示 |

## 执行清单

### P0：必须完成

1. `Materials` loading 路径补 `.page-shell`。
2. `BaselinePage` loading/error 路径补共享 shell，避免裸 `LoadingState` 和裸 `px-6 py-8`。
3. `BatchActionBar` 和 `components/planning/BatchActionBar` 改成居中内容宽度底栏。

### P1：布局与组件一致性

1. `index.css` 增加 Dialog 与主从分栏 token：
   - `--dialog-sm-width: 440px`
   - `--dialog-md-width: 560px`
   - `--dialog-lg-width: 720px`
   - `.content-sidebar-grid`
2. `DialogContent` 和 `AlertDialogContent` 默认使用 Dialog token。
3. 重点弹窗宽度从 `max-w-md/xl/3xl` 收敛到三档 token。
4. `Materials`、`Reports`、`PlanningWorkspace`、`WBSTemplates` 的主从分栏改用 `.content-sidebar-grid` 或 `.page-section-grid`。
5. 指标/摘要类 `gap-3/gap-2` 改为 `gap-4`，保留紧凑按钮组的 `gap-2`。
6. 页面级 `page-shell` 不再覆盖为 `space-y-6`。
7. Button 上残留的 `rounded-2xl/rounded-lg` 覆盖移除。
8. `DashboardHealthCard`、`AcceptanceTimeline`、`Milestones` 的 progress 动画补齐 `motion-safe:`。

### P2：细节收口

1. 页面骨架 `PageSkeleton` raw shadow 改为 elevation token。
2. 重点页面显式 `shadow-sm/md/lg` 改为 `shadow-[var(--el-*)]`。
3. 明显 `p-4/p-6` 卡片内容覆盖改为 `p-5` 或 `CardContent padding`。

## 验收门禁

执行完成后至少通过：

```bash
npm run build --workspace=client
rg -n "page-shell[^\\n]*space-y-6|space-y-6[^\\n]*page-shell" client/src/pages client/src/components -g "*.tsx"
rg -n "<Button[^\\n]*rounded-(lg|2xl)" client/src/pages client/src/components -g "*.tsx"
rg -n "transition-all duration-700|motion-safe:transition-\\[width\\] duration-700" client/src/pages client/src/components -g "*.tsx"
```

允许残留：

- 基础组件内部必要 shadow，例如 Button/Badge/Tabs 默认态。
- 非弹窗场景的 `max-w-md/xl/3xl`，例如页面提示卡或文案宽度。
- 真实紧凑控件组里的 `gap-2`。

## 执行记录

- 已执行：2026-05-02
- 文档：新增本文件，明确“确认属实并执行”和“核验后不纳入”的边界。
- 页面外壳：`Materials` loading 路径、`BaselinePage` loading/error 路径已补 `.page-shell`。
- Token：`index.css` 增加 `--dialog-*-width` 与 `.content-sidebar-grid`，`.shell-surface` 改用 elevation token。
- Dialog：基础 `DialogContent`、`AlertDialogContent` 与重点业务弹窗宽度已收敛到 `--dialog-sm/md/lg-width`。
- 分栏：`Materials`、`Reports`、`WBSTemplates`、`PlanningWorkspace`、`PlanningWorkspaceLayers` 主从分栏已改用 `.content-sidebar-grid`。
- 间距：重点页面 `grid gap-3` 已收敛为 `grid gap-4`；页面级 `page-shell space-y-6` 已清零。
- Button：页面与 Header 中 `<Button ... rounded-lg/rounded-2xl>` 覆盖已清零。
- Bottom bar：通用 `BatchActionBar` 与 planning `BatchActionBar` 已改为居中内容宽度底栏。
- Motion：`DashboardHealthCard`、`AcceptanceTimeline`、`Milestones` 的进度条 transition/duration/ease 已成组补齐 `motion-safe:`。
- Shadow：业务页面/业务组件 raw `shadow-sm/md/lg/xl/2xl` 已替换为 `shadow-[var(--el-*)]`；基础 `components/ui` 默认态保留。

## 验证结果

```bash
npm run build --workspace=client
# 结果：通过，Vite production build completed.

rg -n "page-shell[^\\n]*space-y-6|space-y-6[^\\n]*page-shell" client/src/pages client/src/components -g "*.tsx"
# 结果：0 命中

rg -n "<Button[^\\n]*rounded-(lg|2xl)" client/src/pages client/src/components -g "*.tsx"
# 结果：0 命中

rg -n "transition-all duration-700|motion-safe:transition-\\[width\\] duration-700" client/src/pages client/src/components -g "*.tsx"
# 结果：0 命中

rg -n "grid gap-3" client/src/pages/Materials.tsx client/src/pages/Reports.tsx client/src/pages/planning/PlanningWorkspace.tsx client/src/pages/WBSTemplates.tsx client/src/pages/AcceptanceTimeline.tsx client/src/pages/GanttViewFilters.tsx
# 结果：0 命中

rg -n "shadow-(sm|md|lg|xl|2xl)" client/src/pages client/src/components -g "*.tsx" -g "!client/src/components/ui/**"
# 结果：0 命中
```
