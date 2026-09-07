import { useState } from "react";

export interface VisualProps {
  language: string;
  isRTL: boolean;
}

// ── Slide 0: Welcome / Dilemma enters -> 6 Experts -> 1 Report ───────────────
export function VisualMashwaraIntro({ language }: VisualProps) {
  const isUrdu = language === "ur";
  return (
    <div className="w-full py-2 px-1 flex flex-col items-center justify-center gap-2.5 select-none">
      {/* Dilemma pill */}
      <div className="w-full max-w-sm px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/50 shadow-xs flex items-center gap-2.5 animate-fade-in">
        <span className="text-base flex-shrink-0">💭</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-blue-900 dark:text-blue-200 truncate">
            {isUrdu ? "90k جاب آفر قبول کروں یا فری لانسنگ؟" : "90k job loon ya freelancing continue karun?"}
          </p>
          <p className="text-[9px] text-blue-600 dark:text-blue-400">
            {isUrdu ? "صارف کا اہم فیصلہ" : "Important Life / Career Decision"}
          </p>
        </div>
      </div>

      {/* Modern capability indicators */}
      <div className="flex items-center gap-1.5 flex-wrap justify-center text-[9px] font-semibold text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-white/5 border border-slate-300/40 dark:border-white/5">
          <span>📎</span>
          <span>{isUrdu ? "دستاویزی ثبوت" : "Evidence"}</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-white/5 border border-slate-300/40 dark:border-white/5">
          <span>🌐</span>
          <span>{isUrdu ? "تازہ ریسرچ" : "Live Web"}</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-white/5 border border-slate-300/40 dark:border-white/5">
          <span>🎙️</span>
          <span>{isUrdu ? "صوتی نوٹ" : "Voice Note"}</span>
        </span>
      </div>

      {/* Downward flow connector */}
      <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-xs -my-1">
        <span className="w-8 h-px bg-slate-200 dark:bg-slate-700" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {isUrdu ? "6 ماہرین کا تجزیہ" : "6 Specialists"}
        </span>
        <span className="w-8 h-px bg-slate-200 dark:bg-slate-700" />
      </div>

      {/* 6 Mini Expert cards grid */}
      <div className="grid grid-cols-3 gap-1.5 w-full max-w-md">
        {[
          { icon: "🧭", name: isUrdu ? "کیریئر مشیر" : "Career Musheer", color: "from-blue-500 to-indigo-600" },
          { icon: "💰", name: isUrdu ? "مالی مشیر" : "Financial Musheer", color: "from-emerald-500 to-teal-600" },
          { icon: "🛠️", name: isUrdu ? "عملی مشیر" : "Practical Musheer", color: "from-amber-500 to-orange-600" },
          { icon: "👨‍👩‍👦", name: isUrdu ? "خاندانی مشیر" : "Family Musheer", color: "from-rose-500 to-pink-600" },
          { icon: "⚠️", name: isUrdu ? "رسک ایکسپرٹ" : "Risk Expert", color: "from-purple-500 to-violet-600" },
          { icon: "⚡", name: isUrdu ? "مخالف رائے" : "Mukhalif Raaye", color: "from-red-500 to-rose-700" },
        ].map((exp, idx) => (
          <div
            key={idx}
            className="flex items-center gap-1 p-1.5 rounded-lg bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-white/10 shadow-xs"
          >
            <div className={`w-4 h-4 rounded-md bg-gradient-to-br ${exp.color} text-[9px] text-white flex items-center justify-center flex-shrink-0`}>
              {exp.icon}
            </div>
            <span className="text-[9px] font-medium text-slate-800 dark:text-slate-200 truncate leading-tight">
              {exp.name}
            </span>
          </div>
        ))}
      </div>

      {/* Final Synthesized Report miniature */}
      <div className="w-full max-w-sm px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-500/30 dark:border-emerald-500/20 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">📊</span>
          <div className="text-start">
            <p className="text-[10px] font-bold text-slate-900 dark:text-white">
              {isUrdu ? "جامع مشورہ رپورٹ" : "Actionable Mashwara Report"}
            </p>
            <p className="text-[8.5px] text-emerald-600 dark:text-emerald-400">
              {isUrdu ? "متوازن، عملی اور حتمی رہنمائی" : "Consensus, Risks & Next Steps"}
            </p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[8.5px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
          ✓ Ready
        </span>
      </div>
    </div>
  );
}

// ── Slide 1: Miniature of REAL Composer (Chat vs Council Toggle) ─────────────
export function VisualChatVsCouncil({ language }: VisualProps) {
  const isUrdu = language === "ur";
  const [isCouncil, setIsCouncil] = useState(true);

  return (
    <div className="w-full py-2 px-1 flex flex-col items-center justify-center gap-2.5 select-none">
      {/* Toggle indicator button (interactive preview!) */}
      <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/10 shadow-inner">
        <button
          type="button"
          onClick={() => setIsCouncil(false)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            !isCouncil
              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
          }`}
          aria-label="Select 1:1 Normal Chat mode"
        >
          <span>💬</span>
          <span>{isUrdu ? "سادہ چیٹ" : "Normal Chat"}</span>
        </button>
        <button
          type="button"
          onClick={() => setIsCouncil(true)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            isCouncil
              ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/30"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
          }`}
          aria-label="Select Full Mashwara Council mode"
        >
          <span>🏛️</span>
          <span>{isUrdu ? "مکمل مشورہ (کونسل)" : "Full Mashwara"}</span>
        </button>
      </div>

      {/* Miniature Composer Box */}
      <div className="w-full max-w-md p-3 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-white/10 shadow-md flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-slate-800 dark:text-slate-100 font-medium leading-relaxed text-start">
            {isUrdu
              ? "90k جاب آفر قبول کروں یا فری لانسنگ جاری رکھوں؟"
              : "90k job loon ya freelancing continue karun?"}
          </p>
          <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] flex-shrink-0">
            ↑
          </span>
        </div>

        {/* Composer bottom toolbar miniature */}
        <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold transition-all ${
                isCouncil
                  ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30"
                  : "bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300"
              }`}
            >
              {isCouncil ? "⚡ 6 Specialists Active" : "💬 1:1 Assistant Mode"}
            </span>
          </div>
          <span className="text-slate-400 text-[9px]">
            {isCouncil ? (isUrdu ? "کونسل آن ہے" : "Council Mode: ON") : (isUrdu ? "سادہ گفتگو" : "Chat Mode")}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center">
        {isCouncil
          ? isUrdu
            ? "اہم فیصلے کے لیے 6 مشیروں کی خود مختار مشاورت"
            : "Full consultation brings 6 specialists into deliberation"
          : isUrdu
            ? "فوری سوال اور فالو اپ وضاحت کے لیے تیز چیٹ"
            : "Use simple chat for quick clarifications"}
      </p>
    </div>
  );
}

// ── Slide 2: Prompt Context Highlighting (Numbers, constraints, family) ───────
export function VisualPromptContext({ language }: VisualProps) {
  const isUrdu = language === "ur";
  return (
    <div className="w-full py-2 px-1 flex flex-col items-center justify-center gap-3 select-none">
      {/* Miniature input box with highlighted tokens */}
      <div className="w-full max-w-md p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-white/10 shadow-md space-y-2.5">
        <div className="text-xs text-slate-800 dark:text-slate-100 leading-relaxed text-start">
          {isUrdu ? (
            <>
              میرے پاس{" "}
              <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold border border-blue-300 dark:border-blue-700">
                90k
              </span>{" "}
              کی فکسڈ جاب ہے، فری لانسنگ سے{" "}
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-700">
                40k–150k
              </span>{" "}
              بنتے ہیں، اور{" "}
              <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-bold border border-rose-300 dark:border-rose-700">
                گھر کا خرچہ
              </span>{" "}
              بھی پورا کرنا ہے۔ کیا کروں؟
            </>
          ) : (
            <>
              <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold border border-blue-300 dark:border-blue-700">
                90k
              </span>{" "}
              ki job offer hai, freelancing{" "}
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-700">
                40k–150k
              </span>{" "}
              vary karti hai,{" "}
              <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-bold border border-rose-300 dark:border-rose-700">
                ghar ka kharcha
              </span>{" "}
              bhi hai. Kya karun?
            </>
          )}
        </div>

        {/* Feature badge tags derived from prompt */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 dark:border-white/5">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
            🔢 {isUrdu ? "اعداد و شمار" : "Numbers"}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
            📊 {isUrdu ? "آمدنی کا پھیلاؤ" : "Income Range"}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">
            👨‍👩‍👦 {isUrdu ? "گھریلو مجبوریاں" : "Family Constraints"}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center max-w-xs">
        {isUrdu
          ? "جتنے واضح نمبرز اور مجبوریاں لکھیں گے، ماہرین کا تجزیہ اتنا ہی حقیقت پسندانہ ہوگا"
          : "Mention exact numbers, budget realities, and timeline for razor-sharp advice"}
      </p>
    </div>
  );
}

// ── Slide 3: VisualAutoRouting (NEW: Intelligent Dynamic Council Assembly) ───
export function VisualAutoRouting({ language }: VisualProps) {
  const isUrdu = language === "ur";
  const [selectedPreset, setSelectedPreset] = useState<"education" | "freelance" | "startup">("education");

  const presets = {
    education: {
      label: isUrdu ? "🎓 بیرون ملک تعلیم یا مقامی؟" : "🎓 Study abroad or locally?",
      dimensions: [
        { icon: "🎓", name: isUrdu ? "تعلیم" : "Education" },
        { icon: "💰", name: isUrdu ? "فنانس" : "Finance" },
        { icon: "🌍", name: isUrdu ? "عالمی مواقع" : "Global Scope" },
        { icon: "👨‍👩‍👦", name: isUrdu ? "خاندانی ترجیحات" : "Family" },
      ],
      council: [
        { icon: "🎓", name: isUrdu ? "تعلیمی مشیر" : "Academic Advisor", color: "from-sky-500 to-blue-600" },
        { icon: "💰", name: isUrdu ? "مالی مشیر" : "Financial Musheer", color: "from-emerald-500 to-teal-600" },
        { icon: "🌍", name: isUrdu ? "مواقع کا مشیر" : "Opportunity Advisor", color: "from-indigo-500 to-blue-700" },
        { icon: "👨‍👩‍👦", name: isUrdu ? "خاندانی مشیر" : "Family Advisor", color: "from-rose-500 to-pink-600" },
        { icon: "🧭", name: isUrdu ? "کیریئر مشیر" : "Career Musheer", color: "from-blue-600 to-indigo-700" },
        { icon: "⚡", name: isUrdu ? "مخالف رائے" : "Critical Challenger", color: "from-red-500 to-rose-700" },
      ],
    },
    freelance: {
      label: isUrdu ? "💼 90k جاب یا فری لانسنگ؟" : "💼 90k job vs freelancing?",
      dimensions: [
        { icon: "💰", name: isUrdu ? "آمدنی کا استحکام" : "Income Stability" },
        { icon: "🧭", name: isUrdu ? "کیریئر گروتھ" : "Career Growth" },
        { icon: "⚠️", name: isUrdu ? "رسک لیول" : "Risk" },
        { icon: "👨‍👩‍👦", name: isUrdu ? "گھریلو اخراجات" : "Family Budget" },
      ],
      council: [
        { icon: "🧭", name: isUrdu ? "کیریئر مشیر" : "Career Musheer", color: "from-blue-500 to-indigo-600" },
        { icon: "💰", name: isUrdu ? "مالی مشیر" : "Financial Musheer", color: "from-emerald-500 to-teal-600" },
        { icon: "💻", name: isUrdu ? "فری لانس مشیر" : "Freelance Advisor", color: "from-cyan-500 to-blue-600" },
        { icon: "⚠️", name: isUrdu ? "رسک ایکسپرٹ" : "Risk Expert", color: "from-purple-500 to-violet-600" },
        { icon: "👨‍👩‍👦", name: isUrdu ? "خاندانی مشیر" : "Family Advisor", color: "from-rose-500 to-pink-600" },
        { icon: "⚡", name: isUrdu ? "مخالف رائے" : "Critical Challenger", color: "from-red-500 to-rose-700" },
      ],
    },
    startup: {
      label: isUrdu ? "🚀 اسٹارٹ اپ ابھی یا انتظار؟" : "🚀 Launch startup or wait?",
      dimensions: [
        { icon: "🚀", name: isUrdu ? "اسٹریٹجی" : "Strategy" },
        { icon: "⚙️", name: isUrdu ? "ٹیکنالوجی" : "Tech Arch" },
        { icon: "💰", name: isUrdu ? "رن وے فنڈز" : "Cash Runway" },
        { icon: "📦", name: isUrdu ? "پروڈکٹ ڈیمانڈ" : "Product Fit" },
      ],
      council: [
        { icon: "🚀", name: isUrdu ? "بزنس اسٹریٹجسٹ" : "Business Strategist", color: "from-amber-500 to-orange-600" },
        { icon: "💰", name: isUrdu ? "مالی مشیر" : "Financial Advisor", color: "from-emerald-500 to-teal-600" },
        { icon: "⚙️", name: isUrdu ? "ٹیکنالوجی مشیر" : "Technology Advisor", color: "from-blue-500 to-indigo-600" },
        { icon: "📦", name: isUrdu ? "پروڈکٹ مشیر" : "Product Advisor", color: "from-rose-500 to-pink-600" },
        { icon: "🛠️", name: isUrdu ? "آپریشنز ماہر" : "Operations Expert", color: "from-teal-500 to-emerald-700" },
        { icon: "⚡", name: isUrdu ? "مخالف رائے" : "Critical Challenger", color: "from-red-500 to-rose-700" },
      ],
    },
  };

  const current = presets[selectedPreset];

  return (
    <div className="w-full py-1.5 px-1 flex flex-col items-center justify-center gap-2 select-none">
      {/* Auto Routing Header Badge */}
      <div className="flex items-center gap-2">
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex items-center gap-1 shadow-xs">
          <span>✨</span>
          <span>{isUrdu ? "خودکار روٹنگ (Auto Mode)" : "Auto Expert Routing"}</span>
        </span>
      </div>

      {/* Preset Selector Chips */}
      <div className="flex items-center gap-1.5 flex-wrap justify-center max-w-md">
        {(Object.keys(presets) as Array<keyof typeof presets>).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelectedPreset(key)}
            aria-label={`Select ${key} dilemma example`}
            className={`px-2.5 py-1 rounded-xl text-[10px] font-semibold transition-all cursor-pointer ${
              selectedPreset === key
                ? "bg-blue-600 text-white shadow-xs scale-102 ring-2 ring-blue-500/30"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {presets[key].label}
          </button>
        ))}
      </div>

      {/* Identified Dimensions Bar */}
      <div className="w-full max-w-md p-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-white/5 flex items-center justify-between text-[9px] text-slate-600 dark:text-slate-300">
        <span className="font-bold text-slate-400 uppercase tracking-wider text-[8px] px-1">
          {isUrdu ? "پہلو:" : "Dimensions:"}
        </span>
        <div className="flex items-center gap-1 flex-wrap">
          {current.dimensions.map((dim, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-700/80 font-medium border border-slate-200/50 dark:border-white/5 shadow-2xs"
            >
              <span>{dim.icon}</span>
              <span>{dim.name}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Dynamic Council (Transforms with selection!) */}
      <div className="grid grid-cols-3 gap-1.5 w-full max-w-md animate-fade-in" key={selectedPreset}>
        {current.council.map((exp, idx) => (
          <div
            key={idx}
            className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-white/10 shadow-xs transition-all hover:border-blue-400"
          >
            <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${exp.color} text-[10px] text-white flex items-center justify-center flex-shrink-0 shadow-2xs`}>
              {exp.icon}
            </div>
            <span className="text-[9.5px] font-semibold text-slate-800 dark:text-slate-200 truncate leading-tight">
              {exp.name}
            </span>
          </div>
        ))}
      </div>

      {/* Core Takeaway Badge */}
      <div className="px-3 py-1 rounded-full bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/50 text-[9.5px] text-blue-700 dark:text-blue-300 font-semibold flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        <span>{isUrdu ? "کونسل آپ کے فیصلے کے مطابق خود ڈھلتی ہے" : "The council changes with the decision"}</span>
      </div>
    </div>
  );
}

// ── Slide 4: VisualDocumentEvidence (NEW: Private File Attachment & Analysis) ──
export function VisualDocumentEvidence({ language }: VisualProps) {
  const isUrdu = language === "ur";
  const [evidenceShown, setEvidenceShown] = useState(true);

  return (
    <div className="w-full py-1.5 px-1 flex flex-col items-center justify-center gap-2 select-none">
      {/* Miniature Composer with Attached Files */}
      <div className="w-full max-w-md p-2.5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-white/10 shadow-md space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-800 dark:text-slate-100 font-medium text-start truncate">
            {isUrdu ? "کیا میں اس AI Engineer جاب کے لیے اپلائی کروں؟" : "Should I apply for this AI Engineer role?"}
          </p>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center gap-1 flex-shrink-0">
            <span>🔒</span>
            <span>{isUrdu ? "پرائیویٹ ثبوت" : "Private Evidence"}</span>
          </span>
        </div>

        {/* File Chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-[10px] font-medium text-blue-800 dark:text-blue-200 shadow-2xs">
            <span>📄</span>
            <span className="font-mono text-[9px]">Haris-CV.pdf</span>
            <span className="text-emerald-500 font-bold text-[9px]">✓</span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-[10px] font-medium text-blue-800 dark:text-blue-200 shadow-2xs">
            <span>📄</span>
            <span className="font-mono text-[9px]">AI-Engineer-JD.pdf</span>
            <span className="text-emerald-500 font-bold text-[9px]">✓</span>
          </div>
          <button
            type="button"
            onClick={() => setEvidenceShown((prev) => !prev)}
            aria-label="Toggle example evidence preview"
            className="px-2 py-1 rounded-lg text-[9px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            {evidenceShown ? (isUrdu ? "چھپائیں" : "Hide") : (isUrdu ? "دیکھیں" : "Inspect")}
          </button>
        </div>
      </div>

      {/* Extracted Normalized Evidence Card */}
      {evidenceShown && (
        <div className="w-full max-w-md p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 shadow-xs text-start space-y-1.5 animate-fade-in">
          <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200/60 dark:border-white/5 pb-1">
            <span className="flex items-center gap-1">
              <span>📋</span>
              <span>{isUrdu ? "دستاویزی ثبوت (Shared Evidence)" : "Document Evidence Pack"}</span>
            </span>
            <span className="font-mono text-[8.5px] text-slate-400">2 files parsed</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[9.5px]">
            <div className="p-1 rounded bg-white dark:bg-slate-800/80 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              ✓ Python & FastAPI matched
            </div>
            <div className="p-1 rounded bg-white dark:bg-slate-800/80 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              ✓ AI agent experience matched
            </div>
            <div className="p-1 rounded bg-white dark:bg-slate-800/80 border border-amber-500/20 text-amber-700 dark:text-amber-300">
              ⚠️ 3 yrs required (2 yrs on CV)
            </div>
            <div className="p-1 rounded bg-white dark:bg-slate-800/80 border border-amber-500/20 text-amber-700 dark:text-amber-300">
              ⚠️ AWS cert not found
            </div>
          </div>
        </div>
      )}

      {/* Shared to All 6 Musheers Connector */}
      <div className="w-full max-w-md p-1.5 rounded-xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20 shadow-2xs flex items-center justify-between text-[9.5px]">
        <span className="font-semibold text-blue-700 dark:text-blue-300">
          {isUrdu ? "یکساں مستند ثبوت" : "Same normalized evidence"}
        </span>
        <div className="flex items-center gap-1">
          <span>→</span>
          <div className="flex items-center gap-0.5 text-[9px]">
            <span className="w-3.5 h-3.5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[7px]">1</span>
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[7px]">2</span>
            <span className="w-3.5 h-3.5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[7px]">3</span>
            <span className="w-3.5 h-3.5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[7px]">4</span>
            <span className="w-3.5 h-3.5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[7px]">5</span>
            <span className="w-3.5 h-3.5 rounded-full bg-red-600 text-white flex items-center justify-center text-[7px]">6</span>
          </div>
          <span className="font-bold text-slate-700 dark:text-slate-200">
            {isUrdu ? "تمام 6 مشیر" : "All 6 Musheers"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Slide 5: VisualWebResearch (NEW: Grounded Live Research with Citations) ───
export function VisualWebResearch({ language }: VisualProps) {
  const isUrdu = language === "ur";
  const [mode, setMode] = useState<"auto" | "on" | "off">("auto");

  return (
    <div className="w-full py-1.5 px-1 flex flex-col items-center justify-center gap-2 select-none">
      {/* Miniature Web Research Mode Toggle */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/10 shadow-inner">
        <span className="text-xs px-1.5 font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
          <span>🌐</span>
          <span className="text-[10px]">{isUrdu ? "ویب ریسرچ:" : "Web Research:"}</span>
        </span>
        {(["auto", "on", "off"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-label={`Set web research to ${m}`}
            className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
              mode === m
                ? "bg-blue-600 text-white shadow-xs scale-102 ring-2 ring-blue-500/30"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Question Dilemma */}
      <div className="w-full max-w-md p-2 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-white/10 shadow-sm text-start flex items-center justify-between gap-2">
        <p className="text-xs text-slate-800 dark:text-slate-100 font-medium truncate">
          {isUrdu ? "کیا میں اس سال اس اسکالرشپ کے لیے اپلائی کروں؟" : "Should I apply to this scholarship this year?"}
        </p>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 font-mono font-bold flex-shrink-0">
          {mode === "off" ? "Off" : "Live Fact Check"}
        </span>
      </div>

      {/* Research Findings State */}
      {mode !== "off" ? (
        <div className="w-full max-w-md p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-blue-500/20 shadow-xs text-start space-y-1.5 animate-fade-in">
          <div className="flex items-center justify-between text-[9px] font-bold text-blue-700 dark:text-blue-300">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
              <span>{isUrdu ? "آج کی تصدیق شدہ معلومات" : "Current Verified Sources"}</span>
            </span>
            <span className="text-slate-400 font-normal">1 research pass</span>
          </div>

          <div className="space-y-1 text-[9.5px]">
            <div className="flex items-center justify-between p-1 rounded bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/5">
              <span className="text-slate-800 dark:text-slate-200">
                ✓ {isUrdu ? "آخری تاریخ: 20 فروری 2027" : "Deadline: 20 Feb 2027"}
              </span>
              <span className="text-[8.5px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-700 font-mono text-slate-500">
                gov.pk
              </span>
            </div>

            <div className="flex items-center justify-between p-1 rounded bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/5">
              <span className="text-slate-800 dark:text-slate-200">
                ✓ {isUrdu ? "ٹیوشن فیس: 100% کوریج" : "Tuition: 100% Full Waiver"}
              </span>
              <span className="text-[8.5px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-700 font-mono text-slate-500">
                university.edu
              </span>
            </div>

            <div className="flex items-center justify-between p-1 rounded bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/5">
              <span className="text-slate-800 dark:text-slate-200">
                ? {isUrdu ? "ماہانہ وظیفہ: شرائط لاگو ہیں" : "Stipend: Subject to GPA requirements"}
              </span>
              <span className="text-[8.5px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-700 font-mono text-slate-500">
                official portal
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md p-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/50 border border-slate-200 dark:border-white/5 text-center text-xs text-slate-500 animate-fade-in">
          <span>{isUrdu ? "ویب ریسرچ غیر فعال ہے — کونسل صرف آپ کے دیے گئے مواد پر غور کرے گی" : "Web research disabled — council uses only your provided context."}</span>
        </div>
      )}

      {/* Shared Evidence Pack Connector */}
      <div className="px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-[9.5px] text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-1.5">
        <span>● ● ● ● ● ●</span>
        <span>{isUrdu ? "تمام 6 مشیروں کے لیے ایک تصدیق شدہ حوالہ پیک" : "Single verified evidence pack shared with all 6 Musheers"}</span>
      </div>
    </div>
  );
}

// ── Slide 6: VisualExpertCouncil (REFOCUSED: What each specialist contributes)
export function VisualExpertCouncil({ language }: VisualProps) {
  const isUrdu = language === "ur";
  const experts = [
    {
      icon: "🧭",
      title: isUrdu ? "کیریئر مشیر" : "Career Musheer",
      role: isUrdu ? "طویل مدتی مارکیٹ ویلیو اور ڈیمانڈ" : "Employability & Career Trajectory",
      color: "from-blue-500 to-indigo-600",
      tag: isUrdu ? "گروتھ" : "Growth",
    },
    {
      icon: "💰",
      title: isUrdu ? "مالی مشیر" : "Financial Musheer",
      role: isUrdu ? "کیش فلو، بچت اور ایمرجنسی فنڈ" : "Cash Flow, Runway & Stability",
      color: "from-emerald-500 to-teal-600",
      tag: isUrdu ? "کیش فلو" : "Cash Flow",
    },
    {
      icon: "🛠️",
      title: isUrdu ? "عملی مشیر" : "Practical Musheer",
      role: isUrdu ? "کام کا بوجھ، گھنٹے اور برن آؤٹ" : "Workload, Hours & Execution",
      color: "from-amber-500 to-orange-600",
      tag: isUrdu ? "وقت" : "Bandwidth",
    },
    {
      icon: "👨‍👩‍👦",
      title: isUrdu ? "خاندانی مشیر" : "Family Musheer",
      role: isUrdu ? "گھریلو بجٹ اور خاندانی ضروریات" : "Household Predictability & Duty",
      color: "from-rose-500 to-pink-600",
      tag: isUrdu ? "گھر" : "Family",
    },
    {
      icon: "⚠️",
      title: isUrdu ? "رسک ایکسپرٹ" : "Risk Expert",
      role: isUrdu ? "بدترین صورتحال اور نقصانات سے بچاؤ" : "Worst-case Downside Protection",
      color: "from-purple-500 to-violet-600",
      tag: isUrdu ? "حفاظت" : "Protection",
    },
    {
      icon: "⚡",
      title: isUrdu ? "مخالف رائے" : "Mukhalif Raaye",
      role: isUrdu ? "یکطرفہ مفروضوں پر تنقید اور سوالات" : "Attacks Assumptions & Groupthink",
      color: "from-red-500 to-rose-700",
      tag: isUrdu ? "تنقید" : "Challenger",
    },
  ];

  return (
    <div className="w-full py-1.5 px-1 flex flex-col items-center justify-center gap-2 select-none">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full max-w-lg">
        {experts.map((exp, idx) => (
          <div
            key={idx}
            className="p-2 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-white/10 shadow-xs flex items-start gap-2"
          >
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${exp.color} text-xs text-white flex items-center justify-center flex-shrink-0 shadow-xs mt-0.5`}>
              {exp.icon}
            </div>
            <div className="min-w-0 text-start flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[10px] font-bold text-slate-900 dark:text-white truncate">
                  {exp.title}
                </p>
                <span className="text-[8px] font-semibold px-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
                  {exp.tag}
                </span>
              </div>
              <p className="text-[8.5px] text-slate-500 dark:text-slate-400 leading-tight line-clamp-2 mt-0.5">
                {exp.role}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-[9.5px] text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        <span>{isUrdu ? "ہر پہلو کا الگ اور عمیق تجزیہ — کوئی سطحی جواب نہیں" : "Distinct specialist lenses — no shallow generalist answers"}</span>
      </div>
    </div>
  );
}

// ── Slide 7: Meaningful Disagreement & Rebuttal Arrow ────────────────────────
export function VisualDisagreement({ language }: VisualProps) {
  const isUrdu = language === "ur";
  return (
    <div className="w-full py-2 px-1 flex flex-col items-center justify-center gap-2.5 select-none">
      {/* Divergent Opinions Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full max-w-lg">
        {/* Card 1: Financial */}
        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-emerald-500/30 shadow-xs text-start">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs">💰</span>
            <span className="text-[10px] font-bold text-slate-900 dark:text-white truncate">
              {isUrdu ? "مالی مشیر" : "Financial Musheer"}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            ✓ {isUrdu ? "ہاں" : "Haan"} · 82%
          </span>
          <p className="text-[9px] text-slate-500 mt-1 line-clamp-2">
            {isUrdu ? "فکسڈ 90k تنخواہ گھر کے بجٹ کو محفوظ بناتی ہے۔" : "90k fixed salary brings predictability."}
          </p>
        </div>

        {/* Card 2: Risk */}
        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-amber-500/30 shadow-xs text-start">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs">⚠️</span>
            <span className="text-[10px] font-bold text-slate-900 dark:text-white truncate">
              {isUrdu ? "رسک ایکسپرٹ" : "Risk Expert"}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
            ⏸ {isUrdu ? "مزید سوچ" : "Mazeed Soch"} · 68%
          </span>
          <p className="text-[9px] text-slate-500 mt-1 line-clamp-2">
            {isUrdu ? "فل ٹائم جاب سے کلائنٹ نیٹ ورک ختم ہو سکتا ہے۔" : "Job schedule might kill client base."}
          </p>
        </div>

        {/* Card 3: Mukhalif */}
        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-rose-500/30 shadow-xs text-start">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs">⚡</span>
            <span className="text-[10px] font-bold text-slate-900 dark:text-white truncate">
              {isUrdu ? "مخالف رائے" : "Mukhalif Raaye"}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400">
            ✗ {isUrdu ? "نہیں" : "Nahi"} · 75%
          </span>
          <p className="text-[9px] text-slate-500 mt-1 line-clamp-2">
            {isUrdu ? "فری لانسنگ میں 150k تک کمانے کا موقع ضائع نہ کریں۔" : "Upside up to 150k is worth the hustle."}
          </p>
        </div>
      </div>

      {/* Rebuttal Connector Bar */}
      <div className="w-full max-w-md p-2 rounded-xl bg-gradient-to-r from-emerald-500/10 via-purple-500/10 to-rose-500/10 border border-purple-500/20 shadow-xs flex items-center justify-between text-[10px]">
        <span className="font-semibold text-emerald-700 dark:text-emerald-300 truncate">
          {isUrdu ? "آمدنی کی پائیداری" : "Income Stability"}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300 font-bold text-[9px]">
          ⇄ {isUrdu ? "بحث و نظرثانی (Rebuttal)" : "Rebuttal Debate"}
        </span>
        <span className="font-semibold text-rose-700 dark:text-rose-300 truncate">
          {isUrdu ? "طویل مدتی مواقع" : "Long-term Upside"}
        </span>
      </div>
    </div>
  );
}

// ── Slide 8: Vote Pills & Soch ka Khulasa ───────────────────────────────────
export function VisualVotes({ language }: VisualProps) {
  const isUrdu = language === "ur";
  return (
    <div className="w-full py-2 px-1 flex flex-col items-center justify-center gap-3 select-none">
      {/* Vote Pills Row */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30">
          ✓ {isUrdu ? "ہاں" : "Haan"} · 82%
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/30">
          ✗ {isUrdu ? "نہیں" : "Nahi"} · 74%
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30">
          ⏸ {isUrdu ? "مزید سوچ درکار ہے" : "Mazeed Soch"} · 63%
        </span>
      </div>

      {/* Soch ka Khulasa (Reasoning Summary) Box */}
      <div className="w-full max-w-md p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-white/10 shadow-sm text-start space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
          <span>🧠</span>
          <span>{isUrdu ? "سوچ کا خلاصہ" : "Soch ka Khulasa"}</span>
          <span className="text-[10px] text-slate-400 font-normal">
            ({isUrdu ? "عوامی دلائل" : "Public Reasoning Summary"})
          </span>
        </div>
        <ul className="space-y-1 text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed list-disc list-inside">
          <li>
            {isUrdu
              ? "90k کی مقررہ تنخواہ گھر کے بنیادی اخراجات کو محفوظ بناتی ہے۔"
              : "90k ki fixed salary ghar ke kharche ko predictable banati hai."}
          </li>
          <li>
            {isUrdu
              ? "فری لانسنگ میں زیادہ کمائی کا امکان ہے مگر آمدنی غیر یقینی ہے۔"
              : "Freelancing earning potential zyada hai magar income unstable hai."}
          </li>
          <li>
            {isUrdu
              ? "بنیادی خطرہ دونوں کام بیک وقت کرنے پر تھکن اور برن آؤٹ ہے۔"
              : "Main concern dono ko full intensity par karne se burnout hai."}
          </li>
          <li>
            {isUrdu
              ? "اس لیے ہائبرڈ ماڈل (ملازمت + پارٹ ٹائم پروجیکٹس) محفوظ ترین طریقہ ہے۔"
              : "Isliye hybrid approach short term mein safer lagti hai."}
          </li>
        </ul>
      </div>
    </div>
  );
}

// ── Slide 9: Mashwara Canvas with interactive tabs [Mahireen] [Report] ───────
export function VisualReport({ language }: VisualProps) {
  const isUrdu = language === "ur";
  const [activeTab, setActiveTab] = useState<"experts" | "report">("report");

  return (
    <div className="w-full py-2 px-1 flex flex-col items-center justify-center gap-2.5 select-none">
      {/* Tab bar miniature */}
      <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab("experts")}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "experts"
              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
          }`}
          aria-label="View experts analyses tab"
        >
          {isUrdu ? "ماہرین کی رائے" : "Mahireen ki Raaye"}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("report")}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "report"
              ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/30"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
          }`}
          aria-label="View Mashwara report tab"
        >
          {isUrdu ? "مشورہ رپورٹ" : "Mashwara Report"}
        </button>
      </div>

      {/* Content Container */}
      <div className="w-full max-w-md p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-white/10 shadow-md text-start space-y-2">
        {activeTab === "report" ? (
          <>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {isUrdu ? "حتمی مشورہ: ہائبرڈ ماڈل اپنائیں" : "Final Mashwara: Adopt Hybrid Transition"}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                80% Confidence
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-white/5">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {isUrdu ? "اتفاقِ رائے" : "Agreement"}
                </span>
                <p className="text-slate-500 text-[9px]">
                  {isUrdu ? "90k تنخواہ سے بنیادی ضروریات مستحکم ہوں گی" : "Fixed salary anchors baseline living expenses"}
                </p>
              </div>
              <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-white/5">
                <span className="font-bold text-rose-600 dark:text-rose-400">
                  {isUrdu ? "اہم خطرہ" : "Key Risk"}
                </span>
                <p className="text-slate-500 text-[9px]">
                  {isUrdu ? "ہفتے میں 60 گھنٹے کام سے برن آؤٹ" : "Burnout from working 60+ hours per week"}
                </p>
              </div>
            </div>
            <div className="pt-1 text-[9px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
              <span>→</span>
              <span>{isUrdu ? "اگلے اقدامات: 30 دن کا ٹیسٹ رن" : "Recommended: 30-day trial run with 1 client"}</span>
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[10px] text-slate-500">
              {isUrdu ? "6 ماہرین کے مکمل تفصیلی تجزیے انفرادی طور پر پڑھیں:" : "Read all 6 expert analyses individually:"}
            </p>
            <div className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 dark:bg-white/5">
              <span className="text-xs">🧭</span>
              <span className="text-[10px] font-semibold text-slate-800 dark:text-white">
                {isUrdu ? "کیریئر مشیر" : "Career Musheer"}
              </span>
              <span className="ml-auto text-[9px] text-emerald-600 font-bold">✓ Haan</span>
            </div>
            <div className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 dark:bg-white/5">
              <span className="text-xs">💰</span>
              <span className="text-[10px] font-semibold text-slate-800 dark:text-white">
                {isUrdu ? "مالی مشیر" : "Financial Musheer"}
              </span>
              <span className="ml-auto text-[9px] text-emerald-600 font-bold">✓ Haan</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Slide 10: VisualVoiceNote (NEW: WhatsApp Voice Note Gesture & STT) ────────
export function VisualVoiceNote({ language }: VisualProps) {
  const isUrdu = language === "ur";
  const [stage, setStage] = useState<"idle" | "recording" | "locked" | "paused" | "transcribed">("locked");

  return (
    <div className="w-full py-1.5 px-1 flex flex-col items-center justify-center gap-2 select-none">
      {/* Stage Interactive Selector Chips */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/10 text-[9px]">
        <span className="text-[9px] font-bold text-slate-400 px-1">
          {isUrdu ? "ڈیمو موڈ:" : "Demo Stage:"}
        </span>
        <button
          type="button"
          onClick={() => setStage("recording")}
          aria-label="Demo recording gesture"
          className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
            stage === "recording"
              ? "bg-red-500 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          ● {isUrdu ? "ریکارڈنگ" : "Hold"}
        </button>
        <button
          type="button"
          onClick={() => setStage("locked")}
          aria-label="Demo locked hands-free recording"
          className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
            stage === "locked"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          🔒 {isUrdu ? "ہینڈز فری لاک" : "Locked"}
        </button>
        <button
          type="button"
          onClick={() => setStage("transcribed")}
          aria-label="Demo transcribed editable text"
          className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
            stage === "transcribed"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          ✓ {isUrdu ? "ٹرانسکرپٹ" : "Transcript"}
        </button>
      </div>

      {/* Stage Visual Display */}
      {stage === "recording" && (
        <div className="w-full max-w-md p-3 rounded-2xl bg-slate-900 text-white shadow-xl flex flex-col items-center gap-2 animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span className="font-mono text-xs font-semibold">00:04</span>
            {/* Waveform representation */}
            <div className="flex items-center gap-1 h-4 w-14" aria-hidden="true">
              <span className="w-1 bg-red-500 h-2 rounded-full animate-pulse" />
              <span className="w-1 bg-red-500 h-4 rounded-full animate-pulse" />
              <span className="w-1 bg-red-500 h-3 rounded-full animate-pulse" />
              <span className="w-1 bg-red-500 h-4 rounded-full animate-pulse" />
              <span className="w-1 bg-red-500 h-2 rounded-full animate-pulse" />
            </div>
          </div>

          <div className="flex items-center gap-3 text-[10px] text-slate-300 pt-1 border-t border-white/10">
            <span className="flex items-center gap-1 text-slate-300">
              <span>←</span>
              <span>{isUrdu ? "بائیں سلائیڈ کر کے منسوخ" : "Slide left to cancel"}</span>
            </span>
            <span className="opacity-40">|</span>
            <span className="flex items-center gap-1 text-blue-300 font-bold">
              <span>↑</span>
              <span>{isUrdu ? "اوپر سلائیڈ کر کے لاک" : "Slide up to lock"}</span>
            </span>
          </div>
        </div>
      )}

      {(stage === "locked" || stage === "paused") && (
        <div className="w-full max-w-md p-2.5 rounded-2xl bg-white dark:bg-slate-800/95 border border-slate-200 dark:border-white/10 shadow-lg flex items-center justify-between gap-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${stage === "paused" ? "bg-amber-400" : "bg-red-500 animate-ping"}`} />
            <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">01:42</span>
            {/* Waveform bars */}
            <div className="flex items-center gap-0.5 h-4 w-12" aria-hidden="true">
              <span className="w-1 bg-red-400 h-2 rounded-full" />
              <span className="w-1 bg-red-400 h-3.5 rounded-full" />
              <span className="w-1 bg-red-400 h-2 rounded-full" />
              <span className="w-1 bg-red-400 h-3 rounded-full" />
              <span className="w-1 bg-red-400 h-1.5 rounded-full" />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStage("idle")}
              aria-label="Delete recording demo"
              className="w-7 h-7 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center transition-colors text-xs"
            >
              🗑️
            </button>
            <button
              type="button"
              onClick={() => setStage(stage === "paused" ? "locked" : "paused")}
              aria-label="Pause or resume recording demo"
              className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center text-xs font-bold"
            >
              {stage === "paused" ? "▶" : "⏸"}
            </button>
            <button
              type="button"
              onClick={() => setStage("transcribed")}
              aria-label="Finish and transcribe demo"
              className="px-2.5 py-1 rounded-xl bg-blue-600 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs hover:bg-blue-500"
            >
              <span>✓</span>
              <span>{isUrdu ? "مکمل کریں" : "Finish"}</span>
            </button>
          </div>
        </div>
      )}

      {(stage === "transcribed" || stage === "idle") && (
        <div className="w-full max-w-md p-3 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-white/10 shadow-md space-y-2 text-start animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <span>✓</span>
              <span>{isUrdu ? "ٹرانسکرپٹ تیار ہے (ایڈٹ کر سکتے ہیں)" : "Transcript ready to edit in composer"}</span>
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">
              Urdu / Roman / EN
            </span>
          </div>

          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-white/5 text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-normal">
            "90k ki job offer hai lekin freelancing income kabhi 40k aur kabhi 150k hoti hai. Ghar ka kharcha bhi chalana hai aur aage masters ka bhi sochna hai..."
          </div>

          <div className="flex items-center justify-between text-[9px] text-slate-400 pt-1 border-t border-slate-100 dark:border-white/5">
            <span>🔒 {isUrdu ? "صوتی نوٹ محفوظ طریقے سے پروسیس ہوتا ہے" : "Audio safely transcribed before sending"}</span>
            <span className="text-blue-600 dark:text-blue-400 font-bold">{isUrdu ? "کچھ بھی خودکار نہیں بھیجا جاتا" : "Never auto-sends"}</span>
          </div>
        </div>
      )}

      {/* Critical Core Guarantee */}
      <div className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20 text-[9.5px] text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1">
        <span>🛡️</span>
        <span>{isUrdu ? "جب تک آپ 'Send' نہ دبائیں، کچھ بھی آگے نہیں جاتا" : "Nothing is sent until YOU press Send"}</span>
      </div>
    </div>
  );
}

// ── Slide 11: VisualSummaryAudio (NEW: Faithful SummaryAudioPlayer Preview) ───
export function VisualSummaryAudio({ language }: VisualProps) {
  const isUrdu = language === "ur";
  const [selectedLang, setSelectedLang] = useState<"en" | "ur" | "roman">("roman");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<"1x" | "1.25x" | "1.5x">("1x");

  const sampleSummaries = {
    en: {
      tag: "Speaking English",
      text: "The council's synthesized recommendation is to maintain the primary role for income stability while dedicating 10 weekly hours to high-yield client projects.",
    },
    ur: {
      tag: "پاکستانی اردو میں",
      text: "کونسل کا حتمی متفقہ مشورہ یہ ہے کہ فکسڈ 90k جاب قبول کر کے بنیادی اخراجات کو محفوظ کریں اور فری لانسنگ کے لیے مخصوص اوقات طے کریں۔",
    },
    roman: {
      tag: "Roman Urdu pronunciation",
      text: "Council ka overall mashwara yeh hai ke filhal job continue karein taake ghar ka kharcha anchor ho jaye aur selected freelancing sath chalaein.",
    },
  };

  const cycleSpeed = () => {
    setPlaybackSpeed((prev) => (prev === "1x" ? "1.25x" : prev === "1.25x" ? "1.5x" : "1x"));
  };

  return (
    <div className="w-full py-1.5 px-1 flex flex-col items-center justify-center gap-2 select-none">
      {/* Language Selection Chips */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/10 text-[9.5px]">
        <span className="text-[9px] font-bold text-slate-400 px-1">
          {isUrdu ? "زبان:" : "Voice Language:"}
        </span>
        <button
          type="button"
          onClick={() => setSelectedLang("en")}
          aria-label="Listen in English"
          className={`px-2 py-0.5 rounded-lg font-semibold transition-all ${
            selectedLang === "en"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          English
        </button>
        <button
          type="button"
          onClick={() => setSelectedLang("ur")}
          aria-label="Listen in Urdu"
          className={`px-2 py-0.5 rounded-lg font-semibold transition-all ${
            selectedLang === "ur"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          اردو
        </button>
        <button
          type="button"
          onClick={() => setSelectedLang("roman")}
          aria-label="Listen in Roman Urdu"
          className={`px-2 py-0.5 rounded-lg font-semibold transition-all ${
            selectedLang === "roman"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          Roman Urdu
        </button>
      </div>

      {/* Miniature Summary Card */}
      <div className="w-full max-w-md p-3 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-white/10 shadow-md text-start space-y-2">
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-white/5">
          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <span>📋</span>
            <span>{isUrdu ? "ایگزیکٹو خلاصہ" : "Executive Summary"}</span>
          </span>
          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300">
            {sampleSummaries[selectedLang].tag}
          </span>
        </div>

        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-normal">
          {sampleSummaries[selectedLang].text}
        </p>

        {/* Live Miniature Audio Player (mirrors SummaryAudioPlayer.tsx) */}
        {!isPlaying ? (
          <button
            type="button"
            onClick={() => setIsPlaying(true)}
            aria-label="Start audio narration preview"
            className="w-full mt-2 inline-flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 hover:from-blue-100 hover:to-indigo-100 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-500/20 shadow-xs transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                <span className="text-[8px] ml-0.5">▶</span>
              </div>
              <span className="text-[11px] font-bold">
                {isUrdu ? "باآواز سنیں" : "Listen to Summary"}
              </span>
            </div>
            <span className="text-[8.5px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-600/10 text-blue-600 dark:text-blue-400">
              Executive Voice · Charon
            </span>
          </button>
        ) : (
          <div className="w-full mt-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 shadow-xs flex items-center gap-2.5 animate-fade-in">
            <button
              type="button"
              onClick={() => setIsPlaying(false)}
              aria-label="Pause audio demo"
              className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 text-xs shadow-xs hover:bg-blue-500 cursor-pointer"
            >
              ⏸
            </button>

            <div className="flex-1 flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-[9px] text-slate-500">
                <span className="font-mono">0:18</span>
                <span className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Charon
                </span>
                <span className="font-mono">1:24</span>
              </div>
              {/* Audio progress bar */}
              <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="w-[30%] h-full bg-blue-600 rounded-full" />
              </div>
            </div>

            <button
              type="button"
              onClick={cycleSpeed}
              aria-label="Cycle speed demo"
              className="px-1.5 py-1 rounded bg-slate-200/80 dark:bg-slate-800 text-[9px] font-bold text-slate-700 dark:text-slate-300"
            >
              {playbackSpeed}
            </button>
          </div>
        )}
      </div>

      {/* Guarantee callouts */}
      <div className="flex items-center gap-2 flex-wrap justify-center text-[9px] font-semibold text-slate-500">
        <span>🔒 {isUrdu ? "صرف آپ کے لیے نجی — پبلک لنک پر ظاہر نہیں ہوتا" : "Private to your session — not on public link"}</span>
        <span>•</span>
        <span>{isUrdu ? "وہی خلاصہ۔ وہی زبان۔ باآواز۔" : "Same summary. Same language. Spoken aloud."}</span>
      </div>
    </div>
  );
}

// ── Slide 12: Save, Share, Download PDF, Multilingual ────────────────────────
export function VisualShare({ language }: VisualProps) {
  const isUrdu = language === "ur";
  return (
    <div className="w-full py-2 px-1 flex flex-col items-center justify-center gap-2.5 select-none">
      {/* URL Cards */}
      <div className="w-full max-w-md space-y-1.5">
        <div className="p-2 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-white/10 shadow-xs flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs">🔒</span>
            <span className="text-slate-500">{isUrdu ? "پرائیویٹ چیٹ:" : "Private Chat:"}</span>
            <code className="text-blue-600 dark:text-blue-400 font-mono text-[9px] truncate">
              /c/session-8f3a
            </code>
          </div>
          <div className="flex items-center gap-1">
            <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[8.5px] font-bold flex items-center gap-0.5">
              <span>🔊</span>
              <span>Audio (Private)</span>
            </span>
            <span className="text-[9px] text-slate-400">
              {isUrdu ? "صرف آپ کا" : "User only"}
            </span>
          </div>
        </div>

        <div className="p-2 rounded-xl bg-white dark:bg-slate-800/90 border border-emerald-500/30 shadow-xs flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs">🌐</span>
            <span className="text-slate-500">{isUrdu ? "پبلک شیئر:" : "Public Share:"}</span>
            <code className="text-emerald-600 dark:text-emerald-400 font-mono text-[9px] truncate">
              /m/f7c19b2a
            </code>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 text-[9px] font-bold">
            Read-Only
          </span>
        </div>
      </div>

      {/* Action buttons miniature */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <button
          type="button"
          aria-label="Copy public link demo"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold shadow-sm hover:bg-blue-500 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>{isUrdu ? "Link کاپی کریں" : "Copy Link"}</span>
        </button>

        <button
          type="button"
          aria-label="Download PDF demo"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold shadow-sm hover:bg-slate-800 dark:hover:bg-slate-100 transition-all"
        >
          <svg className="w-3.5 h-3.5 text-red-400 dark:text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Download PDF</span>
        </button>
      </div>

      {/* Multilingual language switcher preview */}
      <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-500">
        <span>🌐</span>
        <span className="font-urdu">اردو</span>
        <span>•</span>
        <span>Roman Urdu</span>
        <span>•</span>
        <span>English</span>
      </div>
    </div>
  );
}

// ── Map Slide ID to Component (Clean ID-based Architecture) ───────────────────
export const SLIDE_VISUALS_BY_ID: Record<string, React.ComponentType<VisualProps>> = {
  welcome: VisualMashwaraIntro,
  chat_vs_council: VisualChatVsCouncil,
  prompt_context: VisualPromptContext,
  auto_routing: VisualAutoRouting,
  document_evidence: VisualDocumentEvidence,
  web_research: VisualWebResearch,
  expert_council: VisualExpertCouncil,
  disagreement: VisualDisagreement,
  votes: VisualVotes,
  report: VisualReport,
  voice_note: VisualVoiceNote,
  summary_audio: VisualSummaryAudio,
  share: VisualShare,
};

// Map Slide Index to Component (Backward-compatible fallback)
export const SLIDE_VISUALS: Record<number, React.ComponentType<VisualProps>> = {
  0: VisualMashwaraIntro,
  1: VisualChatVsCouncil,
  2: VisualPromptContext,
  3: VisualAutoRouting,
  4: VisualDocumentEvidence,
  5: VisualWebResearch,
  6: VisualExpertCouncil,
  7: VisualDisagreement,
  8: VisualVotes,
  9: VisualReport,
  10: VisualVoiceNote,
  11: VisualSummaryAudio,
  12: VisualShare,
};
