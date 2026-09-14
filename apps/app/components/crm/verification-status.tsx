import type { ContactVerificationStatus } from "@crm/db/enums";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";

const PRESENTATION: Record<
	ContactVerificationStatus,
	{ label: string; tone: StatusTone; busy?: boolean }
> = {
	UNVERIFIED: { label: "Unverified", tone: "neutral" },
	VERIFYING: { label: "Verifying", tone: "info", busy: true },
	NEEDS_HUMAN: { label: "Needs human review", tone: "warning" },
	VERIFIED: { label: "Verified", tone: "success" },
};

export function VerificationIndicator({
	status,
	title,
	className,
}: {
	status: ContactVerificationStatus;
	title?: string | null;
	className?: string;
}) {
	const { label, tone, busy } = PRESENTATION[status];

	return (
		<StatusIndicator
			tone={tone}
			busy={busy}
			label={label}
			title={title ?? undefined}
			className={className}
		/>
	);
}

export const VERIFICATION_FACET_OPTIONS = (
	Object.keys(PRESENTATION) as ContactVerificationStatus[]
).map((value) => ({ value, label: PRESENTATION[value].label }));
