// Scalar expf arithmetic of macOS arm64 libsystem_m, distinct from vexpf.
// Binary64 FMA and the range-reduction table preserve native rounding.
import { fma64 } from './modal-poles.mjs';
const view = new DataView(new ArrayBuffer(8));
function from64(word) { view.setBigUint64(0, word); return view.getFloat64(0); }
const TABLE = [
  0x3ff0000000000000n, 0x3feff63da9fb3335n, 0x3fefec9a3e778061n, 0x3fefe315e86e7f85n,
  0x3fefd9b0d3158574n, 0x3fefd06b29ddf6den, 0x3fefc74518759bc8n, 0x3fefbe3ecac6f383n,
  0x3fefb5586cf9890fn, 0x3fefac922b7247f7n, 0x3fefa3ec32d3d1a2n, 0x3fef9b66affed31bn,
  0x3fef9301d0125b51n, 0x3fef8abdc06c31ccn, 0x3fef829aaea92de0n, 0x3fef7a98c8a58e51n,
  0x3fef72b83c7d517bn, 0x3fef6af9388c8dean, 0x3fef635beb6fcb75n, 0x3fef5be084045cd4n,
  0x3fef54873168b9aan, 0x3fef4d5022fcd91dn, 0x3fef463b88628cd6n, 0x3fef3f49917ddc96n,
  0x3fef387a6e756238n, 0x3fef31ce4fb2a63fn, 0x3fef2b4565e27cddn, 0x3fef24dfe1f56381n,
  0x3fef1e9df51fdee1n, 0x3fef187fd0dad990n, 0x3fef1285a6e4030bn, 0x3fef0cafa93e2f56n,
  0x3fef06fe0a31b715n, 0x3fef0170fc4cd831n, 0x3feefc08b26416ffn, 0x3feef6c55f929ff1n,
  0x3feef1a7373aa9cbn, 0x3feeecae6d05d866n, 0x3feee7db34e59ff7n, 0x3feee32dc313a8e5n,
  0x3feedea64c123422n, 0x3feeda4504ac801cn, 0x3feed60a21f72e2an, 0x3feed1f5d950a897n,
  0x3feece086061892dn, 0x3feeca41ed1d0057n, 0x3feec6a2b5c13cd0n, 0x3feec32af0d7d3den,
  0x3feebfdad5362a27n, 0x3feebcb299fddd0dn, 0x3feeb9b2769d2ca7n, 0x3feeb6daa2cf6642n,
  0x3feeb42b569d4f82n, 0x3feeb1a4ca5d920fn, 0x3feeaf4736b527dan, 0x3feead12d497c7fdn,
  0x3feeab07dd485429n, 0x3feea9268a5946b7n, 0x3feea76f15ad2148n, 0x3feea5e1b976dc09n,
  0x3feea47eb03a5585n, 0x3feea34634ccc320n, 0x3feea23882552225n, 0x3feea155d44ca973n,
  0x3feea09e667f3bcdn, 0x3feea012750bdabfn, 0x3fee9fb23c651a2fn, 0x3fee9f7df9519484n,
  0x3fee9f75e8ec5f74n, 0x3fee9f9a48a58174n, 0x3fee9feb564267c9n, 0x3feea0694fde5d3fn,
  0x3feea11473eb0187n, 0x3feea1ed0130c132n, 0x3feea2f336cf4e62n, 0x3feea427543e1a12n,
  0x3feea589994cce13n, 0x3feea71a4623c7adn, 0x3feea8d99b4492edn, 0x3feeaac7d98a6699n,
  0x3feeace5422aa0dbn, 0x3feeaf3216b5448cn, 0x3feeb1ae99157736n, 0x3feeb45b0b91ffc6n,
  0x3feeb737b0cdc5e5n, 0x3feeba44cbc8520fn, 0x3feebd829fde4e50n, 0x3feec0f170ca07ban,
  0x3feec49182a3f090n, 0x3feec86319e32323n, 0x3feecc667b5de565n, 0x3feed09bec4a2d33n,
  0x3feed503b23e255dn, 0x3feed99e1330b358n, 0x3feede6b5579fdbfn, 0x3feee36bbfd3f37an,
  0x3feee89f995ad3adn, 0x3feeee07298db666n, 0x3feef3a2b84f15fbn, 0x3feef9728de5593an,
  0x3feeff76f2fb5e47n, 0x3fef05b030a1064an, 0x3fef0c1e904bc1d2n, 0x3fef12c25bd71e09n,
  0x3fef199bdd85529cn, 0x3fef20ab5fffd07an, 0x3fef27f12e57d14bn, 0x3fef2f6d9406e7b5n,
  0x3fef3720dcef9069n, 0x3fef3f0b555dc3fan, 0x3fef472d4a07897cn, 0x3fef4f87080d89f2n,
  0x3fef5818dcfba487n, 0x3fef60e316c98398n, 0x3fef69e603db3285n, 0x3fef7321f301b460n,
  0x3fef7c97337b9b5fn, 0x3fef864614f5a129n, 0x3fef902ee78b3ff6n, 0x3fef9a51fbc74c83n,
  0x3fefa4afa2a490dan, 0x3fefaf482d8e67f1n, 0x3fefba1bee615a27n, 0x3fefc52b376bba97n,
  0x3fefd0765b6e4540n, 0x3fefdbfdad9cbe14n, 0x3fefe7c1819e90d8n, 0x3feff3c22b8f71f1n,
];
const SCALE = from64(0x40671547652b82fen);
const SHIFT = from64(0x4338000000000000n);
const C2 = from64(0x3eeebfbdff30d656n);
const C1 = from64(0x3f762e4453e10daen);

export function nativeScalarExp(value) {
  const x = Math.fround(value);
  if (Math.abs(x) >= 128 || !Number.isFinite(x)) {
    if (Number.isNaN(x)) return NaN;
    return x < 0 ? 0 : Infinity;
  }
  const shifted = fma64(SCALE, x, SHIFT);
  view.setFloat64(0, shifted);
  const integerBits = view.getBigUint64(0);
  const n = shifted - SHIFT;
  const reduced = fma64(SCALE, x, -n);
  const scaleWord = BigInt.asUintN(64, TABLE[Number(integerBits & 127n)] + (integerBits << 45n));
  const scale = from64(scaleWord);
  const polynomial = fma64(C2, reduced, C1);
  return Math.fround(fma64(polynomial * reduced, scale, scale));
}
