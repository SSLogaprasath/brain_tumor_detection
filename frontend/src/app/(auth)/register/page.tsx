"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerUser, getLabsForRegistration } from "@/lib/auth";
import { REGISTER_ROLES } from "@/lib/constants";
import { registerSchema, type RegisterForm } from "@/lib/schemas";
import type { Lab } from "@/lib/types";
import TextInput from "@/components/ui/TextInput";
import SelectInput from "@/components/ui/SelectInput";

export default function RegisterPage() {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [error, setError] = useState("");
  const router = useRouter();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema) as Resolver<RegisterForm>,
    defaultValues: {
      userName: "",
      email: "",
      password: "",
      confirmPassword: "",
      roleId: 5,
      labName: "",
      labId: undefined,
    },
  });

  const roleId = watch("roleId");

  // Fetch labs when radiologist role is selected
  useEffect(() => {
    if (Number(roleId) === 3) {
      getLabsForRegistration()
        .then(setLabs)
        .catch(() => setLabs([]));
    }
  }, [roleId]);

  const onSubmit = async (values: RegisterForm) => {
    setError("");
    try {
      await registerUser({
        userName: values.userName,
        email: values.email,
        password: values.password,
        roleId: Number(values.roleId),
        ...(Number(values.roleId) === 4
          ? { labName: values.labName?.trim() }
          : {}),
        ...(Number(values.roleId) === 3 ? { labId: Number(values.labId) } : {}),
      });
      router.push("/login");
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: { error?: string } };
      };
      if (axiosErr.response?.status === 409) {
        setError(axiosErr.response.data?.error || "Email already registered");
      } else {
        setError("Registration failed. Please try again.");
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
        <p className="text-gray-500 mt-1">
          Join the Brain Tumor Detection platform
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <TextInput
          label="Full Name"
          id="userName"
          type="text"
          maxLength={100}
          placeholder="John Doe"
          error={errors.userName?.message}
          {...register("userName")}
        />

        <TextInput
          label="Email"
          id="email"
          type="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register("email")}
        />

        <SelectInput
          label="Role"
          id="role"
          options={REGISTER_ROLES.map((r) => ({ value: r.id, label: r.label }))}
          error={errors.roleId?.message}
          {...register("roleId")}
        />

        {Number(roleId) === 4 && (
          <TextInput
            label="Lab Name"
            id="labName"
            type="text"
            maxLength={100}
            placeholder="e.g. City Imaging Center"
            error={errors.labName?.message}
            {...register("labName")}
          />
        )}

        {Number(roleId) === 3 && (
          <div>
            <SelectInput
              label="Select Lab"
              id="labId"
              options={[
                { value: "", label: "-- Select a lab --" },
                ...labs.map((lab) => ({
                  value: lab.labId,
                  label: lab.labName,
                })),
              ]}
              error={errors.labId?.message}
              {...register("labId")}
            />
            {labs.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">
                No labs registered yet. A Lab Staff account must be created
                first.
              </p>
            )}
          </div>
        )}

        <TextInput
          label="Password"
          id="password"
          type="password"
          placeholder="Min. 8 characters"
          error={errors.password?.message}
          {...register("password")}
        />

        <TextInput
          label="Confirm Password"
          id="confirmPassword"
          type="password"
          placeholder="Repeat your password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          Sign In
        </Link>
      </p>
    </div>
  );
}
