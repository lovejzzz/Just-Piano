// arm64 libsystem_m exp2(double) instruction order, including subnormal rounding.
import {fma64} from './modal-poles.mjs';
const view = new DataView(new ArrayBuffer(8));
const number = w => { view.setBigUint64(0, BigInt.asUintN(64, w)); return view.getFloat64(0); };
const bits = x => { view.setFloat64(0, x); return view.getBigUint64(0); };
const words = text => text.trim().split(/\s+/).map(w => number(BigInt('0x' + w)));
const coefficients = words(`401ef1584af17ecd bfe13b4d4879e55e 4034ffde7cc02cf4 4038b31b87eb8904 3f55e52272e0eaec`);
const table = words(`3ff0000000000000 0000000000000000 3ff0163da9fb3335 3ca3a4bc88ab6f0b 3ff02c9a3e778060 3cb5448c4f3a3faa
3ff04315e86e7f84 3cb0cea8d139df85 3ff059b0d3158574 3c94ca556a1b2fa8 3ff0706b29ddf6dd 3cb173b2871f2217
3ff0874518759bc8 3c687a10f84f53b7 3ff09e3ecac6f383 3c9801b99f4f5b18 3ff0b5586cf9890f 3ca106d9ba253401
3ff0cc922b7247f7 3c96269675ff4e35 3ff0e3ec32d3d1a2 3c462d2d983e6844 3ff0fb66affed31a 3cb4935522e05558
3ff11301d0125b50 3cabdebf5fb67959 3ff12abdc06c31cb 3cb5245852cc8960 3ff1429aaea92ddf 3cadf748a567f8da
3ff15a98c8a58e51 3c8846f8d141b1d0 3ff172b83c7d517a 3cb24349c9dfc205 3ff18af9388c8de9 3caee14f25e66832
3ff1a35beb6fcb75 3c93dd2c819e0908 3ff1bbe084045cd3 3ca92b6b9f4c306a 3ff1d4873168b9aa 3ca36c3949dfc34e
3ff1ed5022fcd91c 3cadb25aa6565c95 3ff2063b88628cd6 3c93118ae698d206 3ff21f49917ddc96 3c87c551db68456f
3ff2387a6e756238 3ca045c6a6d3eecb 3ff251ce4fb2a63f 3c90db2bd14acf32 3ff26b4565e27cdd 3c877bf4b6a48214
3ff284dfe1f56380 3ca77f3dc394bd27 3ff29e9df51fdee1 3c8b5d8e0885ab1b 3ff2b87fd0dad98f 3cb390730108bc38
3ff2d285a6e4030b 3c93a1fee8c9225c 3ff2ecafa93e2f56 3c75b2c9eff60911 3ff306fe0a31b715 3c8bd9046b69ea24
3ff32170fc4cd831 3c900e3e54fb7d75 3ff33c08b26416ff 3c96fc3180aac683 3ff356c55f929ff0 3cae07c0017dfc4a
3ff371a7373aa9ca 3ca8cb357ddac301 3ff38cae6d05d865 3ca3ba556658c94d 3ff3a7db34e59ff6 3cb12ee4dbdbae86
3ff3c32dc313a8e4 3ca345c8212d2278 3ff3dea64c123422 3c8f31b9fb32e2e4 3ff3fa4504ac801b 3ca7378cb7144a8a
3ff4160a21f72e29 3cb1d4e28014ce07 3ff431f5d950a896 3caf7ec78b0a541a 3ff44e086061892d 3c4bf96ee8afb9fb
3ff46a41ed1d0057 3ca0283b91b051a3 3ff486a2b5c13cd0 3c7637bd8150db7d 3ff4a32af0d7d3de 3c9cd9f521d33a36
3ff4bfdad5362a27 3c804715f70da237 3ff4dcb299fddd0d 3c9b942d586961a7 3ff4f9b2769d2ca6 3ca7d36cccde36a5
3ff516daa2cf6641 3caa6a7e10f26745 3ff5342b569d4f81 3cae59e8ae6a99de 3ff551a4ca5d920e 3caab0010b956f3f
3ff56f4736b527da 3c9bb5c29f573dd8 3ff58d12d497c7fd 3c83e81d7478cc39 3ff5ab07dd485429 3c97a560f05eeddb
3ff5c9268a5946b7 3c3dfa723ae1bf17 3ff5e76f15ad2148 3c9d2407ce0f6433 3ff605e1b976dc08 3ca71eb321c101b5
3ff6247eb03a5584 3ca72ffea320da87 3ff6434634ccc31f 3ca9d919a952ca95 3ff6623882552224 3ca2b620c0998aac
3ff68155d44ca973 3c60a350f225390e 3ff6a09e667f3bcc 3ca26e8d1ea7de88 3ff6c012750bdabe 3cae1e012931967d
3ff6dfb23c651a2e 3cae8b028d2e51bb 3ff6ff7df9519483 3caa098f71bcc9b0 3ff71f75e8ec5f73 3cab984227e443e3
3ff73f9a48a58173 3ca7807bd5e512c0 3ff75feb564267c8 3ca7a16a40378bdb 3ff780694fde5d3f 3c97f77c42eaf147
3ff7a11473eb0186 3caa5b034b27b244 3ff7c1ed0130c132 3c9e308095c8fab2 3ff7e2f336cf4e62 3c6fa03bd08bcda3
3ff80427543e1a11 3ca5df63c009a845 3ff82589994cce12 3ca0964d359847c9 3ff8471a4623c7ac 3ca8857d98c4418d
3ff868d99b4492ec 3c9e78c3e7b184a0 3ff88ac7d98a6699 3c980f72957b0484 3ff8ace5422aa0db 3c956f6cd720fba3
3ff8cf3216b5448b 3cabd0cf46f2f2b2 3ff8f1ae99157736 3c842bc69235780f 3ff9145b0b91ffc5 3c9f715c3d56cd59
3ff93737b0cdc5e4 3cabf4d1acf902db 3ff95a44cbc8520e 3caa991ae1b50822 3ff97d829fde4e4f 3c9f9bcff58b04aa
3ff9a0f170ca07b9 3ca4f656fe0ffb05 3ff9c49182a3f090 3c7984806660caa6 3ff9e86319e32323 3c7582eb35cac3f3
3ffa0c667b5de564 3ca3c8ba7b0b1398 3ffa309bec4a2d33 3c938e88295250ef 3ffa5503b23e255c 3c9e84e556f025f4
3ffa799e1330b358 3c983bde4707301a 3ffa9e6b5579fdbf 3c8d72d3f1e40a93 3ffac36bbfd3f379 3ca4cacf4c4b05e2
3ffae89f995ad3ad 3c9445b6038d7018 3ffb0e07298db665 3c9ed34583749cd0 3ffb33a2b84f15fa 3caa2c7497c16670
3ffb59728de55939 3c9e0244cd9df3b7 3ffb7f76f2fb5e46 3ca89f65d4b96070 3ffba5b030a10649 3c9b9006b1da3a39
3ffbcc1e904bc1d2 3c7e4bb29d39c3a3 3ffbf2c25bd71e08 3c9b4338a23cfc57 3ffc199bdd85529c 3c7c08f260a0042a
3ffc40ab5fffd07a 3c9647d6355e9b74 3ffc67f12e57d14b 3c8e1e92a1c04f0d 3ffc8f6d9406e7b5 3c6c920234dbf34d
3ffcb720dcef9069 3c70e49a8304ef1f 3ffcdf0b555dc3f9 3ca39e87e388d84e 3ffd072d4a07897b 3c9c0ae7070a6c51
3ffd2f87080d89f1 3c9b7531d7fbf731 3ffd5818dcfba487 3c7dc682d68358e2 3ffd80e316c98397 3ca256cea656ebcd
3ffda9e603db3285 3c95e51917091778 3ffdd321f301b460 3c8d2ec7bfc90fd9 3ffdfc97337b9b5e 3ca1d72cedf8d91c
3ffe264614f5a128 3c9ed88162f63e73 3ffe502ee78b3ff6 3c7de1319abb2ae2 3ffe7a51fbc74c83 3c8c86cfb6cd46e4
3ffea4afa2a490d9 3c9926f89159b0a1 3ffecf482d8e67f0 3c9a89ed8a4d4206 3ffefa1bee615a27 3c963124664aaf80
3fff252b376bba97 3c8d19790d732ab4 3fff50765b6e4540 3c9309e68da0499f 3fff7bfdad9cbe13 3c991ff9e4e92cf9
3fffa7c1819e90d8 3c80fa4931906b80 3fffd3c22b8f71f1 3c5b71923d729650`);
export function nativeDoubleExp2(x) {
  if (typeof x !== 'number') throw new TypeError('Binary64 exp2 input required');
  if (Number.isNaN(x)) return NaN;
  if (x >= 1024) return Infinity;
  if (x <= -1088) return 0;
  if (x === 0) return 1;
  const n = Math.trunc(x * 128) + (x < 0 ? -1 : 0);
  const r = x - n / 128, index = (n & 127) * 2, head = table[index];
  const a = r + coefficients[0], b = r + coefficients[1], reduced = r + table[index + 1];
  const p = fma64(reduced, a, coefficients[2]), q = fma64(reduced, b, coefficients[3]);
  const polynomial = ((reduced * coefficients[4]) * p) * q;
  const exponent = n >> 7;
  if (exponent >= -1022) return number(bits(fma64(polynomial, head, head)) + (BigInt(exponent) << 52n));
  const scaled = number(bits(head) + (BigInt(exponent + 1022) << 52n));
  const sum = scaled + 1, error = scaled - (sum - 1);
  const compensated = sum + fma64(scaled, polynomial, error);
  return (compensated - 1) * 2 ** -1022;
}
