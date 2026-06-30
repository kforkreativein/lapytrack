import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";

const chipBase =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-sm border font-medium transition-colors whitespace-nowrap flex-shrink-0 min-h-[36px] touch-target";

function chipClass(active, disabled = false) {
  if (disabled) return `${chipBase} opacity-40 cursor-not-allowed bg-zinc-50 text-zinc-400 border-zinc-200`;
  if (active) return `${chipBase} bg-zinc-950 text-white border-zinc-950`;
  return `${chipBase} bg-white text-zinc-700 border-zinc-300 hover:border-zinc-600`;
}

/** Scrollable bank chips only — for partial payment recording */
export function BankChipPicker({ banks, selected, onSelect, label = "Payment Method" }) {
  const active = selected || banks[0]?.name || "Cash";
  return (
    <div>
      <Label className="kpi-label mb-1.5 block">{label}</Label>
      <div className="overflow-x-auto -mx-0.5 px-0.5 pb-0.5">
        <div className="flex gap-2 w-max">
          {banks.map(b => (
            <button
              key={b.bank_id}
              type="button"
              onClick={() => onSelect(b.name)}
              className={chipClass(active === b.name)}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Payment methods + Debit chip in one scrollable row.
 * Debit = pay later; cash not counted until payment is recorded.
 */
export default function PaymentMethodPicker({
  banks,
  selected,
  onSelect,
  onCredit,
  onCreditChange,
  creditHint,
  showDebit = true,
}) {
  const defaultMethod = banks[0]?.name || "Cash";
  const active = selected || defaultMethod;

  return (
    <div className="space-y-2">
      <Label className="kpi-label mb-1.5 block">Payment Method</Label>
      <div className="overflow-x-auto -mx-0.5 px-0.5 pb-0.5">
        <div className="flex gap-2 w-max">
          {banks.map(b => (
            <button
              key={b.bank_id}
              type="button"
              disabled={onCredit}
              onClick={() => onSelect(b.name)}
              className={chipClass(active === b.name, onCredit)}
            >
              {b.name}
            </button>
          ))}
          {showDebit && (
            <button
              type="button"
              onClick={() => onCreditChange(!onCredit)}
              className={chipClass(onCredit)}
              aria-pressed={onCredit}
            >
              <span
                className={`inline-flex items-center justify-center h-3.5 w-3.5 rounded-[3px] border ${
                  onCredit ? "bg-white border-white text-zinc-950" : "border-zinc-400 text-transparent"
                }`}
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              Debit
            </button>
          )}
        </div>
      </div>
      {onCredit && creditHint && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-2.5 py-1.5 leading-snug">
          {creditHint}
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
