import { useState } from "react";

interface VisualProps {
  language: string;
  isRTL: boolean;
}

// ── Slide 1: Welcome / Dilemma enters -> 6 Experts -> 1 Report ───────────────
export function VisualMashwaraIntro({ language }: VisualProps) {
  const isUrdu = language === "ur";
  return (
    <div className="w-full py-2 px-1 flex flex-col items-center justify-center gap-3 select-none">
      {/* Dilemma pill */}
      <div className="w-full max-w-sm px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/50 shadow-sm flex items-center gap-2.5 animate-fade-in">
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

      {/* Downward flow connector */}
      <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-xs">
        <span className="w-8 h-px bg-slate-200 dark:bg-slate-700" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {isUrdu ? "6 ماہرین کا تجزیہ" : "6 Specialists"}
        </span>
        <span className="w-8 h-px bg-slate-200 dark:bg-slate-700" />
      </div>

      {/* 6 Mini Expert cards grid */}
      <div className="grid grid-cols-3 gap-2 w-full max-w-md">
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
            className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-white/10 shadow-xs"
          >
            <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${exp.color} text-[10px] text-white flex items-center justify-center flex-shrink-0`}>
              {exp.icon}
            </div>
            <span className="text-[10px] font-medium text-slate-800 dark:text-slate-200 truncate leading-tight">
              {exp.name}
            </span>
          </div>
        ))}
      </div>

      {/* Convergence arrow */}
      <div className="text-slate-400 dark:text-slate-500 text-xs -my-1">▼</div>

      {/* Final Synthesized Report miniature */}
      <div className="w-full max-w-sm px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-500/30 dark:border-emerald-500/20 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">📊</span>
          <div className="text-start">
            <p className="text-[11px] font-bold text-slate-900 dark:text-white">
              {isUrdu ? "جامع مشورہ رپورٹ" : "Actionable Mashwara Report"}
            </p>
            <p className="text-[9px] text-emerald-600 dark:text-emerald-400">
              {isUrdu ? "متوازن، عملی اور حتمی رہنمائی" : "Consensus, Risks & Next Steps"}
            </p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
          ✓ Ready
        </span>
      </div>
    </div>
  );
}

// ── Slide 2: Miniature of REAL Composer (Chat vs Council Toggle) ─────────────
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

// ── Slide 3: Prompt Context Highlighting (Numbers, constraints, family) ───────
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
            👨‍👩‍👦 {isUrdu ? "گھریلو ذمہ داریاں" : "Family Constraints"}
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

// ── Slide 4: Council changes with decision ───────────────────────────────────
export function VisualExpertCouncil({ language }: VisualProps) {
  const isUrdu = language === "ur";
  const experts = [
    { icon: "🧭", title: isUrdu ? "کیریئر مشیر" : "Career Musheer", role: isUrdu ? "مستقبل اور مارکیٹ ڈیمانڈ" : "Strategy & Employability", color: "from-blue-500 to-indigo-600" },
    { icon: "💰", title: isUrdu ? "مالی مشیر" : "Financial Musheer", role: isUrdu ? "کیش فلو اور بچت" : "Cash Flow & Stability", color: "from-emerald-500 to-teal-600" },
    { icon: "🛠️", title: isUrdu ? "عملی مشیر" : "Practical Musheer", role: isUrdu ? "وقت اور حقیقت پسندی" : "Time & Workload", color: "from-amber-500 to-orange-600" },
    { icon: "👨‍👩‍👦", title: isUrdu ? "خاندانی اور سماجی مشیر" : "Family & Practical Musheer", role: isUrdu ? "گھریلو توازن" : "Household Predictability", color: "from-rose-500 to-pink-600" },
    { icon: "⚠️", title: isUrdu ? "رسک ایکسپرٹ" : "Risk Expert", role: isUrdu ? "نقصان سے حفاظت" : "Downside Protection", color: "from-purple-500 to-violet-600" },
    { icon: "⚡", title: isUrdu ? "مخالف رائے" : "Mukhalif Raaye", role: isUrdu ? "تنقیدی جانچ" : "Devil's Advocate", color: "from-red-500 to-rose-700" },
  ];

  return (
    <div className="w-full py-2 px-1 flex flex-col items-center justify-center gap-2.5 select-none">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full max-w-lg">
        {experts.map((exp, idx) => (
          <div
            key={idx}
            className="p-2 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-white/10 shadow-xs flex items-center gap-2"
          >
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${exp.color} text-xs text-white flex items-center justify-center flex-shrink-0 shadow-xs`}>
              {exp.icon}
            </div>
            <div className="min-w-0 text-start flex-1">
              <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
                {exp.title}
              </p>
              <p className="text-[9px] text-slate-500 truncate leading-tight">
                {exp.role}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-[10px] text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span>{isUrdu ? "کونسل آپ کے فیصلے کے مطابق خود ڈھلتی ہے" : "Council changes with your decision"}</span>
      </div>
    </div>
  );
}

// ── Slide 5: Meaningful Disagreement & Rebuttal Arrow ────────────────────────
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

// ── Slide 6: Vote Pills & Soch ka Khulasa ───────────────────────────────────
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

// ── Slide 7: Mashwara Canvas with interactive tabs [Mahireen] [Report] ───────
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

// ── Slide 8: Save, Share, Download PDF, Multilingual ─────────────────────────
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
          <span className="text-[9px] text-slate-400">
            {isUrdu ? "صرف آپ کے لیے" : "User only"}
          </span>
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold shadow-sm hover:bg-blue-500 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>{isUrdu ? "Link کاپی کریں" : "Copy Link"}</span>
        </button>

        <button
          type="button"
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

// Map slide ID / index to component
export const SLIDE_VISUALS: Record<number, React.ComponentType<VisualProps>> = {
  0: VisualMashwaraIntro,
  1: VisualChatVsCouncil,
  2: VisualPromptContext,
  3: VisualExpertCouncil,
  4: VisualDisagreement,
  5: VisualVotes,
  6: VisualReport,
  7: VisualShare,
};
