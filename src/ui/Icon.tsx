import type { SVGProps } from 'react';

/** Единый набор линейных иконок (сетка 24, штрих 1.75). Emoji в интерфейсе не используются. */
const paths = {
  hub: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  map: 'M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7zM9 4v13M15 7v13',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a1 1 0 0 0-1 1c0 2.2 1.6 4 4 4M16 6h3a1 1 0 0 1 1 1c0 2.2-1.6 4-4 4M12 13v4M8.5 20h7M10 17h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.5 3.6-6 8-6s8 2.5 8 6',
  editor: 'M4 5h5v5H4zM15 14h5v5h-5zM9 7.5h3a3 3 0 0 1 3 3V14',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M8.5 5v14M15.5 5v14',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  down: 'M5 9l7 7 7-7',
  up: 'M5 15l7-7 7 7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.3l2.8 2.8L16.3 9.4',
  xCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6',
  lock: 'M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM8 11V8a4 4 0 0 1 8 0v3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.2 2',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12.1v-.2',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6z',
  medal: 'M12 20a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM8.5 3h3l1.2 5.3M15.5 3h-3L11.3 8.3M12 12.5v3M10.8 14h2.4',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z',
  lathe: 'M3 19.5h18M5 19.5v-3.5h14v3.5M5 16V8.5h5V16M10 12h8.5M17 10.5v5.5M13 16v-2.4',
  mill: 'M3 21h18M5 21V4h13v5h-5M10 9V6M15 9v5M13 14h4M9 18h11M11 18v3M18 18v3M6 4v17',
  warehouse: 'M3 20V9.5L12 4l9 5.5V20M7 20v-6h10v6M7 14h10M12 14v6',
  blank: 'M7 8h11a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7M7 8a2 4 0 0 0 0 8 2 4 0 0 0 0-8z',
  ruler: 'M3.5 15.5 15.5 3.5l5 5-12 12zM7.5 11.5l2 2M10.5 8.5l2 2M13.5 5.5l2 2',
  gears: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1',
  cube: 'M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  cpu: 'M9 7h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  route: 'M8 18h5a3.5 3.5 0 0 0 0-7h-2a3.5 3.5 0 0 1 0-7h5M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  alert: 'M12 4 3 20h18zM12 10v4M12 17.2v.1',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  zoomIn: 'M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM20 20l-4.3-4.3M11 8v6M8 11h6',
  zoomOut: 'M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM20 20l-4.3-4.3M8 11h6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  flag: 'M6 21V4M6 5h11l-2 4 2 4H6',
  book: 'M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.6v.1',
  list: 'M8 6h12M8 12h12M8 18h12M4 6v.1M4 12v.1M4 18v.1',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  shield: 'M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6zM9 12l2.2 2.2L15.5 10',
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1 1-1.1 1.7M12 16.8v.1',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  layers: 'M12 4 3 9l9 5 9-5zM3 14l9 5 9-5',
  activity: 'M3 12h4l3-7 4 14 3-7h4',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8',
  hand: 'M9 11V5.5a1.5 1.5 0 0 1 3 0V10M12 10V4.5a1.5 1.5 0 0 1 3 0V10M15 10V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.7-2.3L4 14a1.5 1.5 0 0 1 2.4-1.8L9 14.5',
} as const;

export type IconName = keyof typeof paths;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** Заполнение фигуры (для состояний «пройдено»/«заполнено»). */
  filled?: boolean;
}

export function Icon({ name, size = 20, filled = false, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      fillOpacity={filled ? 0.18 : undefined}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`icon ${className ?? ''}`}
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
