"use client";

import Add from "@carbon/icons-react/es/Add";
import Close from "@carbon/icons-react/es/Close";
import Filter from "@carbon/icons-react/es/Filter";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Separator } from "@crm/ui/components/separator";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo, useState } from "react";
import { deserializeVqb, serializeVqb, vqbSummary } from "./vqb-serializer";
import {
	isValueOperator,
	operatorsForField,
	type VqbClause,
	type VqbField,
} from "./vqb-types";

function newClause(field: string): VqbClause {
	return {
		id: Math.random().toString(36).slice(2, 9),
		field,
		operator: "contains",
		value: "",
		conjunction: "and",
	};
}

export function VisualQueryBuilder({
	fields,
	queryKey = "vqb",
	label = "Filters",
}: {
	fields: VqbField[];
	queryKey?: string;
	label?: string;
}) {
	const [raw, setRaw] = useQueryState(queryKey, parseAsString.withDefault(""));
	const clauses = useMemo(() => deserializeVqb(raw), [raw]);
	const [open, setOpen] = useState(false);

	const update = useCallback(
		(next: VqbClause[]) => {
			void setRaw(serializeVqb(next) || null);
		},
		[setRaw],
	);

	const addClause = useCallback(() => {
		const field = fields[0]?.id ?? "name";
		update([...clauses, newClause(field)]);
	}, [clauses, fields, update]);

	const removeClause = useCallback(
		(id: string) => {
			update(clauses.filter((c) => c.id !== id));
		},
		[clauses, update],
	);

	const patchClause = useCallback(
		(id: string, patch: Partial<VqbClause>) => {
			update(clauses.map((c) => (c.id === id ? { ...c, ...patch } : c)));
		},
		[clauses, update],
	);

	const clearAll = useCallback(() => {
		update([]);
		setOpen(false);
	}, [update]);

	const hasFilters = clauses.length > 0;
	const summary = vqbSummary(clauses);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5"
					aria-label="Open visual query builder"
				>
					<Filter />
					{label}
					{hasFilters && (
						<span className="rounded-sm bg-primary px-1 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">
							{clauses.length}
						</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="flex w-[560px] max-w-[calc(100vw-2rem)] flex-col gap-3 p-3"
			>
				<div className="flex items-center justify-between gap-2">
					<p className="text-xs font-medium">Visual query builder</p>
					<div className="flex items-center gap-1">
						{hasFilters && (
							<Button variant="ghost" size="xs" onClick={clearAll}>
								<TrashCan />
								Clear
							</Button>
						)}
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={() => setOpen(false)}
							aria-label="Close"
						>
							<Close />
						</Button>
					</div>
				</div>

				{hasFilters && (
					<p className="rounded-md bg-muted px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
						{summary}
					</p>
				)}

				<div className="flex max-h-[320px] flex-col gap-2 overflow-auto pr-1">
					{clauses.length === 0 ? (
						<div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
							No filters. Add a clause to start building a view — it is saved in
							the URL so you can share it.
						</div>
					) : (
						clauses.map((clause, index) => {
							const field =
								fields.find((f) => f.id === clause.field) ?? fields[0];
							if (!field) return null;
							const operators = operatorsForField(field);
							const needsValue = isValueOperator(clause.operator as never);

							return (
								<div
									key={clause.id}
									className="flex flex-col gap-2 rounded-lg border bg-card p-2.5"
								>
									{index > 0 && (
										<div className="flex items-center gap-2">
											<Separator className="flex-1" />
											<Select
												value={clause.conjunction}
												onValueChange={(v) =>
													patchClause(clause.id, { conjunction: v as never })
												}
											>
												<SelectTrigger
													size="sm"
													className="h-6 w-20 gap-1 text-xs"
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="and">AND</SelectItem>
													<SelectItem value="or">OR</SelectItem>
												</SelectContent>
											</Select>
											<Separator className="flex-1" />
										</div>
									)}

									<div className="flex flex-wrap items-center gap-2">
										<Select
											value={clause.field}
											onValueChange={(v) => {
												const nextField = fields.find((f) => f.id === v);
												const ops = nextField
													? operatorsForField(nextField)
													: operators;
												const stillValid = ops.some(
													(o) => o.value === clause.operator,
												);
												patchClause(clause.id, {
													field: v,
													operator: stillValid
														? clause.operator
														: (ops[0]?.value ?? "contains"),
												});
											}}
										>
											<SelectTrigger size="sm" className="min-w-28 flex-1">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{fields.map((f) => (
													<SelectItem key={f.id} value={f.id}>
														{f.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>

										<Select
											value={clause.operator}
											onValueChange={(v) =>
												patchClause(clause.id, { operator: v as never })
											}
										>
											<SelectTrigger size="sm" className="min-w-36 flex-1">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{operators.map((op) => (
													<SelectItem key={op.value} value={op.value}>
														{op.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>

										{needsValue &&
											(field.type === "select" && field.options ? (
												<Select
													value={clause.value}
													onValueChange={(v) =>
														patchClause(clause.id, { value: v })
													}
												>
													<SelectTrigger size="sm" className="min-w-36 flex-1">
														<SelectValue placeholder="Value" />
													</SelectTrigger>
													<SelectContent>
														{field.options.map((opt) => (
															<SelectItem key={opt.value} value={opt.value}>
																{opt.label}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											) : (
												<Input
													value={clause.value}
													onChange={(e) =>
														patchClause(clause.id, { value: e.target.value })
													}
													placeholder={field.placeholder ?? "Value"}
													className="h-7 min-w-32 flex-1 text-xs"
												/>
											))}

										<Button
											variant="ghost"
											size="icon-xs"
											aria-label="Remove clause"
											onClick={() => removeClause(clause.id)}
											className="shrink-0"
										>
											<Close />
										</Button>
									</div>
								</div>
							);
						})
					)}
				</div>

				<div className="flex items-center justify-between gap-2 pt-1">
					<Button
						variant="outline"
						size="sm"
						onClick={addClause}
						className="gap-1"
					>
						<Add />
						Add clause
					</Button>
					<p className="text-[11px] text-muted-foreground">
						Inspired by Gridex Visual Query Builder. Saved to{" "}
						<code className="rounded bg-muted px-1 py-0.5">?{queryKey}=</code>
					</p>
				</div>
			</PopoverContent>
		</Popover>
	);
}
