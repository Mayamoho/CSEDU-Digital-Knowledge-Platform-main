"use client";

import { useRef, useState } from "react";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScanBarcode, BookUp, BookDown } from "lucide-react";
import { toast } from "sonner";

// Strip trailing \n / \r that HID barcode scanners append (SDD §3.2).
const clean = (s: string) => s.replace(/[\r\n]+/g, "").trim();

export function CirculationDesk() {
  return (
    <Tabs defaultValue="checkout" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="checkout">
          <BookUp className="h-4 w-4 mr-2" />
          Checkout
        </TabsTrigger>
        <TabsTrigger value="return">
          <BookDown className="h-4 w-4 mr-2" />
          Return
        </TabsTrigger>
      </TabsList>
      <TabsContent value="checkout">
        <CheckoutTab />
      </TabsContent>
      <TabsContent value="return">
        <ReturnTab />
      </TabsContent>
    </Tabs>
  );
}

function CheckoutTab() {
  const [memberCode, setMemberCode] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastLoan, setLastLoan] = useState<{ member_name: string; title: string; due_date: string } | null>(null);
  const itemRef = useRef<HTMLInputElement>(null);
  const memberRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const member = clean(memberCode);
    const item = clean(itemCode);
    if (!member || !item) {
      toast.error("Scan both a member card and a book barcode");
      return;
    }
    try {
      setBusy(true);
      const res = await apiClient.circulationCheckout(member, item);
      setLastLoan({ member_name: res.member_name, title: res.title, due_date: res.due_date });
      toast.success(`Loan created: "${res.title}" → ${res.member_name}`);
      setMemberCode("");
      setItemCode("");
      memberRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanBarcode className="h-5 w-5" />
          Scan to Checkout
        </CardTitle>
        <CardDescription>
          Scan the member card, then the book barcode. Scanner input works like a
          keyboard — Enter advances automatically. Manual entry: member email or
          book ISBN also work.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="member-code">Member barcode</Label>
          <Input
            id="member-code"
            ref={memberRef}
            autoFocus
            placeholder="M-XXXXXXXX or member email"
            value={memberCode}
            onChange={e => setMemberCode(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                itemRef.current?.focus();
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="item-code">Book barcode</Label>
          <Input
            id="item-code"
            ref={itemRef}
            placeholder="B-XXXXXXXX or ISBN"
            value={itemCode}
            onChange={e => setItemCode(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <Button onClick={submit} disabled={busy} className="w-full">
          {busy ? "Creating loan..." : "Confirm Checkout"}
        </Button>
        {lastLoan && (
          <p className="text-sm text-muted-foreground">
            Last loan: “{lastLoan.title}” to {lastLoan.member_name}, due{" "}
            {new Date(lastLoan.due_date).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ReturnTab() {
  const [itemCode, setItemCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const item = clean(itemCode);
    if (!item) {
      toast.error("Scan a book barcode");
      return;
    }
    try {
      setBusy(true);
      const res = await apiClient.circulationReturn(item);
      toast.success(`Returned: "${res.title}" from ${res.member_name}`);
      setItemCode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Return failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanBarcode className="h-5 w-5" />
          Scan to Return
        </CardTitle>
        <CardDescription>
          Scan the book barcode (or type its ISBN). The active loan is closed and
          any overdue fine is assessed automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="return-code">Book barcode</Label>
          <Input
            id="return-code"
            autoFocus
            placeholder="B-XXXXXXXX or ISBN"
            value={itemCode}
            onChange={e => setItemCode(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <Button onClick={submit} disabled={busy} className="w-full">
          {busy ? "Recording return..." : "Confirm Return"}
        </Button>
      </CardContent>
    </Card>
  );
}
