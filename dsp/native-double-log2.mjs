// arm64 libsystem_m log2(double) compensated instruction order.
import {fma64} from './modal-poles.mjs';
const view = new DataView(new ArrayBuffer(8));
const number = w => { view.setBigUint64(0, BigInt.asUintN(64, w)); return view.getFloat64(0); };
const bits = x => { view.setFloat64(0, x); return view.getBigUint64(0); };
const words = text => text.trim().split(/\s+/).map(w => number(BigInt('0x' + w)));
const coefficients = words(`bfd1197c976768fa 3fca61a454f2c198 3ff9de61616cdf2b 3ff609d14c7ee9be 3ffab7d4f0547db7 bff3f6ab6ec10818`);
const table = words(`3ff0000000000000 0000000000000000 3fefc07f01fbf2f8 3f86fe50b6f6a796 3fef81f81f8271f1 3f96e79685ac8265
3fef44659e4b066a 3fa11cd1d5011e6c 3fef07c1f07d1862 3fa6bad37577cdd3 3feecc07b30242be 3fac4dfab9029ce9
3fee9131abf02f18 3fb0eb389fa90e92 3fee573ac901370e 3fb3aa2fdd303ca7 3fee1e1e1e1ea60d 3fb663f6fac29027
3fede5d6e3f7d1fc 3fb918a16e4ee9c6 3fedae6076b9258d 3fbbc84240b2284b 3fed77b654b875b4 3fbe72ec117c0c78
3fed41d41d412575 3fc08c588cdec84a 3fed0cb58f6fa9f7 3fc1dcd1974f5f15 3fecd8568902a484 3fc32ae9e27ed85b
3feca4b3055e00a5 3fc476a9f989a162 3fec71c71c70f96e 3fc5c01a3a010dd7 3fec3f8f01c4f8e7 3fc70742d4e87934
3fec0e070382101d 3fc84c2bd02cfa24 3febdd2b8994ad73 3fc98edd077a2186 3febacf914c254af 3fcacf5e2db0e9de
3feb7d6c3dda7372 3fcc0db6cdd7a0ab 3feb4e81b4e7482e 3fcd49ee4c37ed36 3feb2036406d4a9f 3fce840be7490caf
3feaf286bca1e09f 3fcfbc16b9011514 3feac5701ac624ff 3fd0790adbadc027 3fea98ef606a9dbf 3fd11307dad24218
3fea6d01a6d0cf5b 3fd1ac05b28f7844 3fea41a41a41297d 3fd24407ab0fb668 3fea16d3f97978e2 3fd2db10fc508256
3fe9ec8e95105eca 3fd37124cea434fc 3fe9c2d14ee3ab1e 3fd406463b1e759a 3fe999999998b16f 3fd49a784bd060e8
3fe970e4f80d8959 3fd52dbdfc49a08b 3fe948b0fcd65c4a 3fd5c01a39fddb95 3fe920fb49d11a21 3fd6518fe466ae00
3fe8f9c18f9c4c0f 3fd6e221cd9c5005 3fe8d3018d30b20a 3fd771d2ba7cc15c 3fe8acb90f6c0b26 3fd800a56315c472
3fe886e5f0abc008 3fd88e9c72e076e1 3fe861861860d371 3fd91bba8921bb9c 3fe83c977ab21aaf 3fd9a802392094a6
3fe81818181771e6 3fda33760a81dd34 3fe7f405fd01bdcd 3fdabe18797e2e2d 3fe7d05f417dd809 3fdb47ebf7355417
3fe7ad2208e1241d 3fdbd0f2e9e6b856 3fe78a4c81793167 3fdc592fad2733c7 3fe767dce4349bad 3fdce0a4923a8fc7
3fe745d1745df36f 3fdd6753e02f8097 3fe724287f47a28b 3fdded3fd43f2908 3fe702e05c0a9328 3fde726aa1eb10ed
3fe6e1f76b42a623 3fdef6d6732b2dca 3fe6c16c16c19bf9 3fdf7a8568ca4484 3fe6a13cd1531cf1 3fdffd799a855cf4
3fe68168168170b4 3fe03fda8b9787d3 3fe661ec6a506afc 3fe0809cf280ebbc 3fe642c8590c06b4 3fe0c10500d45f16
3fe623fa77016a2d 3fe10113b153b863 3fe6058160586486 3fe140c9faa140b1 3fe5e75bb8cf19b1 3fe18028cf74ab00
3fe5c9882b93331f 3fe1bf311e95865b 3fe5ac056b011752 3fe1fde3d30f10cb 3fe58ed23081846a 3fe23c41d426caa7
3fe571ed3c5098cc 3fe27a4c058569dd 3fe55555555565b2 bfda8ff97181512f 3fe5390948f399d4 bfda152f14277ff1
3fe51d07eae25f1e bfd99b072a9429c1 3fe501501501d17e bfd9218009271615 3fe4e5e0a72eb123 bfd8a8980abe49ad
3fe4cab8872698d7 bfd8304d90c52c58 3fe4afd6a052aff3 bfd7b89f02cee5ec 3fe49539e3b34f8c bfd7418acebe2bea
3fe47ae147ae2fd2 bfd6cb0f6866442d 3fe460cbc7f5ccd6 bfd6552b499855ef 3fe446f865628c84 bfd5dfdcf1ed4d52
3fe42d6625d4b75d bfd56b22e6b39c3c 3fe414141413acbe bfd4f6fbb2ccea65 3fe3fb013fb10bf6 bfd48365e69a518a
3fe3e22cbce4861e bfd4106017c34a9b 3fe3c995a47bf67d bfd39de8e156fb77 3fe3b13b13b1ac72 bfd32bfee37301f7
3fe3991c2c18b343 bfd2baa0c34cd651 3fe381381380a51e bfd249cd2b1115be 3fe3698df3ddab8d bfd1d982c9d372bc
3fe3521cfb2c1f3a bfd169c053670ce7 3fe33ae45b5824da bfd0fa848046a76c 3fe323e34a2bfc50 bfd08bce0d9a6a96
3fe30d1901305e86 bfd01d9bbcf83449 3fe2f684bda0ad76 bfcf5fd8a9014cc3 3fe2e025c04be197 bfce857d3d39c862
3fe2c9fb4d803821 bfcdac22d3daded7 3fe2b404ad012844 bfccd3c712d2f38f 3fe29e4129e3a3ef bfcbfc67a7fbaaf8
3fe288b012885e4b bfcb2602497a2474 3fe27350b88209ac bfca5094b55602c6 3fe25e22707fdd29 bfc97c1cb1355b29
3fe249249249dbc3 bfc8a8980ac6f736 3fe23456789b7d34 bfc7d60496d75a4e 3fe21fb781227c5a bfc7046031ccc0b5
3fe20b470c6767e7 bfc633a8bf3fee9f 3fe1f7047dc01f7d bfc563dc29f565bb 3fe1e2ef3b3ee1df bfc494f863b037ca
3fe1cf06ada36398 bfc3c6fb65160ac7 3fe1bb4a4046540e bfc2f9e32d55c34e 3fe1a7b9611b19bc bfc22dadc2b1aabf
3fe19453808bda4b bfc16259317ea230 3fe181181180a9e7 bfc097e38ce17c11 3fe16e068941d23b bfbf9c95dc0fb8bf
3fe15b1e5f74bdc8 bfbe0b1ae8ea3d3a 3fe1485f0e0a8a1f bfbc7b528b6b579d 3fe135c811359e80 bfbaed391ab2eb45
3fe12358e75c730e bfb960caf99bcba4 3fe111111110e212 bfb7d60496cbc247 3fe0fef010ffe27b bfb64ce26c1b0524
3fe0ecf56be648da bfb4c560fe618ce8 3fe0db20a8902fef bfb33f7cde28c840 3fe0c9714fbbf1a4 bfb1bb32a5ec5767
3fe0b7e6ec24fe5a bfb0387efbbcc4a6 3fe0a6810a681e3a bfad6ebd1f224645 3fe0953f3901f778 bfaa6f9c37a742a9
3fe0842108426a0d bfa77394c9e8fd24 3fe073260a483935 bfa47aa07362ea75 3fe0624dd2f26f2d bfa184b8e4e82535
3fe05197f7d7f0be bf9d23afc4d3f731 3fe0410410417bc2 bf9743ee8649b454 3fe03091b51fd99c bf916a21e236104e
3fe0204081026480 bf872c7ba2547e55 3fe01010100f7d9f bf7720d9bf98115b 3fe0000000000000 0000000000000000`);
const mask = 0xfffffffff8000000n, one = 0x3ff0000000000000n;
const inverseLn2 = number(0x3ff71547652b82fen), inverseLn2High = number(0x3ff7154760000000n), inverseLn2Low = number(0x3e54ae0bf85ddf44n);
export function nativeDoubleLog2(x) {
  if (typeof x !== 'number') throw new TypeError('Binary64 log2 input required');
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let raw = bits(x);
  if (raw < 0x0010000000000000n) raw = BigInt.asUintN(64, bits(number(raw | one) - 1) + 0xc020000000000000n);
  const exponent = Number(BigInt.asIntN(64, raw + 0xc018100000000000n) >> 52n), fraction = raw & 0x000fffffffffffffn;
  const index = Number((fraction + 0x0000100000000000n) >> 45n) * 2;
  const m = number(fraction | one), inverse = table[index], log = table[index + 1];
  let r = fma64(m, inverse, -1);
  const [a0, a1, b0, b1, c0, c1] = coefficients;
  const a = fma64(r, a1, a0), b = fma64(r, r + b1, b0), c = fma64(r, r + c1, c0);
  const polynomial = (((r * r) * a) * b) * c;
  if (exponent !== 0) {
    const high = number(bits(log) & mask);
    return (exponent + high) + fma64(r, inverseLn2, (log - high) + polynomial);
  }
  const product = inverse * m, difference = product - 1, error = fma64(inverse, m, -product);
  let tail = r * inverseLn2Low;
  const split = number(bits(r) & mask), residual = error + (difference - split);
  const highProduct = split * inverseLn2High, head = log + highProduct;
  tail = fma64(residual, inverseLn2High, tail) + (highProduct - (head - log));
  return (tail + polynomial) + head;
}
