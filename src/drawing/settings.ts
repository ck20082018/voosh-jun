import type {DrawingDisplay} from '../drawingGeometry';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);
/** Imported author settings are untrusted. Keep this separate from geometry / production validation. */
export function validDrawingDisplay(v:unknown):v is DrawingDisplay{
 if(!object(v))return false;
 if(v.views!==undefined&&(!Array.isArray(v.views)||v.views.length>5||v.views.some(x=>!['main','end','section','detail','volume'].includes(x))))return false;
 if(v.dimensions!==undefined&&(!Array.isArray(v.dimensions)||v.dimensions.length>50||v.dimensions.some(d=>!object(d)||typeof d.id!=='string'||!d.id.length||d.id.length>200||d.label!==undefined&&typeof d.label!=='string'||!['length','outer','inner','thread'].includes(String(d.kind))||!['length','outer','inner'].includes(String(d.surface))||!finite(d.z0)||!finite(d.z1)||Number(d.z0)<0||Number(d.z1)<=Number(d.z0))))return false;
 if(v.detail!==undefined&&(!object(v.detail)||!finite(v.detail.z0)||!finite(v.detail.z1)||typeof v.detail.label!=='string'||Number(v.detail.z0)<0||Number(v.detail.z1)<=Number(v.detail.z0)))return false;
 if(object(v.detail)&&v.detail.thread!==undefined&&(!object(v.detail.thread)||!finite(v.detail.thread.pitch)||Number(v.detail.thread.pitch)<=0||!['inner','outer'].includes(String(v.detail.thread.surface))))return false;
 const s=v.sheet;if(s===undefined)return true;if(!object(s))return false;
 if(s.format!==undefined&&(typeof s.format!=='string'||!['A4','A3'].includes(s.format))||s.scale!==undefined&&(!finite(s.scale)||![.25,.5,1,2,4].includes(Number(s.scale))))return false;
 if(s.views!==undefined&&(!Array.isArray(s.views)||s.views.length>2||s.views.some(x=>!['end','detail'].includes(x))))return false;
 if(s.detail!==undefined&&(!object(s.detail)||!finite(s.detail.z0)||!finite(s.detail.z1)||Number(s.detail.z0)<0||Number(s.detail.z1)<=Number(s.detail.z0)||!finite(s.detail.scale)||![2,4,5].includes(Number(s.detail.scale))||!['inner','outer'].includes(String(s.detail.surface))))return false;
 if(s.dimensionOffsets!==undefined&&(!object(s.dimensionOffsets)||Object.keys(s.dimensionOffsets).length>50||Object.entries(s.dimensionOffsets).some(([k,p])=>k.length>200||['__proto__','prototype','constructor'].includes(k)||!object(p)||!finite(p.x)||!finite(p.y)||Math.abs(Number(p.x))>1000||Math.abs(Number(p.y))>1000)))return false;
 return true;
}
