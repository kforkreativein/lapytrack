import { useState } from "react";
import { Cpu, Boxes, BookOpen, Tag, ShieldCheck, ArrowRight } from "lucide-react";

const STEPS = [
  {
    icon: Cpu,
    number: "01",
    title: "Welcome to LapyTrack",
    desc: "Your complete shop management tool — track every repair job and every rupee, all in one place.",
  },
  {
    icon: Boxes,
    number: "02",
    title: "Register Devices",
    desc: "Log any laptop or desktop that comes in for repair. Pick the brand, model, and what's wrong — the device gets a job card instantly.",
  },
  {
    icon: BookOpen,
    number: "03",
    title: "Khata Book",
    desc: "Record who owes you and who you owe. Tap 'You Got' or 'You Gave', enter the amount — balances update automatically.",
  },
  {
    icon: Tag,
    number: "04",
    title: "Customize Everything",
    desc: "Add your own brands, repair categories, payment methods. Import your phone contacts in one tap from the Customize tab.",
  },
  {
    icon: ShieldCheck,
    number: "05",
    title: "Stays Secure",
    desc: "The app locks itself after 15 minutes. Just enter your 4-digit PIN to get back in. You can also lock it manually from the sidebar.",
  },
];

const STORAGE_KEY = "kc_onboarding_done";
const REGISTRATION_FLAG = "kc_show_onboarding_after_setup";

export function useOnboarding() {
  const [show, setShow] = useState(() =>
    sessionStorage.getItem(REGISTRATION_FLAG) === "1" && !localStorage.getItem(STORAGE_KEY)
  );
  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    sessionStorage.removeItem(REGISTRATION_FLAG);
    setShow(false);
  };
  return { show, dismiss };
}

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white w-full max-w-[380px] border border-zinc-200 shadow-xl">

        {/* Step counter row */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-zinc-400">
            Step {step + 1} of {STEPS.length}
          </span>
          <button onClick={onDone} className="text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors">
            Skip
          </button>
        </div>

        {/* Icon */}
        <div className="px-6 pt-6 pb-2">
          <div className="w-12 h-12 bg-zinc-100 flex items-center justify-center mb-5">
            <Icon className="w-5 h-5 text-zinc-800" strokeWidth={2} />
          </div>

          <div className="text-[11px] font-bold tracking-[0.14em] text-zinc-400 mb-2 uppercase">
            {current.number}
          </div>
          <h2 className="font-heading text-xl font-bold text-zinc-950 leading-tight mb-3">
            {current.title}
          </h2>
          <p className="text-sm text-zinc-500 leading-relaxed">
            {current.desc}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 px-6 pt-5 pb-1">
          {STEPS.map((_, i) => (
            <button key={i} onClick={() => setStep(i)}
              className={`rounded-full transition-all duration-200 ${
                i === step ? "w-5 h-1.5 bg-zinc-950" : i < step ? "w-1.5 h-1.5 bg-zinc-400" : "w-1.5 h-1.5 bg-zinc-200"
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-4 pt-3">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 h-10 border border-zinc-200 text-sm font-medium text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={isLast ? onDone : () => setStep(s => s + 1)}
            className={`${step === 0 ? "w-full" : "flex-[2]"} h-10 bg-zinc-950 text-white text-sm font-semibold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5`}
          >
            {isLast ? "Get started" : <>Next <ArrowRight className="w-3.5 h-3.5" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
