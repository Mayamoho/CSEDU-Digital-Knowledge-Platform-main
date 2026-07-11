"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { AlertCircle, CheckCircle, CreditCard, DollarSign, Clock, Banknote, User } from "lucide-react";
import { apiClient, Fine, type AdminFine, type CashRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PayFineDialog } from "@/components/fines/pay-fine-dialog";

export function FinesList() {
  const { user } = useAuth();
  // Librarians and admins see every member's fines, not their own.
  if (user?.role_tier === "librarian" || user?.role_tier === "administrator") {
    return <AllFinesView />;
  }
  return <MyFinesList />;
}

function methodLabel(m?: string | null) {
  if (m === "bkash") return "bKash";
  if (m === "nagad") return "Nagad";
  if (m === "cash") return "counter";
  return m ?? "";
}

function MyFinesList() {
  const [fines, setFines] = useState<Fine[]>([]);
  const [totalUnpaid, setTotalUnpaid] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payFine, setPayFine] = useState<Fine | null>(null);

  useEffect(() => {
    loadFines();
  }, []);

  const loadFines = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiClient.getMyFines();
      setFines(response.data);
      setTotalUnpaid(response.total_unpaid_bdt);
    } catch (err) {
      console.error("Failed to load fines:", err);
      setError(err instanceof Error ? err.message : "Failed to load fines");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const unpaidFines = fines.filter((f) => !f.paid && !f.waived);
  const paidFines = fines.filter((f) => f.paid || f.waived);

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Fine Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">Total Fines</p>
              <p className="text-2xl font-bold">{fines.length}</p>
            </div>
            <div className="p-4 rounded-lg bg-destructive/10">
              <p className="text-sm text-muted-foreground">Unpaid Fines</p>
              <p className="text-2xl font-bold text-destructive">{unpaidFines.length}</p>
            </div>
            <div className="p-4 rounded-lg bg-destructive/10">
              <p className="text-sm text-muted-foreground">Total Unpaid Amount</p>
              <p className="text-2xl font-bold text-destructive">৳{totalUnpaid.toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Outstanding Fines */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Outstanding Fines
          </CardTitle>
        </CardHeader>
        <CardContent>
          {unpaidFines.length === 0 ? (
            <Empty>
              <EmptyMedia variant="icon">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </EmptyMedia>
              <EmptyTitle>No Outstanding Fines</EmptyTitle>
              <EmptyDescription>
                You don't have any unpaid fines. Keep up the good work!
              </EmptyDescription>
            </Empty>
          ) : (
            <div className="space-y-4">
              {unpaidFines.map((fine) => {
                const awaitingCounter = fine.pending_status === "awaiting_counter";
                return (
                  <div
                    key={fine.fine_id}
                    className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5"
                  >
                    <div className="flex-1">
                      <h3 className="font-medium">{fine.title || `Loan ${fine.loan_id}`}</h3>
                      {fine.due_date && (
                        <p className="text-sm text-muted-foreground">
                          Due Date: {new Date(fine.due_date).toLocaleDateString()}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Created: {new Date(fine.created_at).toLocaleDateString()}
                      </p>
                      {awaitingCounter && (
                        <p className="mt-1 flex items-center gap-1 text-sm text-amber-600">
                          <Clock className="h-3.5 w-3.5" />
                          Awaiting librarian confirmation at counter
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-2xl font-bold text-destructive">
                          ৳{fine.amount_bdt.toFixed(2)}
                        </p>
                        {awaitingCounter ? (
                          <Badge variant="secondary">Counter payment</Badge>
                        ) : (
                          <Badge variant="destructive">Unpaid</Badge>
                        )}
                      </div>
                      <Button size="sm" onClick={() => setPayFine(fine)}>
                        <CreditCard className="h-4 w-4 mr-2" />
                        {awaitingCounter ? "Pay online instead" : "Pay Now"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      {paidFines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Payment History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {paidFines.map((fine) => (
                <div
                  key={fine.fine_id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/50"
                >
                  <div className="flex-1">
                    <h3 className="font-medium text-sm">{fine.title || `Loan ${fine.loan_id}`}</h3>
                    <p className="text-xs text-muted-foreground">
                      {fine.paid && fine.paid_at && `Paid on ${new Date(fine.paid_at).toLocaleDateString()}`}
                      {fine.waived && fine.waived_at && `Waived on ${new Date(fine.waived_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">৳{fine.amount_bdt.toFixed(2)}</p>
                    <Badge variant={fine.paid ? "default" : "secondary"} className="text-xs">
                      {fine.paid ? "Paid" : "Waived"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fine Policies */}
      <Card>
        <CardHeader>
          <CardTitle>Fine Policies</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Overdue fines are calculated at ৳50.00 per day</li>
            <li>Maximum fine per loan is capped at ৳500.00</li>
            <li>Fines must be paid before borrowing new items</li>
            <li>Pay online via bKash or Nagad (OTP), or in cash at the library counter</li>
            <li>Contact library staff if you believe a fine was charged in error</li>
          </ul>
        </CardContent>
      </Card>

      {payFine && (
        <PayFineDialog
          fine={payFine}
          open={payFine !== null}
          onOpenChange={(o) => !o && setPayFine(null)}
          onSettled={loadFines}
        />
      )}
    </div>
  );
}

// Librarian/admin view: every member's fines + in-person payment confirmations.
function AllFinesView() {
  const [fines, setFines] = useState<AdminFine[]>([]);
  const [cashRequests, setCashRequests] = useState<CashRequest[]>([]);
  const [totalUnpaid, setTotalUnpaid] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [res, cash] = await Promise.all([
        apiClient.adminListFines(),
        apiClient.listCashRequests(),
      ]);
      setFines(res.data);
      setTotalUnpaid(res.total_unpaid_bdt);
      setCashRequests(cash.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fines");
    } finally {
      setIsLoading(false);
    }
  };

  const handleWaive = async (fineId: string) => {
    if (!window.confirm("Waive this fine? This clears it without payment.")) return;
    try {
      setBusyId(fineId);
      await apiClient.waiveFine(fineId);
      toast.success("Fine waived");
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to waive fine");
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmCash = async (fineId: string) => {
    try {
      setBusyId(fineId);
      const res = await apiClient.confirmCashPayment(fineId);
      toast.success(res.message);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm payment");
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const outstanding = fines.filter((f) => !f.paid && !f.waived);
  const settled = fines.filter((f) => f.paid || f.waived);
  const borrower = (f: AdminFine) => f.user_name || f.user_email;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Fines Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">Total Fines</p>
              <p className="text-2xl font-bold">{fines.length}</p>
            </div>
            <div className="p-4 rounded-lg bg-destructive/10">
              <p className="text-sm text-muted-foreground">Outstanding</p>
              <p className="text-2xl font-bold text-destructive">{outstanding.length}</p>
            </div>
            <div className="p-4 rounded-lg bg-amber-500/10">
              <p className="text-sm text-muted-foreground">Counter Requests</p>
              <p className="text-2xl font-bold text-amber-600">{cashRequests.length}</p>
            </div>
            <div className="p-4 rounded-lg bg-destructive/10">
              <p className="text-sm text-muted-foreground">Total Unpaid Amount</p>
              <p className="text-2xl font-bold text-destructive">৳{totalUnpaid.toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* In-person cash requests awaiting confirmation */}
      {cashRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-amber-600" />
              Counter Payments to Confirm
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {cashRequests.map((req) => (
                <div
                  key={req.session_id}
                  className="flex items-center justify-between p-4 rounded-lg border border-amber-500/30 bg-amber-500/5"
                >
                  <div className="flex-1">
                    <h3 className="font-medium">{req.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      {req.user_name || req.user_email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requested: {new Date(req.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-2xl font-bold text-amber-600">৳{req.amount_bdt.toFixed(2)}</p>
                    <Button
                      size="sm"
                      onClick={() => handleConfirmCash(req.fine_id)}
                      disabled={busyId === req.fine_id}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {busyId === req.fine_id ? "Confirming…" : "Confirm Cash Received"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outstanding fines */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Outstanding Member Fines
          </CardTitle>
        </CardHeader>
        <CardContent>
          {outstanding.length === 0 ? (
            <Empty>
              <EmptyMedia variant="icon">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </EmptyMedia>
              <EmptyTitle>No Outstanding Fines</EmptyTitle>
              <EmptyDescription>No member currently owes a fine.</EmptyDescription>
            </Empty>
          ) : (
            <div className="space-y-4">
              {outstanding.map((fine) => (
                <div
                  key={fine.fine_id}
                  className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5"
                >
                  <div className="flex-1">
                    <h3 className="font-medium">{fine.title || `Loan ${fine.loan_id}`}</h3>
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      {borrower(fine)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Created: {new Date(fine.created_at).toLocaleDateString()}
                    </p>
                    {fine.pending_status === "awaiting_counter" && (
                      <p className="mt-1 flex items-center gap-1 text-sm text-amber-600">
                        <Clock className="h-3.5 w-3.5" />
                        Member requested counter payment
                      </p>
                    )}
                    {fine.pending_status === "otp_sent" && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Online {methodLabel(fine.pending_method)} payment in progress
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-2xl font-bold text-destructive">৳{fine.amount_bdt.toFixed(2)}</p>
                      <Badge variant="destructive">Unpaid</Badge>
                    </div>
                    <div className="flex flex-col gap-2">
                      {fine.pending_status === "awaiting_counter" && (
                        <Button
                          size="sm"
                          onClick={() => handleConfirmCash(fine.fine_id)}
                          disabled={busyId === fine.fine_id}
                        >
                          <Banknote className="h-4 w-4 mr-2" />
                          {busyId === fine.fine_id ? "Confirming…" : "Confirm Cash"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleWaive(fine.fine_id)}
                        disabled={busyId === fine.fine_id}
                      >
                        {busyId === fine.fine_id ? "Working…" : "Waive Fine"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settled */}
      {settled.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Paid / Waived
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {settled.map((fine) => (
                <div
                  key={fine.fine_id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/50"
                >
                  <div className="flex-1">
                    <h3 className="font-medium text-sm">{fine.title || `Loan ${fine.loan_id}`}</h3>
                    <p className="text-xs text-muted-foreground">{borrower(fine)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">৳{fine.amount_bdt.toFixed(2)}</p>
                    <Badge variant={fine.paid ? "default" : "secondary"} className="text-xs">
                      {fine.paid ? "Paid" : "Waived"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
