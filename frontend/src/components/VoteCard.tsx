/**
 * VoteCard — Displays a single board member's vote and confidence.
 * Features animated confidence bar and color-coded vote badge.
 */

import { useEffect, useState } from "react";
import type { BoardVote } from "../types/meeting";
import type { RoleInfo } from "../api/client";

interface VoteCardProps {
  roleInfo: RoleInfo;
  vote: BoardVote;
  delay: number;
}

/** Vote badge color mapping */
const voteStyles = {
  YES: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  NO: "bg-red-500/15 text-red-400 border-red-500/30",
  DEFER: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

export default function VoteCard({ roleInfo, vote, delay }: VoteCardProps) {
  const [barWidth, setBarWidth] = useState(0);

  // Animate the confidence bar on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setBarWidth(vote.confidence);
    }, delay * 1000 + 300);
    return () => clearTimeout(timer);
  }, [vote.confidence, delay]);

  const voteText = vote.vote || "DEFER";
  const badgeStyle = voteStyles[voteText as keyof typeof voteStyles] || voteStyles.DEFER;

  return (
    <div
      className="glass-elevated rounded-2xl p-5 animate-slide-up opacity-0 hover:border-white/10 transition-colors"
      style={{ animationDelay: `${delay}s`, animationFillMode: "forwards" }}
    >
      {/* Header: icon + name + vote badge */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg bg-gradient-to-br ${roleInfo.color} flex items-center justify-center text-xl`}
          >
            {roleInfo.icon}
          </div>
          <div>
            <p className="font-semibold text-white text-sm">{roleInfo.key}</p>
            <p className="text-xs text-slate-500">{roleInfo.title}</p>
          </div>
        </div>

        {/* Vote badge */}
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold border ${badgeStyle}`}
        >
          {voteText}
        </span>
      </div>

      {/* Confidence bar */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-slate-400">Confidence</span>
          <span className="text-xs font-semibold text-slate-300">{vote.confidence}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-out ${
              vote.confidence >= 70
                ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                : vote.confidence >= 40
                  ? "bg-gradient-to-r from-amber-500 to-amber-400"
                  : "bg-gradient-to-r from-red-500 to-red-400"
            }`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
    </div>
  );
}
