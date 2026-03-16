"use client";
import { Eye, EyeOff, Share2, Trash2, Clock } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";
import type { Secret } from "@open-vault/shared/types";

interface Props {
  secrets: Secret[];
  onSelect?: (s: Secret) => void;
  selected?: string;
}

export function SecretsList({ secrets, onSelect, selected }: Props) {
  if (secrets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500 text-sm">
        <span>No secrets yet.</span>
        <span className="mt-1 text-xs">Use the CLI: <code className="font-mono">os secret set MY_SECRET</code></span>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-zinc-800">
      {secrets.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect?.(s)}
          className={cn(
            "flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-900 transition-colors",
            selected === s.id && "bg-zinc-900"
          )}
        >
          <div className="flex flex-col min-w-0">
            <span className="font-mono text-sm text-white truncate">{s.name}</span>
            <span className="text-xs text-zinc-500 mt-0.5">{s.type} · {new Date(s.createdAt).toLocaleDateString()}</span>
          </div>
          <span className={cn(
            "text-xs px-2 py-0.5 rounded-full font-medium",
            s.status === "ACTIVE" ? "bg-emerald-900/40 text-emerald-400" : "bg-zinc-800 text-zinc-400"
          )}>
            {s.status}
          </span>
        </button>
      ))}
    </div>
  );
}
