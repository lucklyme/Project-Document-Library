import Link from "next/link";
import type { SortField, SortOrder } from "@/lib/repository";

type SortableHeaderProps = {
  field: SortField;
  currentSortBy?: string;
  currentSortOrder?: string;
  searchParams: URLSearchParams;
  children: React.ReactNode;
};

export function SortableHeader({ field, currentSortBy, currentSortOrder, searchParams, children }: SortableHeaderProps) {
  const isActive = currentSortBy === field;
  const nextOrder: SortOrder = isActive && currentSortOrder === "asc" ? "desc" : "asc";

  // 构建新的查询参数
  const newParams = new URLSearchParams(searchParams);
  newParams.set("sortBy", field);
  newParams.set("sortOrder", nextOrder);
  // 排序后回到第一页
  newParams.delete("page");

  const href = `/?${newParams.toString()}`;

  return (
    <Link href={href} className={`sortable-header ${isActive ? "active" : ""}`}>
      <span>{children}</span>
      {isActive ? (
        <span className="sort-indicator">{currentSortOrder === "asc" ? "▲" : "▼"}</span>
      ) : (
        <span className="sort-indicator inactive">⬍</span>
      )}
    </Link>
  );
}
