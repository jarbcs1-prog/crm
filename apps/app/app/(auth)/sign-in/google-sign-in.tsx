"use client";

import { signIn } from "@crm/auth/client";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";

export function GoogleSignIn() {
	const [pending, setPending] = useState(false);

	async function handleClick() {
		setPending(true);

		const origin = window.location.origin;

		try {
			const { error } = await signIn.social({
				provider: "google",
				callbackURL: `${origin}/`,
				errorCallbackURL: `${origin}/sign-in`,
			});

			if (error) {
				toast.error(error.message ?? "Could not reach the sign-in service.");
				setPending(false);
			}
		} catch (err) {
			const message =
				err instanceof TypeError && err.message.includes("Failed to fetch")
					? "Could not reach the sign-in service. If you have a browser extension blocking requests, try disabling it and retry."
					: err instanceof Error
						? err.message
						: "Could not reach the sign-in service.";
			toast.error(message);
			setPending(false);
		}
	}

	return (
		<Button
			className="w-full"
			disabled={pending}
			onClick={handleClick}
			type="button"
			variant="outline"
		>
			{pending ? (
				<Spinner data-icon="inline-start" />
			) : (
				<GoogleLogo data-icon="inline-start" className="size-4" />
			)}
			Continue with Google
		</Button>
	);
}
