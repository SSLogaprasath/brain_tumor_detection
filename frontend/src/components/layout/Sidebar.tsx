"use client";

import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Building2,
  FlaskConical,
  Stethoscope,
  Upload,
  History,
  ClipboardCheck,
  ScanLine,
  FileText,
  UserCircle,
  LogOut,
  X,
} from "lucide-react";

const NAV_ITEMS: Record<
  string,
  { label: string; href: string; icon: React.ReactNode }[]
> = {
  admin: [
    { label: "Dashboard", href: "/admin", icon: <LayoutDashboard size={20} /> },
    { label: "Users", href: "/admin/users", icon: <Users size={20} /> },
    {
      label: "Hospitals",
      href: "/admin/hospitals",
      icon: <Building2 size={20} />,
    },
    { label: "Labs", href: "/admin/labs", icon: <FlaskConical size={20} /> },
  ],
  doctor: [
    {
      label: "Dashboard",
      href: "/doctor",
      icon: <LayoutDashboard size={20} />,
    },
    {
      label: "Patients",
      href: "/doctor/patients",
      icon: <Stethoscope size={20} />,
    },
  ],
  radiologist: [
    {
      label: "Pending Reviews",
      href: "/radiologist",
      icon: <ClipboardCheck size={20} />,
    },
    {
      label: "Review History",
      href: "/radiologist/history",
      icon: <History size={20} />,
    },
  ],
  lab_staff: [
    {
      label: "Dashboard",
      href: "/lab-staff",
      icon: <LayoutDashboard size={20} />,
    },
    {
      label: "Upload MRI",
      href: "/lab-staff/upload",
      icon: <Upload size={20} />,
    },
    {
      label: "Upload History",
      href: "/lab-staff/history",
      icon: <History size={20} />,
    },
  ],
  patient: [
    {
      label: "Dashboard",
      href: "/patient",
      icon: <LayoutDashboard size={20} />,
    },
    { label: "My Scans", href: "/patient/scans", icon: <ScanLine size={20} /> },
    {
      label: "Profile",
      href: "/patient/profile",
      icon: <UserCircle size={20} />,
    },
  ],
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const items = NAV_ITEMS[user.role] || [];

  const logo = (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
        <FileText size={20} className="text-white" />
      </div>
      <div>
        <h1 className="font-bold text-gray-900 text-sm">Brain Tumor</h1>
        <p className="text-xs text-gray-500">Detection System</p>
      </div>
    </div>
  );

  const navItems = (
    <nav className="flex-1 p-4 space-y-1">
      {items.map((item) => {
        const isActive =
          item.href ===
          `/${user.role === "lab_staff" ? "lab-staff" : user.role}`
            ? pathname === item.href
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition",
              isActive
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="p-4 border-t border-gray-200">
      <div className="px-3 py-2 mb-2">
        <p className="text-sm font-medium text-gray-900 truncate">
          {user.email}
        </p>
        <p className="text-xs text-gray-500 capitalize">
          {user.role.replace("_", " ")}
        </p>
      </div>
      <button
        onClick={() => {
          logout();
          window.location.href = "/login";
        }}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-700 transition w-full"
      >
        <LogOut size={20} />
        Sign Out
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-gray-200 min-h-screen flex-col shrink-0">
        <div className="p-6 border-b border-gray-200">{logo}</div>
        {navItems}
        {footer}
      </aside>

      {/* Mobile backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 lg:hidden",
          isOpen
            ? "opacity-100"
            : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-300 ease-in-out lg:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          {logo}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X size={20} />
          </button>
        </div>
        {navItems}
        {footer}
      </aside>
    </>
  );
}
