"use client";

import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS } from "@/lib/constants";
import { Menu } from "lucide-react";

interface NavbarProps {
  onMenuClick?: () => void;
}

export default function Navbar({ onMenuClick }: NavbarProps) {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900 transition"
        >
          <Menu size={24} />
        </button>
        <h2 className="text-lg font-semibold text-gray-900">
          {ROLE_LABELS[user.role] || user.role} Dashboard
        </h2>
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
          {user.role.replace("_", " ")}
        </span>
        <span className="text-sm text-gray-600 hidden sm:inline">
          {user.email}
        </span>
      </div>
    </header>
  );
}
