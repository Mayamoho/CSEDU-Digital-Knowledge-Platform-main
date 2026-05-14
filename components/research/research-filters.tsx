"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Filter, X } from "lucide-react";

const researchTypes = [
  { id: "journal", label: "Journal Articles", count: 45 },
  { id: "thesis", label: "Theses", count: 23 },
  { id: "conference", label: "Conference Papers", count: 67 },
];

const years = [
  { id: "2023", label: "2023", count: 38 },
  { id: "2022", label: "2022", count: 42 },
  { id: "2021", label: "2021", count: 35 },
  { id: "2020", label: "2020", count: 28 },
  { id: "older", label: "Before 2020", count: 18 },
];

const topics = [
  { id: "machine-learning", label: "Machine Learning", count: 34 },
  { id: "security", label: "Security", count: 28 },
  { id: "nlp", label: "Natural Language Processing", count: 22 },
  { id: "blockchain", label: "Blockchain", count: 15 },
  { id: "computer-vision", label: "Computer Vision", count: 19 },
];

function ResearchFiltersInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    searchParams.get("type")?.split(",") || []
  );
  const [selectedYears, setSelectedYears] = useState<string[]>(
    searchParams.get("year")?.split(",") || []
  );
  const [selectedTopics, setSelectedTopics] = useState<string[]>(
    searchParams.get("topic")?.split(",") || []
  );

  const updateFilter = (filterType: string, values: string[]) => {
    const params = new URLSearchParams(searchParams);
    
    if (values.length > 0) {
      params.set(filterType, values.join(","));
    } else {
      params.delete(filterType);
    }
    
    params.delete("page");
    router.push(`/research?${params.toString()}`);
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

  const handleTopicChange = (topicId: string, checked: boolean) => {
    const newTopics = checked
      ? [...selectedTopics, topicId]
      : selectedTopics.filter((t) => t !== topicId);
    setSelectedTopics(newTopics);
    updateFilter("topic", newTopics);
  };

  const clearAllFilters = () => {
    setSelectedTypes([]);
    setSelectedYears([]);
    setSelectedTopics([]);
    const params = new URLSearchParams(searchParams);
    params.delete("type");
    params.delete("year");
    params.delete("topic");
    params.delete("page");
    router.push(`/research?${params.toString()}`);
  };

  const hasActiveFilters = selectedTypes.length > 0 || selectedYears.length > 0 || selectedTopics.length > 0;

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
        {/* Research Types */}
        <div>
          <h4 className="font-medium mb-3">Publication Type</h4>
          <div className="space-y-2">
            {researchTypes.map((type) => (
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
          <h4 className="font-medium mb-3">Publication Year</h4>
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

        {/* Topics */}
        <div>
          <h4 className="font-medium mb-3">Research Topics</h4>
          <div className="space-y-2">
            {topics.map((topic) => (
              <div key={topic.id} className="flex items-center space-x-2">
                <Checkbox
                  id={topic.id}
                  checked={selectedTopics.includes(topic.id)}
                  onCheckedChange={(checked) => handleTopicChange(topic.id, checked as boolean)}
                />
                <label
                  htmlFor={topic.id}
                  className="flex items-center justify-between flex-1 cursor-pointer"
                >
                  <span className="text-sm">{topic.label}</span>
                  <Badge variant="secondary" className="text-xs">
                    {topic.count}
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

export function ResearchFilters() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-muted rounded" />}>
      <ResearchFiltersInner />
    </Suspense>
  );
}
