"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ArrowRight, ArrowLeft, KeyRound, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { ChronoGraphIcon } from "@/components/ui/logo";

export default function LoginPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("chronograph_theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
  }, []);

  const isLight = theme === "light";

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setDevOtp(null);

    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to send verification code.");
      }

      setStep("otp");
      setSuccessMsg(data.message || `Code sent to ${trimmed}`);
      if (data.devOtp) {
        setDevOtp(data.devOtp);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const trimmedOtp = otp.trim();
    if (trimmedOtp.length !== 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp: trimmedOtp }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Invalid verification code.");
      }

      setSuccessMsg("Verification successful! Loading cluster...");
      setTimeout(() => {
        window.location.href = "/";
      }, 600);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen w-full flex flex-col items-center justify-center p-4 transition-colors duration-300 relative select-none ${
        isLight ? "bg-[#F3F6F2] text-[#141A15]" : "bg-[#0C100D] text-[#E8ECE4]"
      }`}
    >
      {/* Background glow orb */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none blur-3xl opacity-20"
        style={{
          background: "radial-gradient(circle, #7FBF6A 0%, rgba(127, 191, 106, 0) 70%)",
        }}
      />

      {/* Back button */}
      <button
        onClick={() => (window.location.href = "/")}
        type="button"
        className={`absolute top-6 left-6 flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
          isLight
            ? "border-[#D1D9D0] bg-[#FAFBF9] text-[#5E695E] hover:text-[#141A15]"
            : "border-[#243026] bg-[#141A15] text-[#8B968B] hover:text-[#E8ECE4]"
        }`}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to ChronoGraph</span>
      </button>

      {/* Main Auth Card */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className={`w-full max-w-md rounded-3xl p-6 sm:p-8 border shadow-2xl relative z-10 ${
          isLight
            ? "bg-[#FAFBF9] border-[#D1D9D0] shadow-[0_20px_50px_rgba(0,0,0,0.06)]"
            : "bg-[#141A15] border-[#243026] shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        }`}
      >
        {/* Brand header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex items-center gap-2 mb-2">
            <ChronoGraphIcon className="h-6 w-6 text-[#7FBF6A]" />
            <span className="text-xl font-bold tracking-tight">
              Chrono<span className="text-[#7FBF6A]">Graph</span>
            </span>
          </div>
          <p
            className={`text-xs font-medium ${
              isLight ? "text-[#5E695E]" : "text-[#8B968B]"
            }`}
          >
            Distributed Workflow Engine & Live Telemetry
          </p>
        </div>

        {/* Error / Alert */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 flex items-center gap-2 p-3 text-xs rounded-xl border border-[#E5735C]/30 bg-[#E5735C]/10 text-[#E5735C]"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 flex items-center gap-2 p-3 text-xs rounded-xl border border-[#7FBF6A]/30 bg-[#7FBF6A]/10 text-[#7FBF6A]"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dev Mode OTP Callout */}
        {devOtp && (
          <div
            onClick={() => setOtp(devOtp)}
            className="mb-4 p-2.5 rounded-xl border border-[#E5B86A]/40 bg-[#E5B86A]/10 text-[#E5B86A] text-xs font-mono cursor-pointer hover:border-[#E5B86A] transition-all flex items-center justify-between"
            title="Click to auto-fill code"
          >
            <span>Dev Mode: Code is <strong>{devOtp}</strong></span>
            <span className="text-[10px] underline">Auto-fill</span>
          </div>
        )}

        {/* Step 1: Email Form */}
        {step === "email" ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label
                htmlFor="email-input"
                className={`block text-xs font-semibold mb-1.5 ${
                  isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
                }`}
              >
                Account Email
              </label>
              <div className="relative">
                <Mail
                  className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 ${
                    isLight ? "text-[#8B968B]" : "text-[#5E695E]"
                  }`}
                />
                <input
                  id="email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="developer@company.com"
                  required
                  autoFocus
                  className={`w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border font-mono transition-all outline-none focus:ring-2 focus:ring-[#7FBF6A]/40 ${
                    isLight
                      ? "bg-[#FAFBF9] border-[#D1D9D0] text-[#141A15] placeholder:text-[#8B968B]"
                      : "bg-[#0C100D] border-[#243026] text-[#E8ECE4] placeholder:text-[#5E695E]"
                  }`}
                />
              </div>
              <p
                className={`text-[11px] mt-1.5 ${
                  isLight ? "text-[#8B968B]" : "text-[#5E695E]"
                }`}
              >
                We&apos;ll send a secure 6-digit one-time code via SMTP.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold text-[#0C100D] bg-[#7FBF6A] hover:bg-[#92CF7D] active:scale-[0.98] transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Sending Code...</span>
                </>
              ) : (
                <>
                  <span>Send Verification Code</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Step 2: OTP Verification Form */
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="otp-input"
                  className={`text-xs font-semibold ${
                    isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
                  }`}
                >
                  Enter 6-Digit Code
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setOtp("");
                    setError(null);
                  }}
                  className="text-[11px] text-[#7FBF6A] hover:underline cursor-pointer"
                >
                  Change Email
                </button>
              </div>

              <div className="relative">
                <KeyRound
                  className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 ${
                    isLight ? "text-[#8B968B]" : "text-[#5E695E]"
                  }`}
                />
                <input
                  id="otp-input"
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  required
                  autoFocus
                  className={`w-full pl-10 pr-4 py-2.5 text-base tracking-[0.3em] text-center font-mono font-bold rounded-xl border transition-all outline-none focus:ring-2 focus:ring-[#7FBF6A]/40 ${
                    isLight
                      ? "bg-[#FAFBF9] border-[#D1D9D0] text-[#141A15]"
                      : "bg-[#0C100D] border-[#243026] text-[#E8ECE4]"
                  }`}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold text-[#0C100D] bg-[#7FBF6A] hover:bg-[#92CF7D] active:scale-[0.98] transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <span>Verify &amp; Continue</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={loading}
                className={`text-xs ${
                  isLight ? "text-[#5E695E] hover:text-[#141A15]" : "text-[#8B968B] hover:text-[#E8ECE4]"
                } transition-colors cursor-pointer`}
              >
                Didn&apos;t receive code? Resend OTP
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}

