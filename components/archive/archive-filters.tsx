"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Filter, X } from "lucide-react";

const archiveTypes = [
  { id: "report", label: "Reports", count: 24 },
  { id: "multimedia", label: "Multimedia", count: 18 },
  { id: "document", label: "Documents", count: 32 },
  { id: "proceedings", label: "Proceedings", count: 15 },
];

const years = [
  { id: "2023", label: "2023", count: 45 },
  { id: "2022", label: "2022", count: 38 },
  { id: "2021", label: "2021", count: 29 },
  { id: "2020", label: "2020", count: 22 },
  { id: "older", label: "Before 2020", count: 15 },
];

const accessTiers = [
  { id: "public", label: "Public", count: 89 },
  { id: "member", label: "Members", count: 34 },
  { id: "staff", label: "Staff Only", count: 12 },
  { id: "restricted", label: "Restricted", count: 4 },
];

function ArchiveFiltersInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    searchParams.get("type")?.split(",") || []
  );
  const [selectedYears, setSelectedYears] = useState<string[]>(
    searchParams.get("year")?.split(",") || []
  );
  const [selectedTiers, setSelectedTiers] = useState<string[]>(
    searchParams.get("access")?.split(",") || []
  );

  const updateFilter = (filterType: string, values: string[]) => {
    const params = new URLSearchParams(searchParams);
    
    if (values.length > 0) {
      params.set(filterType, values.join(","));
    } else {
      params.delete(filterType);
    }
    
    params.delete("page"); // Reset to first page
    router.push(`/archive?${params.toString()}`);
  };

  const handleTypeChange = (typeId: string, checked: boolean) => {
    const newTypes = checked
      ? [...selectedTypes, typeId]
      : selectedTypes.filter((t) => t !== typeId);
    setSelectedTypes(newTypes);
    updateFilter("type", newTypes);
  };

  const handleYearChange = (yearId: string, checked: boolean) => {
    const newYears = checked
      ? [...selectedYears, yearId]
      : selectedYears.filter((y) => y !== yearId);
    setSelectedYears(newYears);
    updateFilter("year", newYears);
  };

  const handleTierChange = (tierId: string, checked: boolean) => {
    const newTiers = checked
      ? [...selectedTiers, tierId]
      : selectedTiers.filter((t) => t !== tierId);
    setSelectedTiers(newTiers);
    updateFilter("access", newTiers);
  };

  const clearAllFilters = () => {
    setSelectedTypes([]);
    setSelectedYears([]);
    setSelectedTiers([]);
    const params = new URLSearchParams(searchParams);
    params.delete("type");
    params.delete("year");
    params.delete("access");
    params.delete("page");
    router.push(`/archive?${params.toString()}`);
  };

  const hasActiveFilters = selectedTypes.length > 0 || selectedYears.length > 0 || selectedTiers.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Archive Types */}
        <div>
          <h4 className="font-medium mb-3">Archive Type</h4>
          <div className="space-y-2">
            {archiveTypes.map((type) => (
              <div key={type.id} className="flex items-center space-x-2">
                <Checkbox
                  id={type.id}
                  checked={selectedTypes.includes(type.id)}
                  onCheckedChange={(checked) => handleTypeChange(type.id, checked as boolean)}
                />
                <label
                  htmlFor={type.id}
                  className="flex items-center justify-between flex-1 cursor-pointer"
                >
                  <span className="text-sm">{type.label}</span>
                  <Badge variant="secondary" className="text-xs">
                    {type.count}
                  </Badge>
                </label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Years */}
        <div>
          <h4 className="font-medium mb-3">Year</h4>
          <div className="space-y-2">
            {years.map((year) => (
              <div key={year.id} className="flex items-center space-x-2">
                <Checkbox
                  id={year.id}
                  checked={selectedYears.includes(year.id)}
                  onCheckedChange={(checked) => handleYearChange(year.id, checked as boolean)}
                />
                <label
                  htmlFor={year.id}
                  className="flex items-center justify-between flex-1 cursor-pointer"
                >
                  <span className="text-sm">{year.label}</span>
                  <Badge variant="secondary" className="text-xs">
                    {year.count}
                  </Badge>
                </label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Access Tiers */}
        <div>
          <h4 className="font-medium mb-3">Access Level</h4>
          <div className="space-y-2">
            {accessTiers.map((tier) => (
              <div key={tier.id} className="flex items-center space-x-2">
                <Checkbox
                  id={tier.id}
                  checked={selectedTiers.includes(tier.id)}
                  onCheckedChange={(checked) => handleTierChange(tier.id, checked as boolean)}
                />
                <label
                  htmlFor={tier.id}
                  className="flex items-center justify-between flex-1 cursor-pointer"
                >
                  <span className="text-sm">{tier.label}</span>
                  <Badge variant="secondary" className="text-xs">
                    {tier.count}
                  </Badge>
                </label>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ArchiveFilters() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-muted rounded" />}>
      <ArchiveFiltersInner />
    </Suspense>
  );
}
