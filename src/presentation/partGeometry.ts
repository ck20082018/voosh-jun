export interface ShaftSection {
    readonly diameter: number;
    readonly length: number;
}
// This is the same millimetre-to-drawing projection for the workshop and preview.
export function shaftSegments(total: number, diameter: number, sections: readonly ShaftSection[], length: number, radius: number) {
    const shoulder = length * Math.max(0, 1 - sections.reduce((sum, s) => sum + s.length, 0) / total);
    const out: {
        offset: number;
        length: number;
        radius: number;
    }[] = [];
    let offset = 0;
    if (shoulder > 0) {
        out.push({ offset, length: shoulder, radius });
        offset = shoulder;
    }
    for (const section of sections) {
        const l = length * section.length / total;
        out.push({ offset, length: l, radius: radius * section.diameter / diameter });
        offset += l;
    }
    return out;
}
