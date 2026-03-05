"use client";

import { Github, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { authClient } from "~/server/better-auth/client";

export function LoginButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: "/threads",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button onClick={handleLogin} disabled={isLoading} className="gap-2">
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}{" "}
      {!isLoading && <Github className="h-4 w-4" />}
      {isLoading ? "Connecting to GitHub..." : "Continue with GitHub"}
    </Button>
  );
}
