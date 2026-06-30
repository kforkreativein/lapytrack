import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Clock } from "lucide-react";

/**
 * Scrollable payment method chips + prominent "Debit" (pay later) checkbox.
 * When onCredit is checked, cash is not counted until payment is recorded.
 */
export default function PaymentMethodPicker({
  banks,
  selected,
  onSelect,
  onCredit,
  onCreditChange,
  creditLabel = "Debit",
  creditHint,
}) {
  const defaultMethod = banks[0]?.name || "Cash";
  const active = selected || defaultMethod;

  return (
    <div className="space-y-3">
      <Label className="kpi-label mb-1.5 block">Payment Method</Label>
      <div className="flex gap-2 items-stretch">
        <div className="flex-1 min-w-0 overflow-x-auto pb-1 -mb-1">
          <div className="flex gap-2 w-max pr-1">
            {banks.map(b => (
              <button
                key={b.bank_id}
                type="button"
                disabled={onCredit}
                onClick={() => onSelect(b.name)}
                className={`px-3 py-2 text-xs rounded-sm border font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  onCredit
                    ? "opacity-40 cursor-not-allowed bg-zinc-50 text-zinc-400 border-zinc-200"
                    : active === b.name
                      ? "bg-zinc-950 text-white border-zinc-950"
                      : "bg-white text-zinc-700 border-zinc-300 hover:border-zinc-600"
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>

        <label
          className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-sm border-2 cursor-pointer transition-colors flex-shrink-0 min-w-[72px] ${
            onCredit
              ? "border-amber-500 bg-amber-50 text-amber-900"
              : "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-500"
          }`}
        >
          <Checkbox
            checked={onCredit}
            onCheckedChange={v => onCreditChange(!!v)}
            className="h-5 w-5 border-2 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
          />
          <span className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {creditLabel}
          </span>
        </label>
      </div>
      {onCredit && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-2.5 py-1.5">
          {creditHint || "Entry will be recorded but payment is not counted in today's totals until received."}
        </p>
      )}
    </div>
  );
}

export function txnRemaining(txn) {
  if (!txn?.on_credit) return 0;
  return Math.max(0, Number(txn.amount || 0) - Number(txn.amount_paid || 0));
}

export function txnCashOnDay(txn, dayStart, dayEnd) {
  if (!txn) return 0;
  if (txn.on_credit) {
    return (txn.payments || []).reduce((sum, p) => {
      const d = p.date || "";
      return dayStart <= d && d < dayEnd ? sum + Number(p.amount || 0) : sum;
    }, 0);
  }
  const d = txn.date || "";
  return dayStart <= d && d < dayEnd ? Number(txn.amount || 0) : 0;
}
