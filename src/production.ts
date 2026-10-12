export type Stage = 'table' | 'loaded' | 'processing' | 'finished' | 'stored';
export type Action = 'select' | 'machine' | 'process' | 'warehouse' | 'reset';
export interface ProductionState { stage: Stage; selected: boolean; elapsed: number; count: number }
export const DURATION = 3000;
export class Production {
  private value: ProductionState = this.initial();
  private initial(): ProductionState { return { stage: 'table', selected: false, elapsed: 0, count: 0 }; }
  get state(): Readonly<ProductionState> { return { ...this.value }; }
  dispatch(action: Action): void {
    const s = this.value;
    if (action === 'reset') { this.value = this.initial(); return; }
    if (s.stage === 'processing') return;
    if (action === 'select' && (s.stage === 'table' || s.stage === 'finished')) s.selected = true;
    if (action === 'machine' && s.stage === 'table' && s.selected) { s.stage = 'loaded'; s.selected = false; }
    if (action === 'process' && s.stage === 'loaded') { s.stage = 'processing'; s.elapsed = 0; }
    if (action === 'warehouse' && s.stage === 'finished' && s.selected) { s.stage = 'stored'; s.selected = false; s.count = 1; }
  }
  tick(delta: number): void {
    if (this.value.stage !== 'processing' || !Number.isFinite(delta) || delta <= 0) return;
    this.value.elapsed = Math.min(DURATION, this.value.elapsed + delta);
    if (this.value.elapsed === DURATION) this.value.stage = 'finished';
  }
}
