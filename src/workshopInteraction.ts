import type {FactoryCore, Command} from './core';

export interface PartDrag {
  readonly sourceId: string;
  readonly sourceKind: string;
  readonly itemId: string;
  readonly target: 'machine' | 'warehouse';
  readonly transfer: 'install' | 'take' | null;
}

// Gestures use exactly the same select → command → target path as the buttons.
export function beginPartDrag(core: FactoryCore): PartDrag | null {
  const s = core.state;
  if (!s.location || !s.item || s.target) return null;
  const command: Command = s.location.kind === 'table' ? 'install' : s.location.kind === 'warehouse' ? 'take' : 'store';
  const selection = command === 'take' ? s.location.id : s.item.blankId;
  if (!core.click(selection) || !core.can(command) || !core.command(command)) return null;
  const pending = core.state;
  return {sourceId: s.location.id, sourceKind: s.location.kind, itemId: s.item.blankId, target: pending.target!, transfer: pending.transfer};
}

function ownsTransfer(core: FactoryCore, drag: PartDrag) {
  const s = core.state;
  return s.location?.id === drag.sourceId && s.location.kind === drag.sourceKind && s.item?.blankId === drag.itemId && s.target === drag.target && s.transfer === drag.transfer;
}

export function cancelPartDrag(core: FactoryCore, drag: PartDrag) {
  if (ownsTransfer(core, drag) && core.can('cancel')) core.command('cancel');
}

export function finishPartDrag(core: FactoryCore, drag: PartDrag, targetId: string | null) {
  if (!ownsTransfer(core, drag)) return false;
  const moved = !!targetId && core.click(targetId);
  if (!moved) cancelPartDrag(core, drag);
  return moved;
}
