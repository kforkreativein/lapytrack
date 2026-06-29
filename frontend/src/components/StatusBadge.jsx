import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  in_stock: "text-blue-700 bg-blue-50 border-blue-200",
  issued: "text-zinc-700 bg-zinc-100 border-zinc-300",
  in_repair: "text-amber-700 bg-amber-50 border-amber-300",
  overdue: "text-red-700 bg-red-50 border-red-200",
};

const STATUS_LABELS = {
  in_stock: "In Stock",
  issued: "Issued",
  in_repair: "In Repair",
  overdue: "Overdue",
};

export function StatusBadge({ status, expectedReturnDate, className }) {
  let key = status;
  if (status === "issued" && expectedReturnDate) {
    const d = new Date(expectedReturnDate);
    if (d < new Date()) key = "overdue";
  }
  return (
    <span
      data-testid={`status-badge-${key}`}
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider border rounded-sm",
        STATUS_STYLES[key] || STATUS_STYLES.issued,
        className
      )}
    >
      {STATUS_LABELS[key] || key}
    </span>
  );
}
