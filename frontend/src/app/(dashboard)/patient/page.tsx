"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScanLine, UserCircle } from "lucide-react";
import { getMyPatientProfile, getMrisByPatient } from "@/lib/auth";

export default function PatientDashboard() {
  const [scanCount, setScanCount] = useState<number | null>(null);

  useEffect(() => {
    getMyPatientProfile()
      .then((patient) => getMrisByPatient(patient.patientId))
      .then((mris) => setScanCount(mris.length))
      .catch(() => {});
  }, []);

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome</h1>
      <p className="text-gray-500 mb-6">
        View your MRI scan results and profile
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/patient/scans"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="bg-blue-500 text-white p-3 rounded-xl group-hover:scale-105 transition-transform">
              <ScanLine size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">My Scans</h3>
              {scanCount !== null ? (
                <p className="text-sm text-gray-500">
                  {scanCount} {scanCount === 1 ? "scan" : "scans"} available
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  View your MRI scans and AI results
                </p>
              )}
            </div>
          </div>
        </Link>

        <Link
          href="/patient/profile"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-green-200 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="bg-green-500 text-white p-3 rounded-xl group-hover:scale-105 transition-transform">
              <UserCircle size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">My Profile</h3>
              <p className="text-sm text-gray-500">
                View your profile information
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
