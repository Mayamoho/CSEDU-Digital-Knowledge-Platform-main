"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { AlertCircle, CheckCircle, CreditCard, DollarSign } from "lucide-react";
import { apiClient, Fine } from "@/lib/api";
import { useRoleCheck } from "@/components/auth/role-gate";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function FinesList() {
  const [fines, setFines] = useState<Fine[]>([]);
  const [totalUnpaid, setTotalUnpaid] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingFineId, setPayingFineId] = useState<string | null>(null);
  const { checkPermission } = useRoleCheck();

  const canWaiveFines = checkPermission('manage_fines');

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

  const handlePayFine = async (fineId: string) => {
    try {
      setPayingFineId(fineId);
      await apiClient.payFine(fineId, 'cash');
      await loadFines(); // Reload to get updated data
    } catch (err) {
      console.error("Failed to pay fine:", err);
      alert(err instanceof Error ? err.message : "Failed to pay fine");
    } finally {
      setPayingFineId(null);
    }
  };

  const handleWaiveFine = async (fineId: string) => {
    if (!confirm("Are you sure you want to waive this fine?")) {
      return;
    }

    try {
      await apiClient.waiveFine(fineId);
      await loadFines();
    } catch (err) {
      console.error("Failed to waive fine:", err);
      alert(err instanceof Error ? err.message : "Failed to waive fine");
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

  const unpaidFines = fines.filter(f => !f.paid && !f.waived);
  const paidFines = fines.filter(f => f.paid || f.waived);

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
              {unpaidFines.map((fine) => (
                <div
                  key={fine.fine_id}
                  className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5"
                >
                  <div className="flex-1">
                    <h3 className="font-medium">{fine.title || `Loan ${fine.loan_id}`}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Fine ID: {fine.fine_id}
                    </p>
                    {fine.due_date && (
                      <p className="text-sm text-muted-foreground">
                        Due Date: {new Date(fine.due_date).toLocaleDateString()}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Created: {new Date(fine.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-2xl font-bold text-destructive">
                        ৳{fine.amount_bdt.toFixed(2)}
                      </p>
                      <Badge variant="destructive">Unpaid</Badge>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        onClick={() => handlePayFine(fine.fine_id)}
                        disabled={payingFineId === fine.fine_id}
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        {payingFineId === fine.fine_id ? "Processing..." : "Pay Now"}
                      </Button>
                      {canWaiveFines && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleWaiveFine(fine.fine_id)}
                        >
                          Waive Fine
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
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
            <li>Contact library staff if you believe a fine was charged in error</li>
            <li>Payment methods: Cash at library counter</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
