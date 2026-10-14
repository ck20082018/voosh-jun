import { MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION, validateImageData } from './imageData';
export { MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION, MAX_TOTAL_IMAGE_BYTES, MAX_JSON_BYTES, validateImageData } from './imageData';
export type ImageDecoder = (dataURL: string) => Promise<{
    width: number;
    height: number;
}>;
export const browserDecode: ImageDecoder = async (dataURL) => {
    const image = new Image();
    image.src = dataURL;
    try {
        await image.decode();
    }
    catch {
        throw new Error('Не удалось декодировать изображение. Выберите исправный PNG, JPEG или WebP.');
    }
    return { width: image.naturalWidth, height: image.naturalHeight };
};
export async function decodeImage(dataURL: string, decoder: ImageDecoder = browserDecode): Promise<void> {
    validateImageData(dataURL);
    const d = await decoder(dataURL);
    if (!Number.isInteger(d.width) || !Number.isInteger(d.height) || d.width < 1 || d.height < 1 || d.width > MAX_IMAGE_DIMENSION || d.height > MAX_IMAGE_DIMENSION)
        throw new Error('Разрешение изображения: от 1 × 1 до 2048 × 2048 пикселей.');
}
export async function uploadImage(file: File, decoder: ImageDecoder = browserDecode): Promise<string> {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_IMAGE_BYTES)
        throw new Error('Выберите PNG, JPEG или WebP размером до 512 КиБ.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let raw = '';
    for (const b of bytes)
        raw += String.fromCharCode(b);
    const url = `data:${file.type};base64,${btoa(raw)}`;
    await decodeImage(url, decoder);
    return url;
}
