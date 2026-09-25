"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const AUTOMATIC = "__automatic__";

type VoiceProviderId = "nonoh" | "voipstudio" | "twilio" | "plivo" | "vapi";

type VoiceProviderOption = {
	id: VoiceProviderId;
	label: string;
	configured: boolean;
};

type VoiceProviderSettings = {
	selectedId: VoiceProviderOption["id"] | null;
	invalid: boolean;
	canConfigure: boolean;
	options: VoiceProviderOption[];
	updatedAt: string | null;
};

export function VoiceProvider() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const settings = useQuery(trpc.settings.voiceProvider.queryOptions());
	const [draft, setDraft] = useState<VoiceProviderId | null | undefined>(undefined);

	const save = useMutation(
		trpc.settings.setVoiceProvider.mutationOptions({
			onSuccess: async () => {
				await cache.settings();
				setDraft(undefined);
				toast.success("Voice provider saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!settings.data) return null;
	const data = settings.data as VoiceProviderSettings;
	const selectedId = draft === undefined ? data.selectedId : draft;
	const selected = selectedId ?? AUTOMATIC;
	const dirty = draft !== undefined && draft !== data.selectedId;
	const selectedOption = data.options.find((option) => option.id === selectedId);
	const hasUnavailableSelection = Boolean(
		selectedOption && !selectedOption.configured,
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Voice provider</CardTitle>
				<CardDescription>
					The default provider for outbound calls made by agents. Agents can
					override it for an individual call.
				</CardDescription>
				<CardAction>
					<Button
						type="button"
						variant="outline"
						disabled={save.isPending || settings.isFetching || !data.canConfigure || !dirty}
						onClick={() => save.mutate({ provider: selectedId })}
					>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						Save
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="voice-provider">Default provider</FieldLabel>
						<Select
							value={selected}
							onValueChange={(value) =>
								setDraft(
									value === AUTOMATIC ? null : (value as VoiceProviderId),
								)
							}
							disabled={save.isPending || settings.isFetching || !data.canConfigure}
						>
							<SelectTrigger id="voice-provider" className="w-full">
								<SelectValue placeholder="Choose a provider" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value={AUTOMATIC}>
										Automatic — first configured provider
									</SelectItem>
									{data.options.map((option) => (
										<SelectItem
											key={option.id}
											value={option.id}
											disabled={!option.configured}
										>
											{option.label} — {option.configured ? "configured" : "not configured"}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<FieldDescription>
							Automatic preserves the legacy behavior. A selected provider is
							used whenever an agent does not specify one.
						</FieldDescription>
					</Field>
				</FieldGroup>
				{!data.canConfigure ? (
					<Alert>
						<AlertTitle>Read-only setting</AlertTitle>
						<AlertDescription>
							Only workspace owners and admins can change the default provider.
						</AlertDescription>
					</Alert>
				) : null}
				{data.invalid ? (
					<Alert variant="destructive">
						<AlertTitle>Saved provider is invalid</AlertTitle>
						<AlertDescription>
							The saved value is not a supported provider. Choose a valid option before
							making calls.
						</AlertDescription>
					</Alert>
				) : null}
				{hasUnavailableSelection ? (
					<Alert variant="destructive">
						<AlertTitle>Selected provider unavailable</AlertTitle>
						<AlertDescription>
							Complete its environment settings or choose another provider before
							making calls.
						</AlertDescription>
					</Alert>
				) : null}
			</CardContent>
		</Card>
	);
}
