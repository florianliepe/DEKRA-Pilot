import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export const Icons = {
  dashboard: (p: IconProps) => <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></Icon>,
  plan: (p: IconProps) => <Icon {...p}><path d="M4 19V5"/><path d="M4 7h11l-2 3 2 3H4"/><path d="M9 19h11"/></Icon>,
  risk: (p: IconProps) => <Icon {...p}><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4"/><path d="M12 16.5h.01"/></Icon>,
  meeting: (p: IconProps) => <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h3M8 17h6"/></Icon>,
  activity: (p: IconProps) => <Icon {...p}><path d="M3 12h4l2-6 4 12 2-6h6"/></Icon>,
  layers: (p: IconProps) => <Icon {...p}><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></Icon>,
  search: (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></Icon>,
  plus: (p: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  refresh: (p: IconProps) => <Icon {...p}><path d="M20 7h-5V2"/><path d="M20 7a8 8 0 1 0 1 8"/></Icon>,
  chevron: (p: IconProps) => <Icon {...p}><path d="m9 18 6-6-6-6"/></Icon>,
  arrow: (p: IconProps) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6"/></Icon>,
  check: (p: IconProps) => <Icon {...p}><path d="m5 12 4 4L19 6"/></Icon>,
  close: (p: IconProps) => <Icon {...p}><path d="m6 6 12 12M18 6 6 18"/></Icon>,
  menu: (p: IconProps) => <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16"/></Icon>,
  github: (p: IconProps) => <Icon {...p}><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7A5.4 5.4 0 0 0 19.4 4 5 5 0 0 0 19.3.5S18.2.1 15 2a13.4 13.4 0 0 0-7 0C4.8.1 3.7.5 3.7.5A5 5 0 0 0 3.6 4a5.4 5.4 0 0 0-1.4 3.7c0 5.4 3.5 6.6 6.8 7A4.8 4.8 0 0 0 8 18v4"/><path d="M8 19c-3 .9-3-1.5-4-2"/></Icon>,
  upload: (p: IconProps) => <Icon {...p}><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/></Icon>,
};
