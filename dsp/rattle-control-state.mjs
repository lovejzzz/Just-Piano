// R+e4 -> H+2f38 -> V+8c4. The two stores occur at distinct native events.
const f=Math.fround;
function value(x){
 if(!Number.isFinite(x)||x<0||x>1)throw new RangeError('Finite Rattle control in [0,1] required');
 return f(x);
}
export class RattleControlState{
 constructor(initial){this.initial=value(initial);this.current=this.initial;this.modal=this.initial;}
 updateSource(x){this.current=value(x);return this.current;}
 commitInitialization(){this.modal=this.initial;return this.modal;}
 commitRuntime(){this.modal=this.current;return this.modal;}
}
