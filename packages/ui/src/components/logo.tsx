import type * as React from "react";

const Logo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 256 256"
		fill="none"
		{...props}
		aria-label="Shelf-Thought, Inc. Logo"
	>
		<g transform="translate(38,28)">
			<rect x="0" y="76" width="31" height="126" rx="5" fill="currentColor" opacity="0.7" />
			<rect x="45" y="45" width="31" height="157" rx="5" fill="currentColor" />
			<rect x="90" y="14" width="38" height="188" rx="5" fill="currentColor" opacity="0.85" />
			<rect x="142" y="58" width="31" height="144" rx="5" fill="currentColor" opacity="0.7" />
			<path d="M-9 218 H184" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
		</g>
	</svg>
);

export default Logo;
