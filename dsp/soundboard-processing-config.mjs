// Ordinary mode-zero producer policy. Numerical views contain no pointers.
export function constructSoundboardProcessingConfig({archive,microphones,geometry,mode=0}){
  if(mode!==0||archive?.modelFeatures?.leadingSilencePresetOverride!==0||
    ![0,1].includes(archive.soundboards?.filters?.[0]?.mode)||!microphones||!Array.isArray(microphones.primary)||
    !(microphones.mixes instanceof Float32Array)||!Array.isArray(geometry))
    throw new RangeError('Supported ordinary model processing policy required');
  const mainCount=microphones.primary.length;
  if(!mainCount||microphones.mixes.length!==mainCount||microphones.mixes.some(v=>!Number.isFinite(v)))
    throw new RangeError('Aligned finite microphone mix controls required');
  const channels=Array.from({length:mainCount*2},(_,channel)=>{
    // Native propagation retains the first, kind-zero source descriptors after
    // accumulating all image contributions into the corresponding channels.
    const representative=geometry.find(g=>g.channel===channel&&g.kind===0);
    if(!representative||!Number.isSafeInteger(representative.identity)||representative.identity<0||
      !Number.isInteger(representative.serial)||representative.serial<0)
      throw new RangeError('Complete ordinary channel representatives required');
    return {identity:String(representative.identity),kind:representative.kind,flag:Number(representative.serial!==0)};
  });
  return {channels,blend:{mainCount,coefficients:microphones.mixes.slice(),kernelLength:0,flags:0,leadingSilenceMode:1},
    nativeProcessingConfigurationUsedForConstruction:false};
}
