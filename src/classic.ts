import Phaser from 'phaser';
import { Production, DURATION, type Action } from './production';
import './classic.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<main><header><div><span class="eyebrow">ПРАКТИКУМ / 01</span><h1>Первый валик</h1><p>От металлической заготовки до готовой детали</p></div><div class="inventory"><span>ДЕТАЛЕЙ НА СКЛАДЕ</span><strong id="count">0 <small>/ 1</small></strong></div></header><section class="workshop"><div class="scene-top"><span>УЧЕБНЫЙ ЦЕХ</span><span>● Одна деталь · три этапа</span></div><div id="game" aria-label="Изометрический учебный завод"></div><div class="legend"><span>01 Подготовка</span><span>02 Обработка</span><span>03 Хранение</span></div></section><footer><div><span class="eyebrow" id="step">ШАГ 1 / 3</span><p id="hint" role="status" aria-live="polite"></p></div><div class="actions"><button id="process" disabled>Обработать</button><button id="reset" class="secondary">Начать заново</button></div></footer><div class="progress" role="progressbar" aria-label="Обработка детали" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="bar"></div></div><p class="note">Нажимайте на объекты в цехе. Выбранная деталь подсвечивается жёлтым.</p></main>`;
const production = new Production();
const hint = document.querySelector('#hint')!;
const count = document.querySelector('#count')!;
const step = document.querySelector('#step')!;
const processButton = document.querySelector<HTMLButtonElement>('#process')!;
const bar = document.querySelector<HTMLElement>('#bar')!;
const progress = document.querySelector<HTMLElement>('.progress')!;

class FactoryScene extends Phaser.Scene {
  private drawing!: Phaser.GameObjects.Graphics;
  private spinner = 0;
  create() {
    this.drawing = this.add.graphics();
    const label = (x: number, y: number, title: string, subtitle: string) => {
      this.add.text(x, y, title, { fontFamily: 'Arial', fontSize: '18px', color: '#344c4c', fontStyle: 'bold' }).setOrigin(.5);
      this.add.text(x, y + 25, subtitle, { fontFamily: 'Arial', fontSize: '13px', color: '#70827e' }).setOrigin(.5);
    };
    label(212, 360, 'Стол', 'Исходная заготовка');
    label(530, 398, 'Токарный станок', 'Установка и обработка');
    label(844, 330, 'Склад', 'Готовая деталь');
    this.add.zone(222, 215, 110, 48).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (production.state.stage === 'table') this.act('select');
    });
    this.add.zone(530, 262, 300, 230).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.act('machine'));
    this.add.zone(844, 225, 225, 190).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.act('warehouse'));
    // The part has its own hit area above the machine area.
    this.add.zone(540, 218, 145, 55).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (production.state.stage === 'finished') this.act('select');
      else this.act('machine');
    });
    processButton.onclick = () => this.act('process');
    document.querySelector<HTMLButtonElement>('#reset')!.onclick = () => this.act('reset');
    this.render();
  }
  private act(action: Action) { production.dispatch(action); this.render(); }
  update(_time: number, delta: number) {
    if (production.state.stage === 'processing') {
      production.tick(delta); this.spinner += delta / 140; this.render();
    }
  }
  private polygon(points: number[], color: number) {
    this.drawing.fillStyle(color).fillPoints(points.reduce<Phaser.Geom.Point[]>((a, _, i) => {
      if (i % 2 === 0) a.push(new Phaser.Geom.Point(points[i], points[i + 1])); return a;
    }, []), true);
  }
  private box(x: number, y: number, w: number, d: number, h: number, top: number, front: number, side: number) {
    this.polygon([x,y-h,x+w,y+d-h,x+w-d,y+2*d-h,x-d,y+d-h],top);
    this.polygon([x-d,y+d-h,x+w-d,y+2*d-h,x+w-d,y+2*d,x-d,y+d],front);
    this.polygon([x+w-d,y+2*d-h,x+w,y+d-h,x+w,y+d,x+w-d,y+2*d],side);
  }
  private cylinder(x: number, y: number, length: number, radius: number, finished: boolean) {
    const g = this.drawing;
    const segment = (sx: number, sy: number, len: number, r: number) => {
      this.polygon([sx,sy-r,sx+len,sy-r+len*.24,sx+len,sy+r+len*.24,sx,sy+r],0x9aaeb5);
      g.fillStyle(0xcbd7da).fillEllipse(sx,sy,r*.85,r*2);
      g.fillStyle(0x728b94).fillEllipse(sx+len,sy+len*.24,r*.85,r*2);
      g.lineStyle(2,0xe7eff0).lineBetween(sx+4,sy-r*.55,sx+len-3,sy-r*.55+len*.24);
    };
    if (finished) { segment(x,y,length*.28,radius*.6); segment(x+length*.26,y+length*.26*.24,length*.45,radius); segment(x+length*.7,y+length*.7*.24,length*.3,radius*.6); }
    else segment(x,y,length,radius);
    if (production.state.stage === 'processing') {
      const offset = Math.sin(this.spinner)*radius*.7;
      g.lineStyle(3,0xf3efe1).lineBetween(x+5,y+offset,x+length-5,y+length*.24+offset);
    }
  }
  private render() {
    const s = production.state, g = this.drawing; g.clear();
    // Fixed isometric projection; every object is drawn from primitives.
    this.polygon([500,58,970,213,540,430,65,270],0xe0e7df);
    g.lineStyle(1,0xd0dbd2,.85);
    for(let i=1;i<8;i++) {
      g.lineBetween(500-i*54,58+i*27,970-i*54,213+i*27);
      g.lineBetween(500+i*58,58+i*19,65+i*59,270+i*20);
    }
    g.fillStyle(0x60796e,.12).fillEllipse(220,305,235,68).fillEllipse(530,341,310,80).fillEllipse(842,279,235,60);
    this.box(135,244,20,12,64,0xa08b6b,0x8c795b,0x73664f);
    this.box(288,281,20,12,64,0xa08b6b,0x8c795b,0x73664f);
    this.box(175,285,20,12,64,0xa08b6b,0x8c795b,0x73664f);
    this.box(143,230,185,49,20,0xd5b98d,0xb49b75,0x988565);
    this.box(440,284,205,58,75,0x75998c,0x628477,0x496b61);
    this.box(430,224,232,55,24,0xaabdb4,0x79998c,0x668477);
    this.box(449,207,48,37,72,0x90afa1,0x6d9283,0x54796d);
    g.fillStyle(0x394f4c).fillEllipse(495,222,24,49);
    this.box(601,249,35,25,49,0x96b0a5,0x74958a,0x527469);
    g.lineStyle(7,0x546965).lineBetween(503,249,607,274);
    g.fillStyle(0xd5ded7).fillCircle(465,253,9); g.lineStyle(2,0x496b61).strokeCircle(465,253,9);
    g.fillStyle(s.stage==='processing'?0xeac36b:0xb3c8bb).fillCircle(462,274,4);
    this.box(772,228,156,45,16,0xc5b89f,0xa7997e,0x8e846d);
    this.box(781,218,10,8,73,0x8b9d93,0x70897c,0x586e64);
    this.box(911,249,10,8,73,0x8b9d93,0x70897c,0x586e64);
    this.box(781,149,140,38,12,0xc7d4c8,0x9dae9f,0x809688);
    g.lineStyle(2,0x8fa497,.7).strokeEllipse(840,229,91,32);
    if(s.selected) {
      const [x,y] = s.stage==='table'?[222,223]:[548,223];
      g.lineStyle(3,0xc9a44b).strokeEllipse(x,y,146,61);
    }
    if(s.stage==='table') this.cylinder(180,205,83,15,false);
    if(['loaded','processing','finished'].includes(s.stage)) this.cylinder(501,207,91,16,s.stage==='finished');
    if(s.stage==='stored') this.cylinder(802,207,70,14,true);
    const hints = {
      table: s.selected ? 'Заготовка выбрана. Нажмите на токарный станок.' : 'Нажмите на металлическую заготовку на столе.',
      loaded: 'Заготовка установлена. Нажмите «Обработать».',
      processing: `Обработка… ${Math.floor(s.elapsed / DURATION * 100)}%. Дождитесь завершения.`,
      finished: s.selected ? 'Деталь выбрана. Нажмите на склад.' : 'Валик готов. Нажмите на него, чтобы выбрать.',
      stored: 'Готово! Ступенчатый валик отправлен на склад.'
    };
    hint.textContent = hints[s.stage];
    count.innerHTML = `${s.count} <small>/ 1</small>`;
    step.textContent = s.stage==='stored'?'ЗАДАНИЕ ВЫПОЛНЕНО':`ШАГ ${s.stage==='table'?1:s.stage==='finished'?3:2} / 3`;
    processButton.disabled = s.stage!=='loaded';
    processButton.textContent = s.stage==='processing'?'Обработка…':'Обработать';
    bar.style.width = `${s.elapsed/DURATION*100}%`;
    progress.setAttribute('aria-valuenow',String(Math.floor(s.elapsed/DURATION*100)));
    progress.style.opacity = s.stage==='processing'?'1':'.35';
  }
}
new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 1040, height: 460, backgroundColor: '#f1f4ec', scene: FactoryScene, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH } });
