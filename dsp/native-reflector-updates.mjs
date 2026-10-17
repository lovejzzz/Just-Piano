// 4e3a94/6eb594 left and 8686ec right Householder updates, finite branch.
import {fma64} from './native-double-fma.mjs';
import {nativeHouseholderVector,nativeQrVectorSquaredNorm} from './native-qr-foundation.mjs';
const multiply=(ar,ai,br,bi)=>[fma64(ar,br,-(ai*bi)),fma64(ai,br,ar*bi)];
function finite(values){if(!values.every(Number.isFinite))throw new RangeError('Nonfinite complex multiply fallback is not implemented');return values;}
export function applyNativeReflector({values,rows,columns,vector,side,rowStart=0,rowEnd=rows,columnStart=0,columnEnd=columns}){
  if(![rows,columns,rowStart,rowEnd,columnStart,columnEnd].every(Number.isInteger)||rows<0||columns<0||
     rowStart<0||rowEnd<rowStart||rowEnd>rows||columnStart<0||columnEnd<columnStart||columnEnd>columns||
     values?.length!==2*rows*columns||![...values].every(Number.isFinite)||!['left','right'].includes(side))
    throw new RangeError('Finite column-major matrix, valid submatrix and explicit reflector side required');
  const height=rowEnd-rowStart,width=columnEnd-columnStart,length=side==='left'?height:width;
  if(!length||vector?.length!==length*2)throw new RangeError('Nonempty reflector matching selected matrix dimension required');
  const norm=nativeQrVectorSquaredNorm(vector),beta=-2/norm;
  if(!(norm>0)||!Number.isFinite(beta))throw new RangeError('Finite positive reflector norm required');
  const matrix=Float64Array.from(values),work=new Float64Array(2*(side==='left'?width:height));
  const index=(r,c)=>2*(r+rows*c),scaled=[];
  for(let i=0;i<length;i++)scaled.push(finite(multiply(beta,0,vector[2*i],vector[2*i+1])));
  if(side==='left'){
    // 270a7c/5fe9b4: beta*A^H*v, with a rounded complex product followed by FADD.
    for(let c=0;c<width;c++)for(let r=0;r<height;r++){
      const k=index(rowStart+r,columnStart+c),[vr,vi]=scaled[r],ar=matrix[k],ai=matrix[k+1];
      const product=finite([fma64(ar,vr,ai*vi),fma64(ar,vi,-(ai*vr))]);
      work[2*c]+=product[0];work[2*c+1]+=product[1];
    }
  }else{
    // 9a1cc8/7f5078: beta*A*v, column contributions accumulated in order.
    for(let c=0;c<width;c++)for(let r=0;r<height;r++){
      const k=index(rowStart+r,columnStart+c),product=finite(multiply(...scaled[c],matrix[k],matrix[k+1]));
      work[2*r]+=product[0];work[2*r+1]+=product[1];
    }
  }
  finite(Array.from(work));
  const left=side==='left'?vector:work,right=side==='left'?work:vector;
  // 5cabe8/20efc0/38a010/7cd698: A += left*conj(right). The product's
  // real FMA starts with the right real component; accumulation stays separate.
  for(let c=0;c<width;c++)for(let r=0;r<height;r++){
    const lr=left[2*r],li=left[2*r+1],rr=right[2*c],ri=right[2*c+1],k=index(rowStart+r,columnStart+c);
    const product=finite([fma64(rr,lr,ri*li),fma64(rr,li,-(ri*lr))]);
    matrix[k]+=product[0];matrix[k+1]+=product[1];
  }
  finite(Array.from(matrix));
  return {values:matrix,work,beta,rows,columns,side,nativeQrIterationComputed:false};
}
export function reduceNativeHessenberg({values,order}){
  if(!Number.isInteger(order)||order<0||values?.length!==2*order*order||![...values].every(Number.isFinite))
    throw new RangeError('Finite square complex matrix required');
  let matrix=Float64Array.from(values);const stages=[];
  for(let start=1;start<order-1;start++){
    const input=[];for(let row=start;row<order;row++){const k=2*(row+order*(start-1));input.push(matrix[k],matrix[k+1]);}
    const reflector=nativeHouseholderVector(input);
    const left=applyNativeReflector({values:matrix,rows:order,columns:order,rowStart:start,columnStart:start-1,vector:reflector.values,side:'left'});
    const right=applyNativeReflector({values:left.values,rows:order,columns:order,columnStart:start,vector:reflector.values,side:'right'});
    matrix=right.values;stages.push({start,reflector:reflector.values,leftWork:left.work,rightWork:right.work,leftBeta:left.beta,rightBeta:right.beta});
  }
  return {values:matrix,order,stages,nativeHessenbergComputed:true,nativeQrIterationComputed:false};
}
