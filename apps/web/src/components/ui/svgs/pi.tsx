import type { SVGProps } from "react";

const Pi = (props: SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 800 800">
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
    />
    <path
      fill="currentColor"
      d="M517.36 400H634.72V634.72H517.36Z"
    />
  </svg>
);

export { Pi };
