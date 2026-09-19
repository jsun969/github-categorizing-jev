import { Card, Chip } from "@heroui/react";
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
      <header className="mx-auto max-w-[1800px] px-4 pt-4 sm:px-6">
        <Card>
          <Card.Content className="flex flex-wrap items-center justify-between gap-4 sm:flex-row">
            <div className="flex flex-col gap-1">
              <AppLink to="/" className="text-lg font-semibold">
                GitHub Stars
              </AppLink>
              <p className="text-xs text-muted">Categorize with Jev</p>
            </div>
            <nav
              aria-label="Main navigation"
              className="flex flex-wrap items-center gap-2"
            >
              {navigation.map(({ path, label }) => (
                <AppLink
                  key={path}
                  to={path}
                  aria-current={pathname === path ? "page" : undefined}
                >
                  <Chip
                    color={pathname === path ? "accent" : "default"}
                    variant={pathname === path ? "soft" : "tertiary"}
                  >
                    {label}
                  </Chip>
                </AppLink>
              ))}
            </nav>
            <Chip size="sm" variant="soft">
              Local preview
            </Chip>
          </Card.Content>
        </Card>
      </header>
      <main className="mx-auto max-w-[1800px] px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
