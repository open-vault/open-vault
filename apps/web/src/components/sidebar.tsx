"use client";
import { FolderKey, Users, Settings, Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../lib/utils";

const nav = [
  { href: "/dashboard", label: "Projects", icon: FolderKey },
  { href: "/dashboard/teams", label: "Teams", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-56 min-h-screen border-r border-zinc-800 bg-zinc-950 px-3 py-4 shrink-0">
      <div className="flex items-center gap-2 px-2 mb-8">
        <Lock className="w-5 h-5 text-emerald-500" />
        <span className="font-semibold text-sm tracking-tight">Open Secret</span>
      </div>

      <nav className="flex flex-col gap-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors",
              pathname === href
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
