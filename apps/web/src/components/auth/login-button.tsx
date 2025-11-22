"use client";

import { authClient } from "~/server/better-auth/client";
import { Button } from "~/components/ui/button";
import { Github } from "lucide-react";

export function LoginButton() {
    const handleLogin = async () => {
        await authClient.signIn.social({
            provider: "github",
            callbackURL: "/threads",
        });
    };

    return (
        <Button onClick={handleLogin} className="gap-2">
            <Github className="h-4 w-4" />
            Login with GitHub
        </Button>
    );
}
