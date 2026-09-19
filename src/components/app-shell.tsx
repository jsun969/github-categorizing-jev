import { Chip, Separator } from "@heroui/react";
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppLink } from "./app-link";

const navigation = [
  { path: "/", label: "Workspace" },
  { path: "/categories", label: "Categories" },
  { path: "/settings", label: "Settings" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <div className="min-h-svh">
      <header className="mx-auto max-w-[1600px] px-4 sm:px-6">
        <div className="flex min-h-16 flex-wrap items-center gap-x-8 gap-y-3 py-3">
          <AppLink to="/" className="font-semibold">
            GitHub Stars
          </AppLink>
          <nav aria-label="Main navigation" className="flex items-center gap-5">
            {navigation.map(({ path, label }) => (
              <AppLink
                key={path}
                to={path}
                aria-current={pathname === path ? "page" : undefined}
                className={
                  pathname === path ? "text-sm font-semibold" : "text-sm"
                }
              >
                {label}
              </AppLink>
            ))}
          </nav>
          <Chip size="sm" variant="soft" className="ms-auto">
            Preview only
          </Chip>
        </div>
        <Separator />
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
