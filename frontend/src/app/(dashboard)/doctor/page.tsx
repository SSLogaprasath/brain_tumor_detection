"use client";

import Link from "next/link";
import { Stethoscope, Brain } from "lucide-react";

export default function DoctorDashboard() {
  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Doctor Dashboard
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/doctor/patients"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="bg-blue-500 text-white p-3 rounded-xl group-hover:scale-105 transition-transform">
              <Stethoscope size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Patient Lookup</h3>
              <p className="text-sm text-gray-500">
                Search and view patient MRI scans
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/doctor/patients"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-purple-200 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="bg-purple-500 text-white p-3 rounded-xl group-hover:scale-105 transition-transform">
              <Brain size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">AI Predictions</h3>
              <p className="text-sm text-gray-500">
                Review AI analysis and segmentation results
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
