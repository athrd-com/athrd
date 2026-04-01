"use client";

import { Github, Loader2, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { refreshGithubOrganizations } from "~/lib/github-auth";

interface OrganizationOption {
  id: string;
  login: string;
  avatarUrl: string;
}

interface OrgSwitcherProps {
  organizations: OrganizationOption[];
  selectedOrgId?: string;
}

const PERSONAL_ORG_VALUE = "__personal__";
const REFRESH_ORGS_VALUE = "__refresh_orgs__";

function OrgAvatar({
  login,
  avatarUrl,
}: {
  login: string;
  avatarUrl?: string;
}) {
  return (
    <Avatar className="size-5 border">
      <AvatarImage src={avatarUrl} alt={login} />
      <AvatarFallback className="text-[10px] font-medium uppercase">
        {login.slice(0, 2)}
      </AvatarFallback>
    </Avatar>
  );
}

export function OrgSwitcher({
  organizations,
  selectedOrgId,
}: OrgSwitcherProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const value = selectedOrgId ?? PERSONAL_ORG_VALUE;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-muted-foreground">
        Organization
      </span>
      <Select
        value={value}
        onValueChange={async (nextValue) => {
          if (nextValue === REFRESH_ORGS_VALUE) {
            setIsRefreshing(true);

            try {
              await refreshGithubOrganizations();
            } catch (error) {
              console.error("Failed to refresh GitHub organizations", error);
            } finally {
              setIsRefreshing(false);
            }

            return;
          }

          const target =
            nextValue === PERSONAL_ORG_VALUE
              ? "/threads"
              : `/threads?orgId=${encodeURIComponent(nextValue)}`;

          router.push(target);
        }}
      >
        <SelectTrigger
          className="min-w-52"
          aria-label="Select GitHub organization"
        >
          <SelectValue className="sr-only" placeholder="Select organization" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value={PERSONAL_ORG_VALUE}>
            <span className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full border bg-muted text-muted-foreground">
                <User className="size-3" />
              </span>
              <span>Personal account</span>
            </span>
          </SelectItem>
          {organizations.map((organization) => (
            <SelectItem key={organization.id} value={organization.id}>
              <span className="flex items-center gap-2">
                <OrgAvatar
                  login={organization.login}
                  avatarUrl={organization.avatarUrl}
                />
                <span>{organization.login}</span>
              </span>
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Missing something?</SelectLabel>
            <SelectItem value={REFRESH_ORGS_VALUE} disabled={isRefreshing}>
              <span className="flex items-center gap-2">
                {isRefreshing ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <Github className="size-4 text-muted-foreground" />
                )}
                <span>I don't see it</span>
              </span>
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
