"use client";

import { useState } from "react";
import { StatisticsModal } from "@/app/statistics-modal";
import type { DetailedStatistics } from "@/lib/repository";

type StatisticsButtonProps = {
  stats: DetailedStatistics;
};

export function StatisticsButton({ stats }: StatisticsButtonProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        type="button"
        className="statistics-toggle-button"
        onClick={() => setShowModal(true)}
        title="查看详细统计"
      >
        📊 详细统计
      </button>

      {showModal ? <StatisticsModal stats={stats} onClose={() => setShowModal(false)} /> : null}
    </>
  );
}
