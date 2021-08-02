export function uvarint64ToBuf(uint: number) {
    const result = [];

    while (uint >= 0x80) {
        result.push((uint & 0xff) | 0x80);
        uint >>>= 7;
    }

    result.push(uint | 0);

    return new Buffer(result);
}
