// Flat faces match the movement result; the marked flat stick represents 빽도.
export function throwFaces(value){
  const flat=value===-1?1:value===5?0:value;
  return Array.from({length:4},(_,i)=>`${i<flat?'flat':'round'}${value===-1&&i===0?' marked':''}`);
}
