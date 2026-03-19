"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export default function DoctorPatientsPage() {
  const [patientId, setPatientId] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (patientId.trim()) {
      router.push(`/doctor/patients/${patientId.trim()}`);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Patient Lookup</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg">
        <p className="text-sm text-gray-600 mb-4">
          Enter a patient ID to view their MRI scans and AI prediction results.
        </p>
        <form onSubmit={handleSearch} className="flex gap-3">
          <input
            type="number"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            placeholder="Patient ID"
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-gray-900"
          />
          <button
            type="submit"
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition flex items-center gap-2"
          >
            <Search size={18} />
            Search
          </button>
        </form>
      </div>
    </div>
  );
}
