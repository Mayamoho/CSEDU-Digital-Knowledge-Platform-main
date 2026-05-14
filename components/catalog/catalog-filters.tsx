"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const formats = [
  { value: "book", label: "Books" },
  { value: "journal", label: "Journals" },
  { value: "thesis", label: "Theses" },
  { value: "proceedings", label: "Conference Proceedings" },
  { value: "magazine", label: "Magazines" },
];

const statuses = [
  { value: "available", label: "Available" },
  { value: "borrowed", label: "Currently Borrowed" },
  { value: "reserved", label: "Reserved" },
];

const languages = [
  { value: "en", label: "English" },
  { value: "bn", label: "Bangla" },
];

export function CatalogFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedFormats = searchParams.get("format")?.split(",") || [];
  const selectedStatuses = searchParams.get("status")?.split(",") || [];
  const selectedLanguages = searchParams.get("lang")?.split(",") || [];

  const updateFilter = (key: string, value: string, checked: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    const currentValues = params.get(key)?.split(",").filter(Boolean) || [];

    if (checked) {
      currentValues.push(value);
    } else {
      const index = currentValues.indexOf(value);
      if (index > -1) {
        currentValues.splice(index, 1);
      }
    }

    if (currentValues.length > 0) {
      params.set(key, currentValues.join(","));
    } else {
      params.delete(key);
    }
    params.set("page", "1");
    router.push(`/catalog?${params.toString()}`);
  };

  const clearAllFilters = () => {
    const params = new URLSearchParams();
    const q = searchParams.get("q");
    if (q) params.set("q", q);
    router.push(`/catalog?${params.toString()}`);
  };

  const hasFilters = selectedFormats.length > 0 || selectedStatuses.length > 0 || selectedLanguages.length > 0;

  return (
    <Card className="sticky top-20">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Filters</CardTitle>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              Clear all
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Format Filter */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Format</Label>
          <div className="space-y-2">
            {formats.map((format) => (
              <div key={format.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`format-${format.value}`}
                  checked={selectedFormats.includes(format.value)}
                  onCheckedChange={(checked) =>
                    updateFilter("format", format.value, !!checked)
                  }
                />
                <Label
                  htmlFor={`format-${format.value}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {format.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Status Filter */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Availability</Label>
          <div className="space-y-2">
            {statuses.map((status) => (
              <div key={status.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`status-${status.value}`}
                  checked={selectedStatuses.includes(status.value)}
                  onCheckedChange={(checked) =>
                    updateFilter("status", status.value, !!checked)
                  }
                />
                <Label
                  htmlFor={`status-${status.value}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {status.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Language Filter */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Language</Label>
          <div className="space-y-2">
            {languages.map((lang) => (
              <div key={lang.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`lang-${lang.value}`}
                  checked={selectedLanguages.includes(lang.value)}
                  onCheckedChange={(checked) =>
                    updateFilter("lang", lang.value, !!checked)
                  }
                />
                <Label
                  htmlFor={`lang-${lang.value}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {lang.label}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
