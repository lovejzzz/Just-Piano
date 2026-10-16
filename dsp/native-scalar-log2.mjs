// macOS arm64 libsystem_m log2f, inspected on build 25F80.
// Native double FMA order and the 65-entry reduction table are preserved.
// NaNs are compared semantically; floating exception flags are not modeled.
import {fma64} from './modal-poles.mjs';
const f = Math.fround, view = new DataView(new ArrayBuffer(8));
function from64(word) { view.setBigUint64(0, BigInt('0x' + word)); return view.getFloat64(0); }
const COEFFICIENTS = `
bfd715a3c1d1bbdd 3fdec753bab7b7ce bfe7154764eded82 3ff7154765224725
`.trim().split(/\s+/).map(from64);
const PAIRS = `
3ff0000000000000 0000000000000000 3fef81f81f8271f1 3f96e79685ac8265
3fef07c1f07d1862 3fa6bad37577cdd3 3fee9131abf02f18 3fb0eb389fa90e92
3fee1e1e1e1ea60d 3fb663f6fac29027 3fedae6076b9258d 3fbbc84240b2284b
3fed41d41d412575 3fc08c588cdec84a 3fecd8568902a484 3fc32ae9e27ed85b
3fec71c71c70f96e 3fc5c01a3a010dd7 3fec0e070382101d 3fc84c2bd02cfa24
3febacf914c254af 3fcacf5e2db0e9de 3feb4e81b4e7482e 3fcd49ee4c37ed36
3feaf286bca1e09f 3fcfbc16b9011514 3fea98ef606a9dbf 3fd11307dad24218
3fea41a41a41297d 3fd24407ab0fb668 3fe9ec8e95105eca 3fd37124cea434fc
3fe999999998b16f 3fd49a784bd060e8 3fe948b0fcd65c4a 3fd5c01a39fddb95
3fe8f9c18f9c4c0f 3fd6e221cd9c5005 3fe8acb90f6c0b26 3fd800a56315c472
3fe861861860d371 3fd91bba8921bb9c 3fe81818181771e6 3fda33760a81dd34
3fe7d05f417dd809 3fdb47ebf7355417 3fe78a4c81793167 3fdc592fad2733c7
3fe745d1745df36f 3fdd6753e02f8097 3fe702e05c0a9328 3fde726aa1eb10ed
3fe6c16c16c19bf9 3fdf7a8568ca4484 3fe68168168170b4 3fe03fda8b9787d3
3fe642c8590c06b4 3fe0c10500d45f16 3fe6058160586486 3fe140c9faa140b1
3fe5c9882b93331f 3fe1bf311e95865b 3fe58ed23081846a 3fe23c41d426caa7
3fe55555555565b2 bfda8ff97181512f 3fe51d07eae25f1e bfd99b072a9429c1
3fe4e5e0a72eb123 bfd8a8980abe49ad 3fe4afd6a052aff3 bfd7b89f02cee5ec
3fe47ae147ae2fd2 bfd6cb0f6866442d 3fe446f865628c84 bfd5dfdcf1ed4d52
3fe414141413acbe bfd4f6fbb2ccea65 3fe3e22cbce4861e bfd4106017c34a9b
3fe3b13b13b1ac72 bfd32bfee37301f7 3fe381381380a51e bfd249cd2b1115be
3fe3521cfb2c1f3a bfd169c053670ce7 3fe323e34a2bfc50 bfd08bce0d9a6a96
3fe2f684bda0ad76 bfcf5fd8a9014cc3 3fe2c9fb4d803821 bfcdac22d3daded7
3fe29e4129e3a3ef bfcbfc67a7fbaaf8 3fe27350b88209ac bfca5094b55602c6
3fe249249249dbc3 bfc8a8980ac6f736 3fe21fb781227c5a bfc7046031ccc0b5
3fe1f7047dc01f7d bfc563dc29f565bb 3fe1cf06ada36398 bfc3c6fb65160ac7
3fe1a7b9611b19bc bfc22dadc2b1aabf 3fe181181180a9e7 bfc097e38ce17c11
3fe15b1e5f74bdc8 bfbe0b1ae8ea3d3a 3fe135c811359e80 bfbaed391ab2eb45
3fe111111110e212 bfb7d60496cbc247 3fe0ecf56be648da bfb4c560fe618ce8
3fe0c9714fbbf1a4 bfb1bb32a5ec5767 3fe0a6810a681e3a bfad6ebd1f224645
3fe0842108426a0d bfa77394c9e8fd24 3fe0624dd2f26f2d bfa184b8e4e82535
3fe0410410417bc2 bf9743ee8649b454 3fe0204081026480 bf872c7ba2547e55
3fe0000000000000 0000000000000000
`.trim().split(/\s+/).map(from64);

export function nativeScalarLog2f(input) {
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
  const residual = fma64(r, polynomial, PAIRS[index * 2 + 1]);
  return f(exponent + residual);
}
