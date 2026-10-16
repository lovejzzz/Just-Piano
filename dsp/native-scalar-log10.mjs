// macOS arm64 libsystem_m log10f, inspected on build 25F80.
// Native double FMA order and the 65-entry reduction table are preserved.
// NaNs are compared semantically; floating exception flags are not modeled.
import {fma64} from './modal-poles.mjs';
const f = Math.fround, view = new DataView(new ArrayBuffer(8));
function from64(word) { view.setBigUint64(0, BigInt('0x' + word)); return view.getFloat64(0); }
const COEFFICIENTS = `
bfbbcbea4c258daa 3fc287d3dcaf476d bfcbcb7b14dcbd85 3fdbcb7b151bc6b3
`.trim().split(/\s+/).map(from64);
const LOG10_TWO = from64('3fd34413509f79ff');
const PAIRS = `
3ff0000000000000 0000000000000000 3fef81f81f81a3e5 3f7b9476a50f6475
3fef07c1f07c3108 3f8b5e908eaf3398 3fee9131abf09b55 3f945f4f5acd2447
3fee1e1e1e1e0ae1 3f9af5f92b020224 3fedae6076b8f76b 3fa0ba01a81b0d1d
3fed41d41d410288 3fa3ed1199ac1d02 3fecd8568902fb3f 3fa714834281fa6c
3fec71c71c70f481 3faa30a9d6105e4b 3fec0e0703826caa 3fad41d5164a5b23
3febacf914c177b9 3fb02428c1f18d98 3feb4e81b4e7b01f 3fb1a2344551cc7e
3feaf286bca2397c 3fb31b3055c23663 3fea98ef60696bd7 3fb48f3ed1e3553a
3fea41a41a40b6e9 3fb5fe80488ee159 3fe9ec8e95113011 3fb769140a20ed4f
3fe9999999992278 3fb8cf1838884d6e 3fe948b0fcd69907 3fba30a9d60b536d
3fe8f9c18f9b4e11 3fbb8de4d3aec4d9 3fe8acb90f6c68a1 3fbce6e41e442e9e
3fe861861862484b 3fbe3bc1ab0aa46f 3fe8181818173ae4 3fbf8c96834a7e48
3fe7d05f417c0774 3fc06cbd67a915cd 3fe78a4c81784397 3fc11142f081f8db
3fe745d1745de7ba 3fc1b3e71ec75d90 3fe702e05c0c18e3 3fc254b4d35d0f5f
3fe6c16c16c06c9b 3fc2f3b691c81020 3fe681681681a1f6 3fc390f684497c90
3fe642c8590aa5ef 3fc42c7e7fe5304e 3fe605816057fe92 3fc4c65807e96e6b
3fe5c9882b922e81 3fc55e8c518d5130 3fe58ed230825723 3fc5f5244722cd0f
3fe555555555be48 bfbffbfc2bbe9af4 3fe51d07eae25fe5 bfbed50a4a23c997
3fe4e5e0a72ea8ca bfbdb11ed764c030 3fe4afd6a051e80f bfbc902a19e1cbfd
3fe47ae147ad26e5 bfbb721cd16c4e1c 3fe446f8656250ca bfba56e8325c6c50
3fe4141414137fce bfb93e7de0f90978 3fe3e22cbce5a6b7 bfb828cfed2f2caf
3fe3b13b13b04947 bfb715d0ce3125d3 3fe3813813803a55 bfb605735ee3df92
3fe3521cfb2b1096 bfb4f7aad9b97441 3fe323e34a2baef3 bfb3ec6ad5440f5a
3fe2f684bda0a126 bfb2e3a740b43dff 3fe2c9fb4d8060d5 bfb1dd5460c3fb8b
3fe29e4129e3187d bfb0d966cc5f2b50 3fe27350b881d871 bfafafa6d3a047d3
3fe249249249e9cf bfadb11ed7700a68 3fe21fb781227951 bfabb7209d242ce5
3fe1f7047dc1c36b bfa9c197abf7fb7a 3fe1cf06ada1ee29 bfa7d070145824fe
3fe1a7b961199740 bfa5e3966b7356cb 3fe181181181a457 bfa3faf7c669fbf0
3fe15b1e5f74ca8f bfa21681b5c42118 3fe135c81135efed bfa0362241e83be8
3fe1111111104099 bf9cb38fccc387a4 3fe0ecf56be75b6e bf9902c31d763f47
3fe0c9714fbdd2a2 bf9559bd2420786b 3fe0a6810a68f2a2 bf91b85d605c7d78
3fe084210841501d bf8c3d08374fd2e0 3fe0624dd2f253e0 bf851824c77c8587
3fe04104104183ee bf7c03a80b1c8a49 3fe0204081017ac2 bf6be76bd7050239
3fe0000000000000 0000000000000000
`.trim().split(/\s+/).map(from64);

export function nativeScalarLog10f(input) {
  input = f(input);
  if (Number.isNaN(input) || input < 0) return NaN;
  if (input === 0) return -Infinity;
  if (input === Infinity) return Infinity;
  view.setFloat32(0, input);
  let word = view.getUint32(0);
  if (word < 0x00800000) {
    view.setUint32(0, word | 0x3f800000);
    const scaled = f(view.getFloat32(0) - 1);
    view.setFloat32(0, scaled);
    word = (view.getUint32(0) + 0xc1000000) >>> 0;
  }
  const exponent = ((word + 0xc0c10000) | 0) >> 23;
  const mantissaBits = word & 0x7fffff;
  const index = (mantissaBits + 0x10000) >>> 17;
  view.setUint32(0, mantissaBits | 0x3f800000);
  const mantissa = view.getFloat32(0);
  const r = fma64(mantissa, PAIRS[index * 2], -1);
  let polynomial = fma64(r, COEFFICIENTS[0], COEFFICIENTS[1]);
  polynomial = fma64(r, polynomial, COEFFICIENTS[2]);
  polynomial = fma64(r, polynomial, COEFFICIENTS[3]);
  const base = fma64(exponent, LOG10_TWO, PAIRS[index * 2 + 1]);
  return f(fma64(r, polynomial, base));
}
