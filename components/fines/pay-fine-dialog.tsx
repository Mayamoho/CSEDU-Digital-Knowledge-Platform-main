"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, Smartphone, Info } from "lucide-react";
import { apiClient, type Fine } from "@/lib/api";

type Method = "bkash" | "nagad" | "cash";
type Step = "method" | "wallet" | "otp";

const METHODS: {
  id: Method;
  label: string;
  hint: string;
  color: string;
  icon: typeof Smartphone;
}[] = [
  { id: "bkash", label: "bKash", hint: "Pay online with OTP", color: "#E2136E", icon: Smartphone },
  { id: "nagad", label: "Nagad", hint: "Pay online with OTP", color: "#F6821F", icon: Smartphone },
  { id: "cash", label: "Pay at counter", hint: "Cash to a librarian", color: "#0f766e", icon: Building2 },
];

export function PayFineDialog({
  fine,
  open,
  onOpenChange,
  onSettled,
}: {
  fine: Fine;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSettled: () => void;
}) {
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<Method>("bkash");
  const [wallet, setWallet] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);

  // Reset to a clean state whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setStep("method");
      setMethod("bkash");
      setWallet("");
      setOtp("");
      setSessionId("");
      setDemoOtp(null);
      setSecondsLeft(0);
      setLoading(false);
    }
  }, [open]);

  // OTP countdown.
  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [step, secondsLeft]);

  const chosen = METHODS.find((m) => m.id === method)!;

  const handleMethodNext = async () => {
    if (method === "cash") {
      try {
        setLoading(true);
        const res = await apiClient.requestCashPayment(fine.fine_id);
        toast.success(res.message);
        onSettled();
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create counter request");
      } finally {
        setLoading(false);
      }
      return;
    }
    setStep("wallet");
  };

  const handleInitiate = async () => {
    try {
      setLoading(true);
      const res = await apiClient.initiateOnlinePayment(fine.fine_id, method as "bkash" | "nagad", wallet.trim());
      setSessionId(res.session_id);
      setDemoOtp(res.demo_otp ?? null);
      setSecondsLeft(res.otp_expires_in ?? 180);
      setStep("otp");
      toast.success(res.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start payment");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    try {
      setLoading(true);
      const res = await apiClient.confirmOnlinePayment(fine.fine_id, sessionId, otp.trim());
      toast.success(res.message);
      onSettled();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay Fine — ৳{fine.amount_bdt.toFixed(2)}</DialogTitle>
          <DialogDescription>
            {fine.title ? `For "${fine.title}"` : `Loan ${fine.loan_id}`}
          </DialogDescription>
        </DialogHeader>

        {step === "method" && (
          <div className="space-y-3">
            {METHODS.map((m) => {
              const Icon = m.icon;
              const active = method === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                    active ? "border-2" : "border-border hover:bg-muted"
                  }`}
                  style={active ? { borderColor: m.color } : undefined}
                >
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-md text-white"
                    style={{ backgroundColor: m.color }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-medium">{m.label}</span>
                    <span className="block text-xs text-muted-foreground">{m.hint}</span>
                  </span>
                </button>
              );
            })}
            <DialogFooter>
              <Button onClick={handleMethodNext} disabled={loading} className="w-full">
                {loading ? "Please wait…" : method === "cash" ? "Request counter payment" : `Continue with ${chosen.label}`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "wallet" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md p-2 text-white" style={{ backgroundColor: chosen.color }}>
              <Smartphone className="h-4 w-4" />
              <span className="font-medium">{chosen.label} payment</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wallet">{chosen.label} account number</Label>
              <Input
                id="wallet"
                inputMode="numeric"
                placeholder="01XXXXXXXXX"
                value={wallet}
                maxLength={11}
                onChange={(e) => setWallet(e.target.value.replace(/\D/g, ""))}
              />
              <p className="text-xs text-muted-foreground">
                An OTP will be sent to this number to authorize ৳{fine.amount_bdt.toFixed(2)}.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setStep("method")} disabled={loading}>
                Back
              </Button>
              <Button onClick={handleInitiate} disabled={loading || wallet.length !== 11}>
                {loading ? "Sending OTP…" : "Send OTP"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "otp" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit OTP sent to your {chosen.label} account.
              {secondsLeft > 0 && (
                <> Expires in <span className="font-medium text-foreground">{secondsLeft}s</span>.</>
              )}
            </p>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            {demoOtp && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Demo gateway:</strong> a real bKash/Nagad integration delivers this by SMS.
                  For testing your OTP is <strong className="tracking-widest">{demoOtp}</strong>.
                </AlertDescription>
              </Alert>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setStep("method")} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={loading || otp.length !== 6}>
                {loading ? "Verifying…" : `Pay ৳${fine.amount_bdt.toFixed(2)}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
