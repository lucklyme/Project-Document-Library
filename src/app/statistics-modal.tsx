"use client";

import type { DetailedStatistics } from "@/lib/repository";

type StatisticsModalProps = {
  stats: DetailedStatistics;
  onClose: () => void;
};

export function StatisticsModal({ stats, onClose }: StatisticsModalProps) {
  return (
    <div className="stat-modal-overlay" onClick={onClose}>
      <div className="stat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="stat-modal-header">
          <h2>详细统计</h2>
          <button type="button" className="modal-close-button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="stat-modal-content">
          <section className="stat-section">
            <h3 className="stat-section-title">基础统计</h3>
            <div className="stat-row">
              <span className="stat-label">现行文档</span>
              <span className="stat-value">{stats.activeDocuments} 个</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">作废文档</span>
              <span className="stat-value">{stats.obsoleteDocuments} 个</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">总版本数</span>
              <span className="stat-value">{stats.totalVersions} 个</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">总变更数</span>
              <span className="stat-value">{stats.totalChanges} 个</span>
            </div>
          </section>

          <section className="stat-section">
            <h3 className="stat-section-title">平均值</h3>
            <div className="stat-row">
              <span className="stat-label">平均每文档版本数</span>
              <span className="stat-value">{stats.averageVersionsPerDocument} 版</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">平均每文档变更数</span>
              <span className="stat-value">{stats.averageChangesPerDocument} 个</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">作废率</span>
              <span className="stat-value">{stats.obsoleteRate}%</span>
            </div>
          </section>

          <section className="stat-section">
            <h3 className="stat-section-title">存储空间</h3>
            <div className="stat-row">
              <span className="stat-label">总计</span>
              <span className="stat-value">{formatSize(stats.storageSize)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">版本文件</span>
              <span className="stat-value">{formatSize(stats.versionStorageSize)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">变更单</span>
              <span className="stat-value">{formatSize(stats.changeStorageSize)}</span>
            </div>
          </section>

          <section className="stat-section">
            <h3 className="stat-section-title">版本分布</h3>
            <div className="stat-row">
              <span className="stat-label">单版本文档</span>
              <span className="stat-value">{stats.versionDistribution.single} 个</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">2-5 版本</span>
              <span className="stat-value">{stats.versionDistribution.multiple} 个</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">6 版本以上</span>
              <span className="stat-value">{stats.versionDistribution.heavy} 个</span>
            </div>
          </section>

          <section className="stat-section">
            <h3 className="stat-section-title">变更分布</h3>
            <div className="stat-row">
              <span className="stat-label">无变更</span>
              <span className="stat-value">{stats.changeDistribution.none} 个</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">1-5 个变更</span>
              <span className="stat-value">{stats.changeDistribution.few} 个</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">6 个以上</span>
              <span className="stat-value">{stats.changeDistribution.many} 个</span>
            </div>
          </section>

          <section className="stat-section">
            <h3 className="stat-section-title">上传活跃度</h3>
            <div className="stat-row">
              <span className="stat-label">最近 7 天</span>
              <span className="stat-value">{stats.recentUploads.last7Days} 个</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">最近 30 天</span>
              <span className="stat-value">{stats.recentUploads.last30Days} 个</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">最新上传</span>
              <span className="stat-value">
                {stats.recentUploads.latestUploadTime ? formatDate(stats.recentUploads.latestUploadTime) : "暂无"}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
