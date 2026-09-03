/**
 * MeetingForm — Premium dynamic form with two-column layout for short fields.
 */

import { useState } from "react";
import type { TemplateMetadata, FieldDefinition } from "../types/meeting";

interface MeetingFormProps {
  metadata: TemplateMetadata;
  onSubmit: (fields: Record<string, string | number>) => void;
  isLoading: boolean;
}

const accentButton: Record<string, string> = {
  blue: "from-blue-600 to-blue-600 hover:from-blue-500 hover:to-blue-400 shadow-blue-500/20",
  emerald: "from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-emerald-500/20",
  amber: "from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 shadow-amber-500/20",
  sky: "from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 shadow-sky-500/20",
  rose: "from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 shadow-rose-500/20",
};

export default function MeetingForm({ metadata, onSubmit, isLoading }: MeetingFormProps) {
  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const btnClass = accentButton[metadata.accentColor] || accentButton.blue;

  const handleChange = (key: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    for (const field of metadata.fields) {
      if (field.required && !formData[field.key]) {
        newErrors[field.key] = `${field.label} is required`;
      }
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    onSubmit(formData);
  };

  // Split fields into full-width (textarea) and inline (text/number/select)
  const isFullWidth = (f: FieldDefinition) => f.type === "textarea";

  const renderField = (field: FieldDefinition) => {
    const hasError = !!errors[field.key];
    const errorBorder = hasError ? "!border-red-500/40 !ring-1 !ring-red-500/20" : "";

    return (
      <div key={field.key} className={isFullWidth(field) ? "col-span-full" : ""}>
        <label htmlFor={`field-${field.key}`} className="block text-[13px] font-medium text-slate-400 mb-2">
          {field.label}
          {field.required && <span className="text-red-400/80 ml-0.5">*</span>}
        </label>

        {field.type === "textarea" ? (
          <textarea
            id={`field-${field.key}`}
            placeholder={field.placeholder}
            rows={3}
            className={`resize-none ${errorBorder}`}
            value={(formData[field.key] as string) || ""}
            onChange={(e) => handleChange(field.key, e.target.value)}
          />
        ) : field.type === "select" ? (
          <select
            id={`field-${field.key}`}
            className={errorBorder}
            value={(formData[field.key] as string) || ""}
            onChange={(e) => handleChange(field.key, e.target.value)}
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt.charAt(0).toUpperCase() + opt.slice(1).replace(/-/g, " ")}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`field-${field.key}`}
            type={field.type}
            placeholder={field.placeholder}
            className={errorBorder}
            value={formData[field.key] ?? ""}
            onChange={(e) =>
              handleChange(field.key, field.type === "number" ? (e.target.value ? Number(e.target.value) : "") : e.target.value)
            }
          />
        )}

        {hasError && (
          <p className="mt-1.5 text-[11px] text-red-400/90 animate-fade-in flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {errors[field.key]}
          </p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Fields in a 2-column grid — textareas span full width */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5 mb-8">
        {metadata.fields.map(renderField)}
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent mb-6" />

      {/* Submit button */}
      <button
        type="submit"
        disabled={isLoading}
        id="start-meeting-button"
        className={`
          w-full py-4 px-6 rounded-xl font-semibold text-white text-base
          bg-gradient-to-r ${btnClass}
          transition-all duration-200 shadow-lg
          disabled:opacity-40 disabled:cursor-not-allowed
          flex items-center justify-center gap-3
          hover:shadow-xl active:scale-[0.99]
        `}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Assembling your board...
          </>
        ) : (
          <>
            Start Board Meeting
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </>
        )}
      </button>
    </form>
  );
}
