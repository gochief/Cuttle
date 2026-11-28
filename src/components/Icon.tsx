import type { SVGProps } from "react";
const paths = {
  folder:
    "M3 7V5a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z",
  file: "M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h6",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  branch:
    "M6 8v8m0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm12-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 0v2a5 5 0 0 1-5 5H6",
  clone: "M9 9h12v12H9ZM15 5V3H3v12h2",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  chevron: "m9 5 7 7-7 7",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  clock: "M12 8v5l3 2m7-3a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  globe:
    "M2 12h20M12 2c6 5 6 15 0 20-6-5-6-15 0-20m10 10a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  pen: "m16 3 5 5-12 12-6 1 1-6ZM13 6l5 5",
};
export type IconName = keyof typeof paths;
export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
