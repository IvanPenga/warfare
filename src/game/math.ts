// Trigonometry for the simulation. `Math.sin` and `Math.cos` may differ in the last bits between browsers, which would
// make two players' games drift apart. These use only + - * /, which every engine computes the same way (IEEE 754).

const halfTurn = 180;
/** π to double precision, written out so it never depends on the engine. */
const pi = 3.141592653589793;

/** Sine of an angle in degrees. Accurate to about 1e-15. */
export function sinDegrees(degrees: number): number {
    // Reduce to [-180, 180), then fold into [-90, 90] where the series converges quickly.
    let angle = degrees - 360 * Math.floor((degrees + halfTurn) / 360);

    if (angle > 90) {
        angle = halfTurn - angle;
    } else if (angle < -90) {
        angle = -halfTurn - angle;
    }
    // Rounding would give 0.9999999999999999 at the quarter turns; straight up and down should be exact.
    if (angle === 90 || angle === -90) {
        return angle / 90;
    }
    const x = (angle * pi) / halfTurn;
    const x2 = x * x;
    // Taylor series up to x^23, evaluated from the innermost term (Horner's method). At ±90° the last term is below
    // the precision of a double.
    let sum = 1;

    for (let term = 11; term >= 1; term--) {
        sum = 1 - (x2 / (2 * term * (2 * term + 1))) * sum;
    }

    return x * sum;
}

/** Cosine of an angle in degrees. */
export function cosDegrees(degrees: number): number {
    return sinDegrees(degrees + 90);
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
