// Instruction-order arm64 libsystem_m pow(double,double).
// Mathematical tables only; no piano models, captured results or Math.pow.
import {fma64} from './modal-poles.mjs';
const view = new DataView(new ArrayBuffer(8));
const number = word => { view.setBigUint64(0, BigInt.asUintN(64, word)); return view.getFloat64(0); };
const bits = x => { view.setFloat64(0, x); return view.getBigUint64(0); };
const words = text => text.trim().split(/\s+/).map(x => BigInt('0x' + x));
const logCoefficients = words(`bfc714b312ffc98e 3fca619f928980a6 bfcec709dd391af8 3fd2776c50e28d61 bfd71547652b82c7 3fdec709dc3a0400
3c5746f307c00c8e bfe71547652b82fe bc677aa5cbc36d0f 3ff71547652b82fe 3c7777cbae0ed1aa`).map(number);
const logTable = words(`000000003ff00000 0000000000000000 bc0ebef93fefc068 3f8706adaf949f49 3bab0b5d3fef81a8 3f96f6435f8f3269
3c2ec7643fef445d 3fa11d9d6edefdb8 3bbbc33d3fef0871 3fa6aa8c69f82995 3b8261bf3feecc32 3fac4a04287d6529
bb6669b23fee920f 3fb0e0c68e424ace bc0ca7313fee56ee 3fb3add69167a803 bc20d8513fee1e52 3fb6617ac26d3c85
bbc630d63fede50f 3fb92246d1c79540 3b74d1953fedad92 3fbbd24b77dbb164 3c043bb83fed7712 3fbe7af7c8933e03
3c6e54c13fed411b 3fc090e9025eddd4 3c1ef8a03fed0cfe 3fc1db051c140737 bc117e843fecd75d 3fc33127811d49f6
bc15ffe33feca3c2 3fc47cbbf2792a04 3bf265a13fec72bb 3fc5b9eaf8e6028b 3c423d8f3fec404b 3fc70275f1837cd6
3c438f233fec0df8 3fc84c8ea3631e5b 3bca3acf3febdc79 3fc9937c528da973 bb9531f63febac9a 3fcad1d89ecd0361
3c6563203feb7d57 3fcc0e457f1a4606 bc0c163d3feb4e23 3fcd4c6ec7f0fa9b bbba40e13feb2043 3fce83b51de1e130
bbc7e2273feaf2f4 3fcfb929fcb47417 bc1c14b63feac4f8 3fd07aa91b2ca230 3bd5ff933fea985d 3fd1150405368efc
3c1cf38b3fea6c72 3fd1adfba4172d24 3c054efc3fea41fc 3fd242d294235c3a bba4d3ba3fea1613 3fd2ddbbfb7f3c85
bc5100723fe9ec65 3fd371b8e9222827 bc7cd2013fe9c1f1 3fd4096a3fa76078 3bdf75713fe999e1 3fd49976c7cfb747
bc041a1c3fe971c7 3fd52a89b6126155 bbd3ca043fe9495a 3fd5bdb10e1494ce 3c039bdd3fe92122 3fd65101a7359962
3b93fcad3fe8fa0a 3fd6e11602431b0e 3c3c1b243fe8d2f8 3fd771f64145b29f 3c2f706a3fe8ada3 3fd7fd3a0cd1729b
3bd918b83fe887a8 3fd88bc1f2b8fde1 bc2608613fe861f5 3fd91a168bad4093 bbfe1d823fe83bac 3fd9ab83601c2e99
bc2aee253fe81812 3fda338d65098fbf 3c1a69003fe7f4e7 3fdabab52f19a9cb bc0f037e3fe7d08a 3fdb47463d06a5f0
3c2340b73fe7adab 3fdbcedccd4da020 bbed72fc3fe78ac8 3fdc574b4f99ab6d bc2e1aae3fe7674e 3fdce2d8491411da
bc5131033fe74516 3fdd6a3ba17a98be bc118bbe3fe7237e 3fddefe824a6fe07 3c2e68a13fe701f8 3fde760f0bc2be8b
3c3ea09e3fe6e2c1 3fdef3a91e17bbc9 bc6f56bb3fe6c240 3fdf77299fcad5de 3c4a86963fe6a196 3fdffc0dbd620500
bc25c2883fe6810c 3fe04097743d5c6f 3c7fac703fe66156 3fe081d335d14e25 3c33a9f83fe6421b 3fe0c26c86b500df
3c6397df3fe6239f 3fe101d26a8d3ec4 3c4eed683fe6057d 3fe140d32757ef1b bbdc85393fe5e6c8 3fe181602d908fc1
3c257ab03fe5c88f 3fe1c1412597d32d 3bc639043fe5ac59 3fe1fd31c7e401e5 3c5c090a3fe58e2f 3fe23d9f51b99eb2
3c167a3e3fe572b0 3fe278a8c472c40f bbf2e2123fe5552c bfda8f468bea6bab 3c50b09f3fe538c4 bfda1401a35e2207
3c3d724e3fe51da3 bfd99dad548d5854 3bdb2df33fe5014f bfd9217b478247c6 3c7dc05c3fe4e5f6 bfd8a8f65b8148dc
bc6280263fe4cb44 bfd832b8e69895b4 bc42ec4d3fe4af97 bfd7b78304d09278 3be07f8f3fe494df bfd73ff3131de57a
3c5aa8043fe47a6e bfd6c907a7936f76 bc23a9d13fe46037 bfd6528920cd0775 3c157e153fe44758 bfd5e190433aef0e
bc1c5e8c3fe42d10 bfd56998ac049478 bc26d1ef3fe414a2 bfd4f9884d6cfb2f 3c57b5cf3fe3faa2 bfd481adba3bc479
3c4c44373fe3e1a4 bfd40de517e6879c bc702b7b3fe3c990 bfd39dce8d0c6f05 3c7803ce3fe3b1bb bfd32e56a8c00a1e
bc76ff603fe398b0 bfd2b8a31c011109 3bd74b4a3fe380a5 bfd24714e481adf7 3bd6010c3fe36a2c bfd1dc7279db548f
3c48b8973fe351dc bfd16889c7153834 bc2a84b23fe339e9 bfd0f5cd7fa7752c bbd88c373fe323ac bfd08ac35435c943
bbc6fbf93fe30c53 bfd019dc059d0e54 3bf111ca3fe2f6db bfcf6320a3e9eb20 bbfb7cc43fe2e05b bfce87862d120f6b
bbc4f1023fe2ca3a bfcdae8b05ec1659 3c056e0a3fe2b461 bfccd75698d83d8e 3bf96f3e3fe29f22 bfcc051d7f25d8c7
bbec0f453fe28808 bfcb1f77901c26d4 bbf3bc703fe27389 bfca52c7fa334e41 bbbf1f003fe25d32 bfc972ab200ae538
bc6a2c6d3fe249c6 bfc8aef62d76aa72 3c41beab3fe233c6 bfc7d04afe225801 bc54f6153fe21f57 bfc70088de1f5b2d
3c290e853fe20b41 bfc6336ad8a92825 bba6ad5e3fe1f655 bfc55cd01eaa9487 3bc5753a3fe1e203 bfc48b713902f7fe
bbdbbf393fe1ce6e bfc3c0cc1d1b1692 bb8ae1d33fe1bb6e bfc2fb577a193876 bbd4d76f3fe1a8ac bfc2379731e9df8f
3c0bb1b03fe194f0 bfc168c50866af19 3c3a48a53fe18154 bfc09a5bcb833e9e 3ba5a0983fe16ed7 bfbfadd6b7f005b1
3c0b41903fe15b12 bfbe0a139ddec9d0 bc4080e43fe14803 bfbc73a3428818bc 3bc9b8cb3fe1358a bfbae8051978c11b
bc2d8b833fe12303 bfb9598fa7feff2b bba7a1293fe11141 bfb7da11dd576bbe bbe388f73fe0fe07 bfb63919388d8212
3bedc80c3fe0ed3a bfb4cb396209a15a 3c597adf3fe0da57 bfb32e39f0a97dd1 3bfa2e1c3fe0ca09 bfb1c83bbb91b133
3b44b8943fe0b80b bfb03b9bf822af8e 3bc4ae6c3fe0a76c bfad977378a15b0c bc473d493fe095dd bfaa8b0f9d7eed2f
3bfc4c603fe084a8 bfa78b28a5f18eb0 bbc08d1e3fe07294 bfa461023c6c2b3f 3b9e5abc3fe062fa bfa1a30ab127d27f
bbf9605e3fe05187 bf9d1dafa56778af 3bcf176c3fe04027 bf96f5700660f22d 3c1200bd3fe02fe4 bf912c35b1e2912e
bc1b6a1c3fe01f94 bf86b1027d8347ea 3b806a723fe00f11 bf75b2440dc383d5 000000003fe00000 0000000000000000`);
const expCoefficients = words(`3d25e52272171bcd 3dc3b2a8abdac87b 3e5c6b08d783107a 3eeebfbdff82bda7 3f762e42fefa39ef`).map(number);
const expTable = words(`3ff0000000000000 0000000000000000 3ff0163da9fb3335 bd13a4bc88ab6f0b 3ff02c9a3e778061 3ce91137d36a5dac
3ff04315e86e7f85 3d079d9482b6e550 3ff059b0d3158574 bd04ca556a1b2fa8 3ff0706b29ddf6de 3d040ee9a808de1d
3ff0874518759bc8 bcd87a10f84f53b7 3ff09e3ecac6f383 bd0801b99f4f5b18 3ff0b5586cf9890f bd1106d9ba253401
3ff0cc922b7247f7 bd06269675ff4e35 3ff0e3ec32d3d1a2 bcb62d2d983e6844 3ff0fb66affed31b 3ce2c399e6b423b5
3ff11301d0125b51 3d0ec8769e7386f7 3ff12abdc06c31cc 3cc7cf4b389b60d3 3ff1429aaea92de0 3d09a8cab70c1007
3ff15a98c8a58e51 bcf846f8d141b1d0 3ff172b83c7d517b 3cf73c5aec1a0547 3ff18af9388c8dea 3d0673a724b46d55
3ff1a35beb6fcb75 bd03dd2c819e0908 3ff1bbe084045cd4 3d107b9a3e9b6a86 3ff1d4873168b9aa bd136c3949dfc34e
3ff1ed5022fcd91d 3d07039d1ea652dc 3ff2063b88628cd6 bd03118ae698d206 3ff21f49917ddc96 bcf7c551db68456f
3ff2387a6e756238 bd1045c6a6d3eecb 3ff251ce4fb2a63f bd00db2bd14acf32 3ff26b4565e27cdd bcf77bf4b6a48214
3ff284dfe1f56381 3d1063b457a17edb 3ff29e9df51fdee1 bcfb5d8e0885ab1b 3ff2b87fd0dad990 3cb5038687737bee
3ff2d285a6e4030b bd03a1fee8c9225c 3ff2ecafa93e2f56 bce5b2c9eff60911 3ff306fe0a31b715 bcfbd9046b69ea24
3ff32170fc4cd831 bd000e3e54fb7d75 3ff33c08b26416ff bd06fc3180aac683 3ff356c55f929ff1 3d005491f94cc017
3ff371a7373aa9cb 3d0a6409cdf25d3a 3ff38cae6d05d866 3d120e5f6745f2e3 3ff3a7db34e59ff7 3ce9b570deeb4717
3ff3c32dc313a8e5 3d121abaf1248342 3ff3dea64c123422 bcff31b9fb32e2e4 3ff3fa4504ac801c 3d0b83c7e85e695f
3ff4160a21f72e2a 3cd1c8d3f3908470 3ff431f5d950a897 3cf452cbd4449600 3ff44e086061892d bcbbf96ee8afb9fb
3ff46a41ed1d0057 bd10283b91b051a3 3ff486a2b5c13cd0 bce637bd8150db7d 3ff4a32af0d7d3de bd0cd9f521d33a36
3ff4bfdad5362a27 bcf04715f70da237 3ff4dcb299fddd0d bd0b942d586961a7 3ff4f9b2769d2ca7 3d06c785171c0daa
3ff516daa2cf6642 3d013802b6c9135a 3ff5342b569d4f82 3cf1f0a88738ea6a 3ff551a4ca5d920f 3cffd7a06db1d675
3ff56f4736b527da bd0bb5c29f573dd8 3ff58d12d497c7fd bcf3e81d7478cc39 3ff5ab07dd485429 bd07a560f05eeddb
3ff5c9268a5946b7 bcadfa723ae1bf17 3ff5e76f15ad2148 bd0d2407ce0f6433 3ff605e1b976dc09 3d04d74bbcd33652
3ff6247eb03a5585 3d0457f6a88ab15f 3ff6434634ccc320 3cfd5305865039df 3ff6623882552225 3d0c93b642e08a78
3ff68155d44ca973 bcd0a350f225390e 3ff6a09e667f3bcd 3d0c6cdcb8cfcc24 3ff6c012750bdabf 3ce2cec326ee0b73
3ff6dfb23c651a2f 3cdbff379bac560e 3ff6ff7df9519484 3cf85304766e7062 3ff71f75e8ec5f74 3cf1669aa6aea2d3
3ff73f9a48a58174 3d008a8544a7c319 3ff75feb564267c9 3cffe19bb8ecd7c4 3ff780694fde5d3f bd07f77c42eaf147
3ff7a11473eb0187 3cf39ea4b4e0a91d 3ff7c1ed0130c132 bd0e308095c8fab2 3ff7e2f336cf4e62 bcdfa03bd08bcda3
3ff80427543e1a12 3d01c4a6d87e2162 3ff82589994cce13 3d0c01c85abda967 3ff8471a4623c7ad 3cf79da32bfd8963
3ff868d99b4492ed 3d0e0ce7d31c17b4 3ff88ac7d98a6699 bd080f72957b0484 3ff8ace5422aa0db bd056f6cd720fba3
3ff8cf3216b5448c 3cdf530b22c146b2 3ff8f1ae99157736 bcf42bc69235780f 3ff9145b0b91ffc6 3d0b766e6aa0a1df
3ff93737b0cdc5e5 3cd565b633aaadee 3ff95a44cbc8520f 3ce44c91b60b1f8d 3ff97d829fde4e50 3d0a58fa485235a1
3ff9a0f170ca07ba 3cff6ff7608a3078 3ff9c49182a3f090 bce984806660caa6 3ff9e86319e32323 bce582eb35cac3f3
3ffa0c667b5de565 3d0125694bb46c7e 3ffa309bec4a2d33 bd038e88295250ef 3ffa5503b23e255d 3d099593455a26b5
3ffa799e1330b358 bd083bde4707301a 3ffa9e6b5579fdbf bcfd72d3f1e40a93 3ffac36bbfd3f37a 3cfb3ad1802c5436
3ffae89f995ad3ad bd0445b6038d7018 3ffb0e07298db666 3d07c789b4248453 3ffb33a2b84f15fb 3ccf667a98d32ac1
3ffb59728de5593a 3d0801f60c88f9bd 3ffb7f76f2fb5e47 3ce1eb0404780ad1 3ffba5b030a1064a 3d09df3f08eda153
3ffbcc1e904bc1d2 bcee4bb29d39c3a3 3ffbf2c25bd71e09 3d0998b2be294a3f 3ffc199bdd85529c bcec08f260a0042a
3ffc40ab5fffd07a bd0647d6355e9b74 3ffc67f12e57d14b bcfe1e92a1c04f0d 3ffc8f6d9406e7b5 bcdc920234dbf34d
3ffcb720dcef9069 bce0e49a8304ef1f 3ffcdf0b555dc3fa 3cf7dc824b04c033 3ffd072d4a07897c 3d06d9ab77ff22ef
3ffd2f87080d89f2 3d072904080a5c48 3ffd5818dcfba487 bcedc682d68358e2 3ffd80e316c98398 3cfaca05497de9c9
3ffda9e603db3285 bd05e51917091778 3ffdd321f301b460 bcfd2ec7bfc90fd9 3ffdfc97337b9b5f 3cfb2b6b3f445f87
3ffe264614f5a129 3d02277152860520 3ffe502ee78b3ff6 bcede1319abb2ae2 3ffe7a51fbc74c83 bcfc86cfb6cd46e4
3ffea4afa2a490da 3d070ed6ccceec4b 3ffecf482d8e67f1 3d05693ab0188765 3ffefa1bee615a27 bd063124664aaf80
3fff252b376bba97 bcfd19790d732ab4 3fff50765b6e4540 bd0309e68da0499f 3fff7bfdad9cbe14 3d05cc2651e079fb
3fffa7c1819e90d8 bcf0fa4931906b80 3fffd3c22b8f71f1 bccb71923d729650`).map(number);
const sign = 0x8000000000000000n, one = 0x3ff0000000000000n;
const mantissaMask = 0x000fffffffffffffn, exponentMask = 0xfff0000000000000n;
const signed = (x, flag) => flag ? -x : x;
export function nativeDoublePow(x, y) {
  if (typeof x !== 'number' || typeof y !== 'number') throw new TypeError('Binary64 power inputs required');
  if (x === 1 || y === 0) return 1;
  if (y === 1) return x;
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  const ax = Math.abs(x), ay = Math.abs(y);
  if (ay === Infinity) return ax === 1 ? 1 : (ax > 1) === (y > 0) ? Infinity : 0;
  const odd = Number.isInteger(y) && ay < 2 ** 53 && Math.abs(y % 2) === 1;
  const negative = (x < 0 || Object.is(x, -0)) && odd;
  if (ax === 0 || ax === Infinity) return signed(y < 0 ? 1 / ax : ax, negative);
  if (x < 0 && !Number.isInteger(y)) return NaN;
  if (ay > 2 ** 64) return signed(ax === 1 ? 1 : (ax > 1) === (y > 0) ? Infinity : 0, negative);
  if (ay < 2 ** -65) return signed(1, negative);
  let raw = bits(ax);
  if (raw < 0x0010000000000000n)
    raw = BigInt.asUintN(64, bits(number(raw | one) - 1) + 0xc020000000000000n);
  const fraction = raw & mantissaMask;
  let exponentProduct, productTail;
  if (fraction === 0n) {
    const scale = Number(BigInt.asIntN(64, raw - one)) / 2 ** 45;
    exponentProduct = scale * y;
    productTail = fma64(scale, y, -exponentProduct);
  } else {
    const index = Number(((fraction + 0x0000100000000000n) & 0x001fe00000000000n) >> 45n);
    const record = logTable[index * 2];
    const inverse = number((record & 0xffffffffn) << 32n);
    const highLog = number(logTable[index * 2 + 1]);
    const lowLog = number(record & 0xffffffff00000000n);
    const exponent = Number(BigInt.asIntN(64, raw + 0xc018100000000000n) >> 52n);
    const m = number(fraction | one), mHigh = number(bits(m) & 0xffffffffffe00000n), mLow = m - mHigh;
    const product = inverse * m;
    const residual = fma64(inverse, mLow, fma64(inverse, mHigh, -product));
    const r = product - 1;
    let polynomial = logCoefficients[0];
    for (let i = 1; i < 5; i++) polynomial = fma64(r, polynomial, logCoefficients[i]);
    const square = r * r;
    polynomial = (square * square) * polynomial;
    const [a, b, c, d, e, f] = logCoefficients.slice(5);
    const firstHead = fma64(a, r, c);
    let firstTail = fma64(b, r, d);
    const firstError = fma64(a, r, -(firstHead - c));
    firstTail = fma64(a, residual, firstTail);
    firstTail = firstError + firstTail;
    const secondHead = fma64(firstHead, r, e);
    let secondTail = fma64(firstTail, r, f);
    const secondError = fma64(firstHead, r, -(secondHead - e));
    secondTail = fma64(firstHead, residual, secondTail);
    secondTail = secondError + secondTail;
    const finalHead = secondHead * r;
    secondTail *= r;
    const finalError = fma64(secondHead, r, -finalHead);
    secondTail = fma64(secondHead, residual, secondTail);
    const finalTail = finalError + secondTail;
    let head = ((exponent + highLog) + finalHead) + polynomial;
    head = number(bits(head) & 0xfffffffffffffffen);
    let tail = (((exponent - head) + highLog) + finalHead) + polynomial;
    tail = (lowLog + tail) + finalTail;
    const scaledY = y * 128;
    exponentProduct = scaledY * head;
    productTail = fma64(scaledY, tail, fma64(scaledY, head, -exponentProduct));
  }
  if (exponentProduct > number(0x4100040000000000n)) return signed(Infinity, negative);
  if (exponentProduct < number(0xc100cc0000000000n)) return signed(0, negative);
  const integral = Math.floor(exponentProduct), n = BigInt(integral);
  const fractionPart = exponentProduct - integral;
  const index = Number(n & 127n) * 2;
  const tableHead = expTable[index], tableTail = expTable[index + 1];
  const reduced = (productTail - tableTail) + fractionPart;
  let polynomial = fma64(fractionPart, expCoefficients[0], expCoefficients[1]);
  polynomial = fma64(fractionPart, polynomial, expCoefficients[2]);
  polynomial = fma64(reduced, polynomial, expCoefficients[3]);
  polynomial = fma64(reduced, polynomial, expCoefficients[4]);
  polynomial *= reduced;
  const firstScale = BigInt.asUintN(64, (n << 44n) & exponentMask);
  const secondScale = BigInt.asUintN(64, ((n << 45n) & exponentMask) - firstScale + one);
  let result = number(bits(tableHead) + (firstScale ^ (negative ? sign : 0n)));
  result = fma64(result, polynomial, result);
  return result * number(secondScale);
}
