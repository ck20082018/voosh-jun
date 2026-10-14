export const WORKSHOP_WIDTH = 1020;
export const WORKSHOP_HEIGHT = 660;

export function projectCell(x: number, y: number) {
  return {x: 510 + (x - y) * 58, y: 155 + (x + y) * 30};
}

export interface PartPose {readonly x: number; readonly y: number; readonly length: number; readonly radius: number}

// The same origin is used by the drawing, the part hit area and the drag preview.
export function partPose(cell: {x: number; y: number}, type: string, mill = false): PartPose {
  const c = projectCell(cell.x, cell.y);
  if (type === 'lathe') return {x: c.x - (mill ? 19 : 1), y: c.y - (mill ? 55 : 69), length: 45, radius: 9};
  if (type === 'warehouse') return {x: c.x - 17, y: c.y - 31, length: 42, radius: 8};
  return {x: c.x - 18, y: c.y - 34, length: 46, radius: 9};
}

export function objectBounds(cell: {x: number; y: number}, mill = false) {
  const c = projectCell(cell.x, cell.y);
  return {x: c.x + (mill ? 8 : 0), y: c.y - (mill ? 30 : 38), width: mill ? 120 : 110, height: mill ? 170 : 105};
}

export function workshopPoint(client: {x: number; y: number}, bounds: {left: number; top: number; width: number; height: number}) {
  return {x: (client.x - bounds.left) * WORKSHOP_WIDTH / bounds.width, y: (client.y - bounds.top) * WORKSHOP_HEIGHT / bounds.height};
}
