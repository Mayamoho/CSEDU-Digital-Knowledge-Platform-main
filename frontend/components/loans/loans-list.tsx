"use client";

import { useEffect, useState } from "react";
import { apiClient, type LoanItem } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Calendar, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export function LoansList() {
  const [loans, setLoans] = useState<LoanItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [returningId, setReturningId] = useState<string | null>(null);

  const loadLoans = async () => {
    try {
      const response = await apiClient.getMyLoans();
      setLoans(response.data);
    } catch (error) {
      console.error("Failed to load loans:", error);
      toast.error("Failed to load loans");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLoans();
  }, []);

  const handleReturn = async (loanId: string) => {
    try {
      setReturningId(loanId);
      await apiClient.returnBook(loanId);
      toast.success("Book returned successfully!");
      await loadLoans();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to return book");
    } finally {
      setReturningId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'overdue');
  const returnedLoans = loans.filter(l => l.status === 'returned');

  return (
    <div className="space-y-6">
      {/* Active Loans */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Active Loans ({activeLoans.length})
          </CardTitle>
          <CardDescription>Books you currently have borrowed</CardDescription>
        </CardHeader>
        <CardContent>
          {activeLoans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No active loans</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeLoans.map(loan => {
                const isOverdue = loan.status === 'overdue';
                const dueDate = new Date(loan.due_date);
                const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                return (
                  <div key={loan.loan_id} className={`p-4 rounded-lg border ${isOverdue ? 'border-destructive bg-destructive/5' : 'border-border'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-start gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                            <BookOpen className="h-6 w-6 text-primary" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold">{loan.title}</h3>
                            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <span>Borrowed: {new Date(loan.checkout_date).toLocaleDateString()}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {isOverdue ? (
                                  <>
                                    <AlertCircle className="h-4 w-4 text-destructive" />
                                    <span className="text-destructive font-medium">
                                      Overdue since {dueDate.toLocaleDateString()}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Calendar className="h-4 w-4" />
                                    <span>
                                      Due: {dueDate.toLocaleDateString()}
                                      {daysUntilDue <= 3 && daysUntilDue > 0 && (
                                        <span className="ml-2 text-amber-600 font-medium">
                                          ({daysUntilDue} {daysUntilDue === 1 ? 'day' : 'days'} left)
                                        </span>
                                      )}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={isOverdue ? 'destructive' : 'default'}>
                          {isOverdue ? 'Overdue' : 'Active'}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReturn(loan.loan_id)}
                          disabled={returningId === loan.loan_id}
                        >
                          {returningId === loan.loan_id ? 'Returning...' : 'Return Book'}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Borrowing History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Borrowing History ({returnedLoans.length})
          </CardTitle>
          <CardDescription>Previously borrowed books</CardDescription>
        </CardHeader>
        <CardContent>
          {returnedLoans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No borrowing history</p>
            </div>
          ) : (
            <div className="space-y-3">
              {returnedLoans.map(loan => (
                <div key={loan.loan_id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{loan.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(loan.checkout_date).toLocaleDateString()} - {loan.return_date && new Date(loan.return_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">Returned</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
