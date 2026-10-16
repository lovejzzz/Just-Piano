// Scalar logf instruction-order reconstruction for this host's libsystem_m.
// Constants encode the observed range-reduction and mathematical lookup data.
import { fma64 } from './modal-poles.mjs';
const view = new DataView(new ArrayBuffer(8));
function fromDoubleBits(word) { view.setBigUint64(0, BigInt('0x' + word)); return view.getFloat64(0); }
const DATA = `
3fd55561555ccbad bfe00006000349d2 3fefffffffff6666 3fe62e42fefa39ef 3ff0000000000000 0000000000000000 3fefc07f01fc07f0 3f7fe02a6b106789
3fef81f81f81f820 3f8fc0a8b0fc03e4 3fef44659e4a4271 3f97b91b07d5b11b 3fef07c1f07c1f08 3f9f829b0e783300 3feecc07b301ecc0 3fa39e87b9febd60
3fee9131abf0b767 3fa77458f632dcfc 3fee573ac901e574 3fab42dd711971bf 3fee1e1e1e1e1e1e 3faf0a30c01162a6 3fede5d6e3f8868a 3fb16536eea37ae1
3fedae6076b981db 3fb341d7961bd1d1 3fed77b654b82c34 3fb51b073f06183f 3fed41d41d41d41d 3fb6f0d28ae56b4c 3fed0cb58f6ec074 3fb8c345d6319b21
3fecd85689039b0b 3fba926d3a4ad563 3feca4b3055ee191 3fbc5e548f5bc743 3fec71c71c71c71c 3fbe27076e2af2e6 3fec3f8f01c3f8f0 3fbfec9131dbeabb
3fec0e070381c0e0 3fc0d77e7cd08e59 3febdd2b899406f7 3fc1b72ad52f67a0 3febacf914c1bad0 3fc29552f81ff523 3feb7d6c3dda338b 3fc371fc201e8f74
3feb4e81b4e81b4f 3fc44d2b6ccb7d1e 3feb2036406c80d9 3fc526e5e3a1b438 3feaf286bca1af28 3fc5ff3070a793d4 3feac5701ac5701b 3fc6d60fe719d21d
3fea98ef606a63be 3fc7ab890210d909 3fea6d01a6d01a6d 3fc87fa06520c911 3fea41a41a41a41a 3fc9525a9cf456b4 3fea16d3f97a4b02 3fca23bc1fe2b563
3fe9ec8e951033d9 3fcaf3c94e80bff3 3fe9c2d14ee4a102 3fcbc286742d8cd6 3fe999999999999a 3fcc8ff7c79a9a22 3fe970e4f80cb872 3fcd5c216b4fbb91
3fe948b0fcd6e9e0 3fce27076e2af2e6 3fe920fb49d0e229 3fcef0adcbdc5936 3fe8f9c18f9c18fa 3fcfb9186d5e3e2b 3fe8d3018d3018d3 3fd0402594b4d041
3fe8acb90f6bf3aa 3fd0a324e27390e3 3fe886e5f0abb04a 3fd1058bf9ae4ad5 3fe8618618618618 3fd1675cababa60e 3fe83c977ab2bedd 3fd1c898c16999fb
3fe8181818181818 3fd22941fbcf7966 3fe7f405fd017f40 3fd2895a13de86a3 3fe7d05f417d05f4 3fd2e8e2bae11d31 3fe7ad2208e0ecc3 3fd347dd9a987d55
3fe78a4c8178a4c8 3fd3a64c556945ea 3fe767dce434a9b1 3fd404308686a7e4 3fe745d1745d1746 3fd4618bc21c5ec2 3fe724287f46debc 3fd4be5f957778a1
3fe702e05c0b8170 3fd51aad872df82d 3fe6e1f76b4337c7 3fd5767717455a6c 3fe6c16c16c16c17 3fd5d1bdbf5809ca 3fe6a13cd1537290 3fd62c82f2b9c795
3fe6816816816817 3fd686c81e9b14af 3fe661ec6a5122f9 3fd6e08eaa2ba1e4 3fe642c8590b2164 3fd739d7f6bbd007 3fe623fa77016240 3fd792a55fdd47a2
3fe6058160581606 3fd7eaf83b82afc3 3fe5e75bb8d015e7 3fd842d1da1e8b17 3fe5c9882b931057 3fd89a3386c1425b 3fe5ac056b015ac0 3fd8f11e873662c7
3fe58ed2308158ed 3fd947941c2116fb 3fe571ed3c506b3a 3fd99d958117e08b 3fe5555555555555 bfd269621134db92 3fe5390948f40feb bfd214456d0eb8d4
3fe51d07eae2f815 bfd1bf99635a6b95 3fe5015015015015 bfd16b5ccbacfb73 3fe4e5e0a72f0539 bfd1178e8227e47c 3fe4cab88725af6e bfd0c42d676162e3
3fe4afd6a052bf5b bfd07138604d5862 3fe49539e3b2d067 bfd01eae5626c691 3fe47ae147ae147b bfcf991c6cb3b379 3fe460cbc7f5cf9a bfcef5ade4dcffe6
3fe446f86562d9fb bfce530effe71012 3fe42d6625d51f87 bfcdb13db0d48940 3fe4141414141414 bfcd1037f2655e7b 3fe3fb013fb013fb bfcc6ffbc6f00f71
3fe3e22cbce4a902 bfcbd087383bd8ad 3fe3c995a47babe7 bfcb31d8575bce3d 3fe3b13b13b13b14 bfca93ed3c8ad9e3 3fe3991c2c187f63 bfc9f6c407089664
3fe3813813813814 bfc95a5adcf7017f 3fe3698df3de0748 bfc8beafeb38fe8c 3fe3521cfb2b78c1 bfc823c16551a3c2 3fe33ae45b57bcb2 bfc7898d85444c73
3fe323e34a2b10bf bfc6f0128b756abc 3fe30d190130d190 bfc6574ebe8c133a 3fe2f684bda12f68 bfc5bf406b543db2 3fe2e025c04b8097 bfc527e5e4a1b58d
3fe2c9fb4d812ca0 bfc4913d8333b561 3fe2b404ad012b40 bfc3fb45a59928cc 3fe29e4129e4129e bfc365fcb0159016 3fe288b01288b013 bfc2d1610c86813a
3fe27350b8812735 bfc23d712a49c202 3fe25e22708092f1 bfc1aa2b7e23f72a 3fe2492492492492 bfc1178e8227e47c 3fe23456789abcdf bfc08598b59e3a07
3fe21fb78121fb78 bfbfe89139dbd566 3fe20b470c67c0d9 bfbec739830a1120 3fe1f7047dc11f70 bfbda727638446a2 3fe1e2ef3b3fb874 bfbc885801bc4b23
3fe1cf06ada2811d bfbb6ac88dad5b1c 3fe1bb4a4046ed29 bfba4e7640b1bc38 3fe1a7b9611a7b96 bfb9335e5d594989 3fe19453808ca29c bfb8197e2f40e3f0
3fe1811811811812 bfb700d30aeac0e1 3fe16e0689427379 bfb5e95a4d9791cb 3fe15b1e5f75270d bfb4d3115d207eac 3fe1485f0e0acd3b bfb3bdf5a7d1ee64
3fe135c81135c811 bfb2aa04a44717a5 3fe12358e75d3033 bfb1973bd1465567 3fe1111111111111 bfb08598b59e3a07 3fe0fef010fef011 bfaeea31c006b87c
3fe0ecf56be69c90 bfaccb73cdddb2cc 3fe0db20a88f4696 bfaaaef2d0fb10fc 3fe0c9714fbcda3b bfa894aa149fb343 3fe0b7e6ec259dc8 bfa67c94f2d4bb58
3fe0a6810a6810a7 bfa466aed42de3ea 3fe0953f39010954 bfa252f32f8d183f 3fe0842108421084 bfa0415d89e74444 3fe073260a47f7c6 bf9c63d2ec14aaf2
3fe0624dd2f1a9fc bf98492528c8cabf 3fe05197f7d73404 bf9432a925980cc1 3fe0410410410410 bf90205658935847 3fe03091b51f5e1a bf882448a388a2aa
3fe0204081020408 bf8010157588de71 3fe0101010101010 bf70080559588b35 3fe0000000000000 0000000000000000
`.trim().split(/\s+/).map(fromDoubleBits);
export function nativeScalarLogf(input) {
  input = Math.fround(input);
  if (Number.isNaN(input) || input < 0) return NaN;
  if (input === 0) return -Infinity;
  if (input === Infinity) return Infinity;
  view.setFloat32(0, input);
  let bits = view.getUint32(0);
  if (bits < 0x00800000) {
    view.setUint32(0, bits | 0x3f800000);
    const scaled = Math.fround(view.getFloat32(0) - 1);
    view.setFloat32(0, scaled);
    bits = (view.getUint32(0) + 0xc1000000) >>> 0;
  }
  const index = ((bits & 0x7fffff) + 0x8000) >>> 16;
  view.setBigUint64(0, (BigInt(bits) | 0x1ff800000n) << 29n);
  const mantissa = view.getFloat64(0);
  const residual = fma64(mantissa, DATA[4 + 2 * index], -1);
  const exponent = ((bits - 0x3f3f8000) | 0) >> 23;
  const square = residual * residual;
  let result = fma64(exponent, DATA[3], DATA[5 + 2 * index]);
  const polynomial = fma64(residual, DATA[0], DATA[1]);
  result = fma64(residual, DATA[2], result);
  result = fma64(square, polynomial, result);
  return Math.fround(result);
}
