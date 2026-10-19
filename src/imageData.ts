export const MAX_IMAGE_BYTES = 512 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 2048;
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
function rasterDimensions(raw:string,mime:string):{width:number;height:number} {
    const b=(i:number)=>raw.charCodeAt(i);
    const be16=(i:number)=>(b(i)<<8)|b(i+1);
    const be32=(i:number)=>b(i)*16777216+(b(i+1)<<16)+(b(i+2)<<8)+b(i+3);
    const le24=(i:number)=>b(i)|(b(i+1)<<8)|(b(i+2)<<16);
    if(mime==='image/png'&&raw.length>=33&&raw.slice(12,16)==='IHDR')return {width:be32(16),height:be32(20)};
    if(mime==='image/jpeg'){
        let i=2;
        while(i+8<raw.length){
            if(b(i++)!==255)break;
            while(b(i)===255)i++;
            const marker=b(i++);
            if(marker===0xda||marker===0xd9)break;
            const length=be16(i);
            if(length<2||i+length>raw.length)break;
            if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=8)return {width:be16(i+5),height:be16(i+3)};
            i+=length;
        }
    }
    if(mime==='image/webp'){
        const chunk=raw.slice(12,16);
        if(chunk==='VP8X'&&raw.length>=30)return {width:le24(24)+1,height:le24(27)+1};
        if(chunk==='VP8 '&&raw.length>=30&&raw.slice(23,26)==='\x9d\x01\x2a')return {width:(b(26)|(b(27)<<8))&0x3fff,height:(b(28)|(b(29)<<8))&0x3fff};
        if(chunk==='VP8L'&&raw.length>=25&&b(20)===0x2f)return {width:1+b(21)+((b(22)&0x3f)<<8),height:1+(b(22)>>6)+(b(23)<<2)+((b(24)&0xf)<<10)};
    }
    throw new Error('Не удалось прочитать размеры PNG, JPEG или WebP. Файл повреждён.');
}
export function validateImageData(dataURL:string):{bytes:number;mime:string;width:number;height:number} {
    const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataURL);
    if(!match||match[2].length%4!==0||match[2].length>Math.ceil(MAX_IMAGE_BYTES/3)*4)throw new Error('Изображение: только PNG, JPEG или WebP до 512 КиБ; SVG и HTML запрещены.');
    let raw:string;
    try{raw=atob(match[2]);}catch{throw new Error('Некорректные данные изображения.');}
    if(raw.length>MAX_IMAGE_BYTES)throw new Error('Изображение превышает 512 КиБ.');
    const png=raw.startsWith('\x89PNG\r\n\x1a\n'),jpeg=raw.startsWith('\xff\xd8\xff'),webp=raw.startsWith('RIFF')&&raw.slice(8,12)==='WEBP';
    if(!(match[1]==='image/png'&&png||match[1]==='image/jpeg'&&jpeg||match[1]==='image/webp'&&webp))throw new Error('Содержимое изображения не соответствует PNG, JPEG или WebP.');
    const size=rasterDimensions(raw,match[1]);
    if(size.width<1||size.height<1||size.width>MAX_IMAGE_DIMENSION||size.height>MAX_IMAGE_DIMENSION)throw new Error('Разрешение изображения: от 1 × 1 до 2048 × 2048 пикселей.');
    return {bytes:raw.length,mime:match[1],...size};
}
