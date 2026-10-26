import {INK,type Primitive,type Sheet} from './sheet';
import metrics from './fontMetrics.json';
const fontURL=new URL('./Onest-Regular.ttf',import.meta.url).href;
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function primitivePath(p:Exclude<Primitive,{kind:'text'}>):string{
 if(p.kind==='path')return `M${p.points.map(v=>v.join(' ')).join('L')}${p.closed?'Z':''}`;
 const {x,y,r}=p,c=.5522847498307936*r;
 // Cubic circles / three-quarter arcs; same paths in both formats.
 return `M${x+r} ${y}C${x+r} ${y+c} ${x+c} ${y+r} ${x} ${y+r}C${x-c} ${y+r} ${x-r} ${y+c} ${x-r} ${y}C${x-r} ${y-c} ${x-c} ${y-r} ${x} ${y-r}${p.arc?'':`C${x+c} ${y-r} ${x+r} ${y-c} ${x+r} ${y}Z`}`;
}
let fontPromise:Promise<ArrayBuffer>|undefined;
export const sheetFont=()=>fontPromise??=fetch(fontURL).then(r=>{if(!r.ok)throw Error('Не удалось загрузить шрифт чертежа.');return r.arrayBuffer();}).catch(e=>{fontPromise=undefined;throw e;});
export function svgDocument(sheet:Sheet,fontBase64:string):string{
 const items=sheet.items.map(p=>p.kind==='text'?`<text x="${p.x}" y="${p.y}" font-size="${p.height/metrics.capRatio}" text-anchor="${p.anchor??'start'}"${p.rotation?` transform="rotate(${p.rotation} ${p.x} ${p.y})"`:''}>${escape(p.text)}</text>`:`<path d="${primitivePath(p)}" stroke="black" stroke-width="${INK[p.ink].width}" fill="${p.kind==='path'&&p.fill?'black':'none'}"${INK[p.ink].dash?` stroke-dasharray="${INK[p.ink].dash!.join(' ')}"`:''}/>`).join('\n');
 return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${sheet.width}mm" height="${sheet.height}mm" viewBox="0 0 ${sheet.width} ${sheet.height}"><title>Учебный чертёж</title><defs><style>@font-face{font-family:DrawingOnest;src:url(data:font/ttf;base64,${fontBase64}) format('truetype')}text{font-family:DrawingOnest}</style></defs>${items}</svg>`;
}
export async function sheetSVG(sheet:Sheet){const font=new Uint8Array(await sheetFont());let binary='';for(let i=0;i<font.length;i+=8192)binary+=String.fromCharCode(...font.subarray(i,i+8192));return svgDocument(sheet,btoa(binary));}
/** True paths + embedded Unicode text. No canvas screenshots or raster intermediary. */
export async function sheetPDF(sheet:Sheet,fontBytes?:ArrayBuffer):Promise<Uint8Array>{
 const [{PDFDocument,rgb,degrees},{default:fontkit}]=await Promise.all([import('pdf-lib'),import('@pdf-lib/fontkit')]);
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);const font=await doc.embedFont(fontBytes??await sheetFont(),{subset:true});
 const k=72/25.4,page=doc.addPage([sheet.width*k,sheet.height*k]);
 for(const p of sheet.items){
  if(p.kind==='text'){
   const size=p.height/metrics.capRatio*k,w=font.widthOfTextAtSize(p.text,size),offset=p.anchor==='middle'?w/2:p.anchor==='end'?w:0;
   // SVG baseline and PDF baseline share the exact cap-height measured from the bundled static font.
   const angle=-(p.rotation??0),a=angle*Math.PI/180;
   page.drawText(p.text,{font,size,x:p.x*k-offset*Math.cos(a),y:(sheet.height-p.y)*k-offset*Math.sin(a),rotate:degrees(angle),color:rgb(0,0,0)});
  }else page.drawSvgPath(primitivePath(p),{x:0,y:sheet.height*k,scale:k,borderColor:rgb(0,0,0),borderWidth:INK[p.ink].width,borderDashArray:INK[p.ink].dash,color:p.kind==='path'&&p.fill?rgb(0,0,0):undefined});
 }
 return doc.save();
}
export function downloadDrawing(contents:BlobPart,name:string,type:string){const url=URL.createObjectURL(new Blob([contents],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
