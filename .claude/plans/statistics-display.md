# 文档统计展示功能实现计划

## 目标
为资料员添加文档-版本-变更的层级统计展示，包括首页卡片和详细统计模态框。

## 用户需求
- 目标用户：资料员
- 关注点：文档 → 版本 → 变更的层级关系
- 展示方式：首页简洁卡片 + 详细数据模态框

## 实现步骤

### 1. 后端统计函数 (`src/lib/repository.ts`)

添加两个统计函数：

#### `getDocumentStatistics()`
返回基础统计数据：
```typescript
{
  activeDocuments: number;      // 现行文档数
  totalVersions: number;         // 总版本数
  totalChanges: number;          // 总变更数
  obsoleteDocuments: number;     // 作废文档数
}
```

SQL查询：
- documents表统计active/obsolete
- document_versions表统计总数
- document_changes表统计总数

#### `getDetailedStatistics()`
返回详细统计数据：
```typescript
{
  // 基础统计
  ...基础统计,
  
  // 平均值
  averageVersionsPerDocument: number,
  averageChangesPerDocument: number,
  obsoleteRate: number,  // 作废率
  
  // 存储空间
  storageSize: number,
  versionStorageSize: number,
  changeStorageSize: number,
  
  // 分布统计
  versionDistribution: {
    single: number,      // 单版本文档数
    multiple: number,    // 2-5版本
    heavy: number        // 6+版本
  },
  changeDistribution: {
    none: number,        // 无变更
    few: number,         // 1-5个变更
    many: number         // 6+变更
  },
  
  // 活跃度
  recentUploads: {
    last7Days: number,
    last30Days: number,
    latestUploadTime: string | null
  }
}
```

### 2. 统计卡片组件 (`src/app/statistics-cards.tsx`)

服务端组件，展示4个统计卡片：

```tsx
<section className="statistics-section">
  <div className="statistics-grid">
    <div className="stat-card">
      <h3>文档</h3>
      <div className="stat-number">{stats.activeDocuments}</div>
    </div>
    <div className="stat-card">
      <h3>版本</h3>
      <div className="stat-number">{stats.totalVersions}</div>
    </div>
    <div className="stat-card">
      <h3>变更</h3>
      <div className="stat-number">{stats.totalChanges}</div>
    </div>
    <div className="stat-card">
      <h3>作废</h3>
      <div className="stat-number">{stats.obsoleteDocuments}</div>
    </div>
  </div>
  <button 
    className="view-details-button"
    onClick={打开模态框}
  >
    查看详细统计
  </button>
</section>
```

### 3. 统计模态框组件 (`src/app/statistics-modal.tsx`)

客户端组件，展示详细统计：

```tsx
'use client'

<div className="stat-modal-overlay" onClick={关闭}>
  <div className="stat-modal" onClick={阻止冒泡}>
    <div className="stat-modal-header">
      <h2>详细统计</h2>
      <button onClick={关闭}>×</button>
    </div>
    
    <div className="stat-modal-content">
      {/* 平均值统计 */}
      <section>
        <h3>平均值</h3>
        <div>平均每文档版本数: {averageVersions}</div>
        <div>平均每文档变更数: {averageChanges}</div>
        <div>作废率: {obsoleteRate}%</div>
      </section>
      
      {/* 存储空间 */}
      <section>
        <h3>存储空间</h3>
        <div>总计: {formatSize(storageSize)}</div>
        <div>版本文件: {formatSize(versionStorage)}</div>
        <div>变更单: {formatSize(changeStorage)}</div>
      </section>
      
      {/* 版本分布 */}
      <section>
        <h3>版本分布</h3>
        <div>单版本文档: {single}个</div>
        <div>2-5版本: {multiple}个</div>
        <div>6版本以上: {heavy}个</div>
      </section>
      
      {/* 变更分布 */}
      <section>
        <h3>变更分布</h3>
        <div>无变更: {none}个</div>
        <div>1-5个变更: {few}个</div>
        <div>6个以上: {many}个</div>
      </section>
      
      {/* 活跃度 */}
      <section>
        <h3>上传活跃度</h3>
        <div>最近7天: {last7Days}个</div>
        <div>最近30天: {last30Days}个</div>
        <div>最新上传: {latestTime}</div>
      </section>
    </div>
  </div>
</div>
```

### 4. 样式 (`src/app/globals.css`)

添加样式：

```css
/* 统计区域 */
.statistics-section {
  margin-bottom: 24px;
}

/* 统计卡片网格 */
.statistics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

/* 单个统计卡片 */
.stat-card {
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 20px;
  text-align: center;
}

.stat-card h3 {
  margin: 0 0 12px 0;
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.stat-number {
  font-size: 2.8rem;
  font-weight: 800;
  color: var(--accent);
  line-height: 1;
}

/* 查看详情按钮 */
.view-details-button {
  /* 使用现有的 secondary-button 样式 */
}

/* 模态框遮罩 */
.stat-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(22, 33, 28, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

/* 模态框主体 */
.stat-modal {
  max-width: 900px;
  max-height: 85vh;
  width: 100%;
  border-radius: 32px;
  background: var(--paper);
  box-shadow: 0 32px 120px rgba(22, 33, 28, 0.3);
  overflow: auto;
}

/* 模态框头部 */
.stat-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px;
  border-bottom: 1px solid var(--line);
}

/* 模态框内容 */
.stat-modal-content {
  padding: 28px;
  display: grid;
  gap: 24px;
}

.stat-modal-content section {
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--panel);
  padding: 20px;
}

/* 响应式 */
@media (max-width: 1024px) {
  .statistics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .statistics-grid {
    grid-template-columns: 1fr;
  }
}
```

### 5. 首页集成 (`src/app/page.tsx`)

在 hero 区域和 toolbar 区域之间插入统计卡片：

```tsx
<main className="shell">
  <section className="hero">
    {/* 现有内容 */}
  </section>

  {/* 新增统计卡片 */}
  {maintainer ? <StatisticsCards /> : null}

  <section className="toolbar">
    {/* 现有搜索栏 */}
  </section>

  {/* 现有文档列表 */}
</main>
```

## 技术细节

### 数据库查询优化
- 使用单次查询聚合统计，避免多次查询
- 利用现有索引

### 组件架构
- StatisticsCards: 服务端组件（直接查询数据库）
- StatisticsModal: 客户端组件（处理交互和状态）
- 通过 props 传递详细统计数据

### 权限控制
- 统计卡片仅对 maintainer（资料员/管理员）显示
- 与现有权限逻辑保持一致

## 文件清单

新增文件：
- `src/app/statistics-cards.tsx`
- `src/app/statistics-modal.tsx`

修改文件：
- `src/lib/repository.ts` - 添加统计函数
- `src/app/globals.css` - 添加样式
- `src/app/page.tsx` - 集成统计卡片
