import type { SVGProps } from "react";

const Pi = (props: SVGProps<SVGSVGElement>) => (
  <svg {...props} fill="none" viewBox="0 0 100 100">
    <path
      d="M18 28h64"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="12"
    />
    <path
      d="M36 28v44c0 7.2-4.8 12-12 12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="12"
    />
    <path
      d="M64 28v44c0 7.2 4.8 12 12 12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="12"
    />
  </svg>
);

export { Pi };
