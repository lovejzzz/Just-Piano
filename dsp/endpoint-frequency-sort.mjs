// 7fd9c4: index introsort with float32 frequency comparisons. Kept separate
// from JS stable sort because equal-frequency rows carry different amplitudes.
// Branch structure cross-checked with the local Apple SDK libc++ algorithms.
export function sortEndpointFrequencyIndices(frequencies,{depthLimit}={}){
  if(!frequencies||!Number.isInteger(frequencies.length)||frequencies.length<0||frequencies.length>0xffffffff)
    throw new RangeError('Frequency vector with uint32 length required');
  const values=Array.from(frequencies,Math.fround),n=values.length;
  if(values.some(x=>!Number.isFinite(x)))throw new RangeError('Finite float32 frequencies required');
  const depth=depthLimit===undefined?(n?2*(31-Math.clz32(n)):0):depthLimit;
  if(!Number.isSafeInteger(depth)||depth<0)throw new RangeError('Nonnegative safe integer depth required');
  const indices=Array.from({length:n},(_,i)=>i);
  const branches={small:0,insertion:0,ninther:0,partition:0,equalPartition:0,incomplete:0,heap:0};
  const less=(a,b)=>values[a]<values[b];
  function swap(a,b){const x=indices[a];indices[a]=indices[b];indices[b]=x;}
  // Stable small-array helpers preserve the original order of equal keys.
  function small(slots){
    for(let i=1;i<slots.length;i++){
      const x=indices[slots[i]];let j=i;
      while(j>0&&less(x,indices[slots[j-1]])){indices[slots[j]]=indices[slots[j-1]];j--;}
      indices[slots[j]]=x;
    }
  }
  function insertion(lo,hi,guarded=true){
    for(let i=lo+1;i<hi;i++){
      const x=indices[i];let j=i;
      while((!guarded||j>lo)&&less(x,indices[j-1])){
        if(j<=lo)throw new Error('Native insertion sentinel invariant failed');
        indices[j]=indices[j-1];j--;
      }
      indices[j]=x;
    }
  }
  function incomplete(lo,hi){
    branches.incomplete++;
    if(hi-lo<=5){small(Array.from({length:hi-lo},(_,i)=>lo+i));return true;}
    small([lo,lo+1,lo+2]);let changed=0;
    for(let i=lo+3;i<hi;i++){
      if(!less(indices[i],indices[i-1]))continue;
      const x=indices[i];let j=i;
      do{indices[j]=indices[j-1];j--;}while(j>lo&&less(x,indices[j-1]));
      indices[j]=x;
      if(++changed===8)return i+1===hi;
    }
    return true;
  }
  function heap(lo,hi){
    branches.heap++;const length=hi-lo;
    const childOf=(p,count)=>{
      let c=2*p+1;
      if(c+1<count&&less(indices[lo+c],indices[lo+c+1]))c++;
      return c;
    };
    for(let root=Math.floor((length-2)/2);root>=0;root--){
      let p=root,c=childOf(p,length);const top=indices[lo+p];
      if(less(indices[lo+c],top))continue;
      do{
        indices[lo+p]=indices[lo+c];p=c;
        if(p>Math.floor((length-2)/2))break;
        c=childOf(p,length);
      }while(!less(indices[lo+c],top));
      indices[lo+p]=top;
    }
    for(let count=length;count>1;count--){
      const top=indices[lo];let hole=0;
      do{const c=childOf(hole,count);indices[lo+hole]=indices[lo+c];hole=c;}
      while(hole<=Math.floor((count-2)/2));
      if(hole===count-1){indices[lo+hole]=top;continue;}
      const replacement=indices[lo+count-1];indices[lo+count-1]=top;
      while(hole>0){
        const parent=Math.floor((hole-1)/2);
        if(!less(indices[lo+parent],replacement))break;
        indices[lo+hole]=indices[lo+parent];hole=parent;
      }
      indices[lo+hole]=replacement;
    }
  }
  function run(lo,hi,budget,leftmost){
    while(true){
      const count=hi-lo;
      if(count<=5){branches.small++;small(Array.from({length:count},(_,i)=>lo+i));return;}
      if(count<24){branches.insertion++;insertion(lo,hi,leftmost);return;}
      if(budget===0){heap(lo,hi);return;}
      budget--;
      const middle=lo+Math.floor(count/2);
      if(count>128){
        branches.ninther++;
        small([lo,middle,hi-1]);small([lo+1,middle-1,hi-2]);small([lo+2,middle+1,hi-3]);
        small([middle-1,middle,middle+1]);swap(lo,middle);
      }else small([middle,lo,hi-1]);
      const pivot=indices[lo];let left=lo,right=hi;
      if(!leftmost&&!less(indices[lo-1],pivot)){
        branches.equalPartition++;
        if(less(pivot,indices[hi-1])){do{left++;}while(!less(pivot,indices[left]));}
        else{while(++left<hi&&!less(pivot,indices[left])){}}
        if(left<hi){do{right--;}while(less(pivot,indices[right]));}
        while(left<right){
          swap(left,right);do{left++;}while(!less(pivot,indices[left]));
          do{right--;}while(less(pivot,indices[right]));
        }
        if(lo!==left-1)indices[lo]=indices[left-1];indices[left-1]=pivot;
        lo=left;leftmost=false;continue;
      }
      branches.partition++;
      do{left++;}while(less(indices[left],pivot));
      if(left===lo+1){while(left<right&&!less(indices[--right],pivot)){}}
      else{do{right--;}while(!less(indices[right],pivot));}
      const already=left>=right;
      while(left<right){
        swap(left,right);do{left++;}while(less(indices[left],pivot));
        do{right--;}while(!less(indices[right],pivot));
      }
      const position=left-1;
      if(position!==lo)indices[lo]=indices[position];indices[position]=pivot;
      if(already){
        const doneLeft=incomplete(lo,position),doneRight=incomplete(position+1,hi);
        if(doneRight){if(doneLeft)return;hi=position;continue;}
        if(doneLeft){lo=position+1;continue;}
      }
      run(lo,position,budget,leftmost);lo=position+1;leftmost=false;
    }
  }
  run(0,n,depth,true);
  return {indices,branches,depthLimit:depth,algorithm:'endpoint-index-introsort',nativeTrajectoryVerified:false};
}
