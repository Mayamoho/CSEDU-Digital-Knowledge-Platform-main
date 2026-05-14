"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Filter, X } from "lucide-react";

const projectTypes = [
  { id: "undergraduate", label: "Undergraduate", count: 67 },
  { id: "graduate", label: "Graduate", count: 34 },
  { id: "research", label: "Research", count: 23 },
];

const years = [
  { id: "2023", label: "2023", count: 45 },
  { id: "2022", label: "2022", count: 38 },
  { id: "2021", label: "2021", count: 29 },
  { id: "2020", label: "2020", count: 22 },
  { id: "older", label: "Before 2020", count: 18 },
];

const technologies = [
  { id: "react", label: "React", count: 34 },
  { id: "python", label: "Python", count: 45 },
  { id: "machine-learning", label: "Machine Learning", count: 28 },
  { id: "blockchain", label: "Blockchain", count: 15 },
  { id: "web3", label: "Web3", count: 12 },
  { id: "mobile", label: "Mobile Development", count: 22 },
];

function ProjectsFiltersInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    searchParams.get("type")?.split(",") || []
  );
  const [selectedYears, setSelectedYears] = useState<string[]>(
    searchParams.get("year")?.split(",") || []
  );
  const [selectedTech, setSelectedTech] = useState<string[]>(
    searchParams.get("tech")?.split(",") || []
  );

  const updateFilter = (filterType: string, values: string[]) => {
    const params = new URLSearchParams(searchParams);
    
    if (values.length > 0) {
      params.set(filterType, values.join(","));
    } else {
      params.delete(filterType);
    }
    
    params.delete("page");
    router.push(`/projects?${params.toString()}`);
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

  const handleTechChange = (techId: string, checked: boolean) => {
    const newTech = checked
      ? [...selectedTech, techId]
      : selectedTech.filter((t) => t !== techId);
    setSelectedTech(newTech);
    updateFilter("tech", newTech);
  };

  const clearAllFilters = () => {
    setSelectedTypes([]);
    setSelectedYears([]);
    setSelectedTech([]);
    const params = new URLSearchParams(searchParams);
    params.delete("type");
    params.delete("year");
    params.delete("tech");
    params.delete("page");
    router.push(`/projects?${params.toString()}`);
  };

  const hasActiveFilters = selectedTypes.length > 0 || selectedYears.length > 0 || selectedTech.length > 0;

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
        {/* Project Types */}
        <div>
          <h4 className="font-medium mb-3">Project Type</h4>
          <div className="space-y-2">
            {projectTypes.map((type) => (
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
          <h4 className="font-medium mb-3">Project Year</h4>
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

        {/* Technologies */}
        <div>
          <h4 className="font-medium mb-3">Technologies</h4>
          <div className="space-y-2">
            {technologies.map((tech) => (
              <div key={tech.id} className="flex items-center space-x-2">
                <Checkbox
                  id={tech.id}
                  checked={selectedTech.includes(tech.id)}
                  onCheckedChange={(checked) => handleTechChange(tech.id, checked as boolean)}
                />
                <label
                  htmlFor={tech.id}
                  className="flex items-center justify-between flex-1 cursor-pointer"
                >
                  <span className="text-sm">{tech.label}</span>
                  <Badge variant="secondary" className="text-xs">
                    {tech.count}
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

export function ProjectsFilters() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-muted rounded" />}>
      <ProjectsFiltersInner />
    </Suspense>
  );
}
