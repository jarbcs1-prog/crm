export default function Loading() {
	return (
		<div className="animate-pulse p-6">
			<div className="h-6 w-32 rounded bg-muted" />
			<div className="mt-6 grid gap-4">
				<div className="h-24 rounded bg-muted" />
				<div className="h-24 rounded bg-muted" />
			</div>
		</div>
	);
}
