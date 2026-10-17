// Instruction-order exp(double) of this host's arm64 libsystem_m.
// Mathematical constants only; no Pianoteq model, preset or captured return values.
import {fma64} from './modal-poles.mjs';
const view=new DataView(new ArrayBuffer(8));
const number=word=>{view.setBigUint64(0,word);return view.getFloat64(0);};
const bits=value=>{view.setFloat64(0,value);return view.getBigUint64(0);};
const [scaleHigh,scaleLow,c0,c1,c2,c3,c4]=[
  0x40671547652b82fen,
  0x3ce777d0ffda0d24n,
  0x408ef1584af17ecdn,
  0xc0513b4d4879e55en,
  0x4114ffde7cc02cf4n,
  0x4118b31b87eb8904n,
  0x3d25e52272e0eaecn,
].map(number);
const pairs=`
3ff0000000000000 0000000000000000 3ff0163da9fb3335 3d13a4bc88ab6f0b 3ff02c9a3e778060 3d25448c4f3a3faa 3ff04315e86e7f84 3d20cea8d139df85
3ff059b0d3158574 3d04ca556a1b2fa8 3ff0706b29ddf6dd 3d2173b2871f2217 3ff0874518759bc8 3cd87a10f84f53b7 3ff09e3ecac6f383 3d0801b99f4f5b18
3ff0b5586cf9890f 3d1106d9ba253401 3ff0cc922b7247f7 3d06269675ff4e35 3ff0e3ec32d3d1a2 3cb62d2d983e6844 3ff0fb66affed31a 3d24935522e05558
3ff11301d0125b50 3d1bdebf5fb67959 3ff12abdc06c31cb 3d25245852cc8960 3ff1429aaea92ddf 3d1df748a567f8da 3ff15a98c8a58e51 3cf846f8d141b1d0
3ff172b83c7d517a 3d224349c9dfc205 3ff18af9388c8de9 3d1ee14f25e66832 3ff1a35beb6fcb75 3d03dd2c819e0908 3ff1bbe084045cd3 3d192b6b9f4c306a
3ff1d4873168b9aa 3d136c3949dfc34e 3ff1ed5022fcd91c 3d1db25aa6565c95 3ff2063b88628cd6 3d03118ae698d206 3ff21f49917ddc96 3cf7c551db68456f
3ff2387a6e756238 3d1045c6a6d3eecb 3ff251ce4fb2a63f 3d00db2bd14acf32 3ff26b4565e27cdd 3cf77bf4b6a48214 3ff284dfe1f56380 3d177f3dc394bd27
3ff29e9df51fdee1 3cfb5d8e0885ab1b 3ff2b87fd0dad98f 3d2390730108bc38 3ff2d285a6e4030b 3d03a1fee8c9225c 3ff2ecafa93e2f56 3ce5b2c9eff60911
3ff306fe0a31b715 3cfbd9046b69ea24 3ff32170fc4cd831 3d000e3e54fb7d75 3ff33c08b26416ff 3d06fc3180aac683 3ff356c55f929ff0 3d1e07c0017dfc4a
3ff371a7373aa9ca 3d18cb357ddac301 3ff38cae6d05d865 3d13ba556658c94d 3ff3a7db34e59ff6 3d212ee4dbdbae86 3ff3c32dc313a8e4 3d1345c8212d2278
3ff3dea64c123422 3cff31b9fb32e2e4 3ff3fa4504ac801b 3d17378cb7144a8a 3ff4160a21f72e29 3d21d4e28014ce07 3ff431f5d950a896 3d1f7ec78b0a541a
3ff44e086061892d 3cbbf96ee8afb9fb 3ff46a41ed1d0057 3d10283b91b051a3 3ff486a2b5c13cd0 3ce637bd8150db7d 3ff4a32af0d7d3de 3d0cd9f521d33a36
3ff4bfdad5362a27 3cf04715f70da237 3ff4dcb299fddd0d 3d0b942d586961a7 3ff4f9b2769d2ca6 3d17d36cccde36a5 3ff516daa2cf6641 3d1a6a7e10f26745
3ff5342b569d4f81 3d1e59e8ae6a99de 3ff551a4ca5d920e 3d1ab0010b956f3f 3ff56f4736b527da 3d0bb5c29f573dd8 3ff58d12d497c7fd 3cf3e81d7478cc39
3ff5ab07dd485429 3d07a560f05eeddb 3ff5c9268a5946b7 3cadfa723ae1bf17 3ff5e76f15ad2148 3d0d2407ce0f6433 3ff605e1b976dc08 3d171eb321c101b5
3ff6247eb03a5584 3d172ffea320da87 3ff6434634ccc31f 3d19d919a952ca95 3ff6623882552224 3d12b620c0998aac 3ff68155d44ca973 3cd0a350f225390e
3ff6a09e667f3bcc 3d126e8d1ea7de88 3ff6c012750bdabe 3d1e1e012931967d 3ff6dfb23c651a2e 3d1e8b028d2e51bb 3ff6ff7df9519483 3d1a098f71bcc9b0
3ff71f75e8ec5f73 3d1b984227e443e3 3ff73f9a48a58173 3d17807bd5e512c0 3ff75feb564267c8 3d17a16a40378bdb 3ff780694fde5d3f 3d07f77c42eaf147
3ff7a11473eb0186 3d1a5b034b27b244 3ff7c1ed0130c132 3d0e308095c8fab2 3ff7e2f336cf4e62 3cdfa03bd08bcda3 3ff80427543e1a11 3d15df63c009a845
3ff82589994cce12 3d10964d359847c9 3ff8471a4623c7ac 3d18857d98c4418d 3ff868d99b4492ec 3d0e78c3e7b184a0 3ff88ac7d98a6699 3d080f72957b0484
3ff8ace5422aa0db 3d056f6cd720fba3 3ff8cf3216b5448b 3d1bd0cf46f2f2b2 3ff8f1ae99157736 3cf42bc69235780f 3ff9145b0b91ffc5 3d0f715c3d56cd59
3ff93737b0cdc5e4 3d1bf4d1acf902db 3ff95a44cbc8520e 3d1a991ae1b50822 3ff97d829fde4e4f 3d0f9bcff58b04aa 3ff9a0f170ca07b9 3d14f656fe0ffb05
3ff9c49182a3f090 3ce984806660caa6 3ff9e86319e32323 3ce582eb35cac3f3 3ffa0c667b5de564 3d13c8ba7b0b1398 3ffa309bec4a2d33 3d038e88295250ef
3ffa5503b23e255c 3d0e84e556f025f4 3ffa799e1330b358 3d083bde4707301a 3ffa9e6b5579fdbf 3cfd72d3f1e40a93 3ffac36bbfd3f379 3d14cacf4c4b05e2
3ffae89f995ad3ad 3d0445b6038d7018 3ffb0e07298db665 3d0ed34583749cd0 3ffb33a2b84f15fa 3d1a2c7497c16670 3ffb59728de55939 3d0e0244cd9df3b7
3ffb7f76f2fb5e46 3d189f65d4b96070 3ffba5b030a10649 3d0b9006b1da3a39 3ffbcc1e904bc1d2 3cee4bb29d39c3a3 3ffbf2c25bd71e08 3d0b4338a23cfc57
3ffc199bdd85529c 3cec08f260a0042a 3ffc40ab5fffd07a 3d0647d6355e9b74 3ffc67f12e57d14b 3cfe1e92a1c04f0d 3ffc8f6d9406e7b5 3cdc920234dbf34d
3ffcb720dcef9069 3ce0e49a8304ef1f 3ffcdf0b555dc3f9 3d139e87e388d84e 3ffd072d4a07897b 3d0c0ae7070a6c51 3ffd2f87080d89f1 3d0b7531d7fbf731
3ffd5818dcfba487 3cedc682d68358e2 3ffd80e316c98397 3d1256cea656ebcd 3ffda9e603db3285 3d05e51917091778 3ffdd321f301b460 3cfd2ec7bfc90fd9
3ffdfc97337b9b5e 3d11d72cedf8d91c 3ffe264614f5a128 3d0ed88162f63e73 3ffe502ee78b3ff6 3cede1319abb2ae2 3ffe7a51fbc74c83 3cfc86cfb6cd46e4
3ffea4afa2a490d9 3d0926f89159b0a1 3ffecf482d8e67f0 3d0a89ed8a4d4206 3ffefa1bee615a27 3d063124664aaf80 3fff252b376bba97 3cfd19790d732ab4
3fff50765b6e4540 3d0309e68da0499f 3fff7bfdad9cbe13 3d091ff9e4e92cf9 3fffa7c1819e90d8 3cf0fa4931906b80 3fffd3c22b8f71f1 3ccb71923d729650
`.trim().split(/\s+/).map(x=>number(BigInt('0x'+x)));
const upper=number(0x40862e42fefa39f0n),lower=number(0xc0874a0000000000n),minimumNormal=number(0x0010000000000000n);
function shiftExponent(value,exponent){return number(BigInt.asUintN(64,bits(value)+(BigInt(exponent)<<52n)));}
export function nativeDoubleExp(value){
 if(typeof value!=='number')throw new TypeError('Binary64 exponential input required');
 if(Number.isNaN(value))return NaN;
 if(value>=upper)return Infinity;
 if(value<=lower)return 0;
 // FCVTMS -> SCVTF produces positive integer zero, unlike Math.floor(-0).
 const product=value*scaleHigh,n=Math.floor(product)+0,fraction=product-n;
 const error=fma64(-value,scaleHigh,product);
 const correction=fma64(value,scaleLow,-error),index=(n&127)*2;
 const base=pairs[index],low=pairs[index+1]+correction,r=fraction+low;
 const a=fraction+c0,b=fraction+c1;
 const p=fma64(r,a,c2),q=fma64(r,b,c3);
 const polynomial=((r*c4)*p)*q,exponent=Math.floor(n/128);
 if(exponent>=-1022)return shiftExponent(fma64(polynomial,base,base),exponent);
 // Native compensates the final subnormal rounding before multiplying by DBL_MIN.
 const scaled=shiftExponent(base,exponent+1022),sum=scaled+1,rounded=sum-1;
 const residue=fma64(scaled,polynomial,scaled-rounded);
 return ((sum+residue)-1)*minimumNormal;
}
