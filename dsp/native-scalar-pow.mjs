// Scalar powf instruction-order reconstruction for this host's libsystem_m.
// Mathematical range-reduction tables; no Pianoteq model or preset data.
import {fma64} from './modal-poles.mjs';
const f=Math.fround,view=new DataView(new ArrayBuffer(8));
function doubleFromWord(word){view.setBigUint64(0,BigInt('0x'+word));return view.getFloat64(0);}
function floatWord(x){view.setFloat32(0,x);return view.getUint32(0);}
function floatFromWord(x){view.setUint32(0,x>>>0);return view.getFloat32(0);}
const LOG_COEFFICIENTS = `
c0471559dca827eb 404ec71c53b3b1e8 c05715476529654c 40671547652aef42
`.trim().split(/\s+/).map(doubleFromWord);
const LOG_PAIRS = `
3ff6c16c16c16c17 c05042bd4b9a7c99 3ff6a13cd1537290 c050014332be0033 3ff6816816816817 c04f804ae8d0cd02 3ff661ec6a5122f9 c04efec61b011f85
3ff642c8590b2164 c04e7df5fe538ab3 3ff623fa77016240 c04dfdd89d586e2b 3ff6058160581606 c04d7e6c0abc3579 3ff5e75bb8d015e7 c04cffae611ad12b
3ff5c9882b931057 c04c819dc2d45fe4 3ff5ac056b015ac0 c04c043859e2fdb3 3ff58ed2308158ed c04b877c57b1b070 3ff571ed3c506b3a c04b0b67f4f46810
3ff5555555555555 c04a8ff971810a5e 3ff5390948f40feb c04a152f142981b4 3ff51d07eae2f815 c0499b072a96c6b2 3ff5015015015015 c04921800924dd3b
3ff4e5e0a72f0539 c048a8980abfbd32 3ff4cab88725af6e c048304d90c11fd3 3ff4afd6a052bf5b c047b89f02cf2aad 3ff49539e3b2d067 c047418acebbf18f
3ff47ae147ae147b c046cb0f6865c8ea 3ff460cbc7f5cf9a c046552b49986277 3ff446f86562d9fb c045dfdcf1eeae0e 3ff42d6625d51f87 c0456b22e6b578e5
3ff4141414141414 c044f6fbb2cec598 3ff3fb013fb013fb c0448365e695d797 3ff3e22cbce4a902 c044106017c3eca3 3ff3c995a47babe7 c0439de8e1559f6f
3ff3b13b13b13b14 c0432bfee370ee68 3ff3991c2c187f63 c042baa0c34be1ec 3ff3813813813814 c04249cd2b13cd6c 3ff3698df3de0748 c041d982c9d52708
3ff3521cfb2b78c1 c04169c05363f158 3ff33ae45b57bcb2 c040fa848044b351 3ff323e34a2b10bf c0408bce0d95fa38 3ff30d190130d190 c0401d9bbcfa61d4
3ff2f684bda12f68 c03f5fd8a9063e35 3ff2e025c04b8097 c03e857d3d361368 3ff2c9fb4d812ca0 c03dac22d3e441d3 3ff2b404ad012b40 c03cd3c712d31109
3ff29e4129e4129e c03bfc67a7fff4cc 3ff288b01288b013 c03b2602497d5346 3ff27350b8812735 c03a5094b54d2828 3ff25e22708092f1 c0397c1cb13c7ec1
3ff2492492492492 c038a8980abfbd32 3ff23456789abcdf c037d60496cfbb4c 3ff21fb78121fb78 c037046031c79f85 3ff20b470c67c0d9 c03633a8bf437ce1
3ff1f7047dc11f70 c03563dc29ffacb2 3ff1e2ef3b3fb874 c03494f863b8df35 3ff1cf06ada2811d c033c6fb650cde51 3ff1bb4a4046ed29 c032f9e32d5bfdd1
3ff1a7b9611a7b96 c0322dadc2ab3497 3ff19453808ca29c c03162593186da70 3ff1811811811812 c03097e38ce60649 3ff16e0689427379 c02f9c95dc1d1165
3ff15b1e5f75270d c02e0b1ae8f2fd56 3ff1485f0e0acd3b c02c7b528b70f1c5 3ff135c81135c811 c02aed391ab6674e 3ff12358e75d3033 c02960caf9abb7ca
3ff1111111111111 c027d60496cfbb4c 3ff0fef010fef011 c0264ce26c067157 3ff0ecf56be69c90 c024c560fe68af88 3ff0db20a88f4696 c0233f7cde14cf5a
3ff0c9714fbcda3b c021bb32a600549d 3ff0b7e6ec259dc8 c020387efbca869e 3ff0a6810a6810a7 c01d6ebd1f1febfe 3ff0953f39010954 c01a6f9c377dd31b
3ff0842108421084 c0177394c9d958d5 3ff073260a47f7c6 c0147aa07357704f 3ff0624dd2f1a9fc c01184b8e4c56af8 3ff05197f7d73404 c00d23afc49139f9
3ff0410410410410 c00743ee861f3556 3ff03091b51f5e1a c0016a21e20a0a45 3ff0204081020408 bff72c7ba20f7327 3ff0101010101010 bfe720d9c06a835f
3ff0000000000000 0000000000000000 3fefc07f01fc07f0 3ff6fe50b6ef0851 3fef81f81f81f820 4006e79685c2d22a 3fef44659e4a4271 40111cd1d5133413
3fef07c1f07c1f08 4016bad3758efd87 3feecc07b301ecc0 401c4dfab90aab5f 3fee9131abf0b767 4020eb389fa29f9b 3fee573ac901e574 4023aa2fdd27f1c3
3fee1e1e1e1e1e1e 402663f6fac91316 3fede5d6e3f8868a 402918a16e46335b 3fedae6076b981db 402bc84240adabba 3fed77b654b82c34 402e72ec117fa5b2
3fed41d41d41d41d 40308c588cda79e4 3fed0cb58f6ec074 4031dcd197552b7b 3fecd85689039b0b 40332ae9e278ae1a 3feca4b3055ee191 403476a9f983f74d
3fec71c71c71c71c 4035c01a39fbd688 3fec3f8f01c3f8f0 40370742d4ef027f 3fec0e070381c0e0 40384c2bd02f03b3 3febdd2b899406f7 40398edd077e70df
3febacf914c1bad0 403acf5e2db4ec94 3feb7d6c3dda338b 403c0db6cdd94dee 3feb4e81b4e81b4f 403d49ee4c325970 3feb2036406c80d9 403e840be74e6a4d
3feaf286bca1af28 403fbc16b902680a 3feac5701ac5701b 4040790adbb03009 3fea98ef606a63be 40411307dad30b76 3fea6d01a6d01a6d 4041ac05b291f070
3fea41a41a41a41a 40424407ab0e073a 3fea16d3f97a4b02 4042db10fc4d9aaf 3fe9ec8e951033d9 40437124cea4cded 3fe9c2d14ee4a102 404406463b1b0449
3fe999999999999a 40449a784bcd1b8b 3fe970e4f80cb872 40452dbdfc4c96b3 3fe948b0fcd6e9e0 4045c01a39fbd688 3fe920fb49d0e229 4046518fe4677ba7
3fe8f9c18f9c18fa 4046e221cd9d0cde 3fe8d3018d3018d3 404771d2ba7efb3c 3fe8acb90f6bf3aa 404800a563161c54 3fe886e5f0abb04a 40488e9c72e0b226
3fe8618618618618 40491bba891f1709 3fe83c977ab2bedd 4049a802391e232f 3fe8181818181818 404a33760a7f6051 3fe7f405fd017f40 404abe18797f1f49
3fe7d05f417d05f4 404b47ebf73882a1 3fe7ad2208e0ecc3 404bd0f2e9e79031 3fe78a4c8178a4c8 404c592fad295b56 3fe767dce434a9b1 404ce0a4923a587d
3fe745d1745d1746 404d6753e032ea0f 3fe724287f46debc 404ded3fd442364c 3fe702e05c0b8170 404e726aa1e754d2 3fe6e1f76b4337c7 404ef6d67328e220
`.trim().split(/\s+/).map(doubleFromWord);
const EXP_COEFFICIENTS = `
3eeebfbdff30d656 3f762e4453e10dae
`.trim().split(/\s+/).map(doubleFromWord);
const EXP_WORDS = `
3ff0000000000000 3feff63da9fb3335 3fefec9a3e778061 3fefe315e86e7f85 3fefd9b0d3158574 3fefd06b29ddf6de 3fefc74518759bc8 3fefbe3ecac6f383
3fefb5586cf9890f 3fefac922b7247f7 3fefa3ec32d3d1a2 3fef9b66affed31b 3fef9301d0125b51 3fef8abdc06c31cc 3fef829aaea92de0 3fef7a98c8a58e51
3fef72b83c7d517b 3fef6af9388c8dea 3fef635beb6fcb75 3fef5be084045cd4 3fef54873168b9aa 3fef4d5022fcd91d 3fef463b88628cd6 3fef3f49917ddc96
3fef387a6e756238 3fef31ce4fb2a63f 3fef2b4565e27cdd 3fef24dfe1f56381 3fef1e9df51fdee1 3fef187fd0dad990 3fef1285a6e4030b 3fef0cafa93e2f56
3fef06fe0a31b715 3fef0170fc4cd831 3feefc08b26416ff 3feef6c55f929ff1 3feef1a7373aa9cb 3feeecae6d05d866 3feee7db34e59ff7 3feee32dc313a8e5
3feedea64c123422 3feeda4504ac801c 3feed60a21f72e2a 3feed1f5d950a897 3feece086061892d 3feeca41ed1d0057 3feec6a2b5c13cd0 3feec32af0d7d3de
3feebfdad5362a27 3feebcb299fddd0d 3feeb9b2769d2ca7 3feeb6daa2cf6642 3feeb42b569d4f82 3feeb1a4ca5d920f 3feeaf4736b527da 3feead12d497c7fd
3feeab07dd485429 3feea9268a5946b7 3feea76f15ad2148 3feea5e1b976dc09 3feea47eb03a5585 3feea34634ccc320 3feea23882552225 3feea155d44ca973
3feea09e667f3bcd 3feea012750bdabf 3fee9fb23c651a2f 3fee9f7df9519484 3fee9f75e8ec5f74 3fee9f9a48a58174 3fee9feb564267c9 3feea0694fde5d3f
3feea11473eb0187 3feea1ed0130c132 3feea2f336cf4e62 3feea427543e1a12 3feea589994cce13 3feea71a4623c7ad 3feea8d99b4492ed 3feeaac7d98a6699
3feeace5422aa0db 3feeaf3216b5448c 3feeb1ae99157736 3feeb45b0b91ffc6 3feeb737b0cdc5e5 3feeba44cbc8520f 3feebd829fde4e50 3feec0f170ca07ba
3feec49182a3f090 3feec86319e32323 3feecc667b5de565 3feed09bec4a2d33 3feed503b23e255d 3feed99e1330b358 3feede6b5579fdbf 3feee36bbfd3f37a
3feee89f995ad3ad 3feeee07298db666 3feef3a2b84f15fb 3feef9728de5593a 3feeff76f2fb5e47 3fef05b030a1064a 3fef0c1e904bc1d2 3fef12c25bd71e09
3fef199bdd85529c 3fef20ab5fffd07a 3fef27f12e57d14b 3fef2f6d9406e7b5 3fef3720dcef9069 3fef3f0b555dc3fa 3fef472d4a07897c 3fef4f87080d89f2
3fef5818dcfba487 3fef60e316c98398 3fef69e603db3285 3fef7321f301b460 3fef7c97337b9b5f 3fef864614f5a129 3fef902ee78b3ff6 3fef9a51fbc74c83
3fefa4afa2a490da 3fefaf482d8e67f1 3fefba1bee615a27 3fefc52b376bba97 3fefd0765b6e4540 3fefdbfdad9cbe14 3fefe7c1819e90d8 3feff3c22b8f71f1
`.trim().split(/\s+/).map(x=>BigInt('0x'+x));
export function nativeScalarPowf(input,exponent){
 const x=f(input),y=f(exponent);let word=floatWord(x);const absolute=Math.abs(x),ay=Math.abs(y);
 if(x===1)return 1;
 if(y===1)return x;
 if(y===0)return 1;
 if(Number.isNaN(y))return y;
 if(Number.isNaN(x))return x;
 if(!Number.isFinite(y)){
  if(absolute===1)return 1;
  return (absolute>1)===(y>0)?Infinity:0;
 }
 const odd=ay<16777216&&Math.trunc(ay)===ay&&(ay%2===1);
 if(absolute===0||absolute===Infinity){
  const signed=word>>>31&&odd?-absolute:absolute;
  return y<0?f(1/signed):signed;
 }
 let negative=false;
 if(x<0){if(ay<16777216&&Math.trunc(ay)!==ay)return NaN;negative=odd;word&=0x7fffffff;}
 if(word<0x00800000){word=(floatWord(f(floatFromWord(word|0x3f800000)-1))-0x3f000000)>>>0;}
 const reduced=(word-0x3f338000)>>>0,index=(reduced>>>16)&127,exponentBits=reduced&0xff800000;
 const mantissa=floatFromWord((word-exponentBits)>>>0),scaleExponent=exponentBits>>16;
 const residual=fma64(mantissa,LOG_PAIRS[index*2],-1),base=LOG_PAIRS[index*2+1]+scaleExponent;
 const square=residual*residual;
 const p=fma64(residual,LOG_COEFFICIENTS[0],LOG_COEFFICIENTS[1]);
 const q=fma64(residual,LOG_COEFFICIENTS[2],LOG_COEFFICIENTS[3]);
 const logarithm=fma64(fma64(p,square,q),residual,base);
 const product=Math.max(-32768,Math.min(32768,y*logarithm));
 const truncated=Math.trunc(product),rounded=Math.abs(product-truncated)>=0.5?truncated+(product<0?-1:1):truncated,r=product-rounded;
 const scaleWord=BigInt.asUintN(64,EXP_WORDS[rounded&127]+(BigInt(rounded)<<45n));
 view.setBigUint64(0,scaleWord);const scale=view.getFloat64(0);
 const polynomial=fma64(EXP_COEFFICIENTS[0],r,EXP_COEFFICIENTS[1])*r;
 const result=f(fma64(polynomial,scale,scale));return negative?-result:result;
}
