"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface OrganizationOption {
  id: string;
  login: string;
}

interface OrgSwitcherProps {
  organizations: OrganizationOption[];
  selectedOrgId?: string;
}

const PERSONAL_ORG_VALUE = "__personal__";

export function OrgSwitcher({
  organizations,
  selectedOrgId,
}: OrgSwitcherProps) {
  const router = useRouter();

  const value = selectedOrgId ?? PERSONAL_ORG_VALUE;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-muted-foreground">
        GitHub org
      </span>
      <Select
        value={value}
        onValueChange={(nextValue) => {
          const target =
            nextValue === PERSONAL_ORG_VALUE
              ? "/threads"
              : `/threads?orgId=${encodeURIComponent(nextValue)}`;

          router.push(target);
        }}
      >
        <SelectTrigger className="min-w-52" aria-label="Select GitHub organization">
          <SelectValue placeholder="Select organization" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value={PERSONAL_ORG_VALUE}>Personal account</SelectItem>
          {organizations.map((organization) => (
            <SelectItem key={organization.id} value={organization.id}>
              {organization.login}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
