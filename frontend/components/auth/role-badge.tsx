"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type RoleTier, ROLE_DISPLAY_NAMES } from "@/lib/types";
import { Shield, ShieldCheck, ShieldAlert, User, Bot } from "lucide-react";

interface RoleBadgeProps {
  role: RoleTier;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const roleConfig: Record<
  RoleTier,
  {
    icon: typeof Shield;
    variant: "default" | "secondary" | "outline" | "destructive";
    className: string;
  }
> = {
  public: {
    icon: User,
    variant: "outline",
    className: "text-muted-foreground border-muted-foreground/30",
  },
  member: {
    icon: Shield,
    variant: "outline",
    className: "text-primary border-primary/30 bg-primary/5",
  },
  staff: {
    icon: ShieldCheck,
    variant: "secondary",
    className: "text-accent-foreground bg-accent/80",
  },
  admin: {
    icon: ShieldAlert,
    variant: "default",
    className: "bg-primary text-primary-foreground",
  },
  ai_admin: {
    icon: Bot,
    variant: "default",
    className: "bg-gradient-to-r from-primary to-accent text-primary-foreground",
  },
};

const sizeClasses = {
  sm: "text-xs px-1.5 py-0",
  md: "text-xs px-2 py-0.5",
  lg: "text-sm px-2.5 py-1",
};

const iconSizes = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
};

/**
 * RoleBadge - Displays user role with appropriate styling
 * 
 * Usage:
 * <RoleBadge role="admin" showIcon />
 * <RoleBadge role={user.role_tier} size="lg" />
 */
export function RoleBadge({
  role,
  showIcon = false,
  size = "md",
  className,
}: RoleBadgeProps) {
  const config = roleConfig[role];
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={cn(sizeClasses[size], config.className, className)}
    >
      {showIcon && <Icon className={cn(iconSizes[size], "mr-1")} />}
      {ROLE_DISPLAY_NAMES[role]}
    </Badge>
  );
}
