const isNumber = (val: number) => typeof val === 'number' && val === val;
const isStringEmpty = (val: string) => val.trim() === '';

export function isColor(strColor: string) {
    const RegExp = /^#[0-9A-F]{6}$/i;
    return !!RegExp.test(strColor);
}

export function isURL(str: string) {
    const pattern = new RegExp(
        '^(https?:\\/\\/)?' +
        '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' +
        '((\\d{1,3}\\.){3}\\d{1,3}))' +
        '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' +
        '(\\?[;&a-z\\d%_.~+=-]*)?' +
        '(\\#[-a-z\\d_]*)?$',
        'i'
    );
    return !!pattern.test(str);
}

export function isNonEmptyString(str: string) {
    return isString(str) && !isStringEmpty(str);
}

export function isString(str: string) {
    return typeof str === 'string';
}

export function isLengthLessThan(str: string, length: number) {
    return str.length < length;
}

export function isBoolean(bool: boolean) {
    return typeof bool === 'boolean';
}

export function isInteger(num: number) {
    return isNumber(num) && Number.isInteger(num);
}

export function isValidStringArray(array: string[]) {
    for (const string of array) {
        if (!isString(string)) {
            return false;
        }
    }
    return true;
}
