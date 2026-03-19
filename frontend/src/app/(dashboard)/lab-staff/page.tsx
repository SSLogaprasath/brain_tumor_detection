"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Upload, History } from "lucide-react";
import { getMyLabProfile, getMrisByLab } from "@/lib/auth";

export default function LabStaffDashboard() {
  const [uploadCount, setUploadCount] = useState<number | null>(null);

  useEffect(() => {
    getMyLabProfile()
      .then((lab) => getMrisByLab(lab.labId))
      .then((mris) => setUploadCount(mris.length))
      .catch(() => {});
  }, []);

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Lab Staff Dashboard
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/lab-staff/upload"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="bg-blue-500 text-white p-3 rounded-xl group-hover:scale-105 transition-transform">
              <Upload size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Upload MRI</h3>
              <p className="text-sm text-gray-500">
                Upload a new MRI scan for AI analysis
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/lab-staff/history"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-purple-200 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="bg-purple-500 text-white p-3 rounded-xl group-hover:scale-105 transition-transform">
              <History size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Upload History</h3>
              {uploadCount !== null ? (
                <p className="text-sm text-gray-500">
                  {uploadCount} {uploadCount === 1 ? "scan" : "scans"} uploaded
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  View previously uploaded MRI scans
                </p>
              )}
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
