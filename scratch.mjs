const spec = (() => {
  const table = [];
  let r = 0xc4;
  for (let i = 0; i < 255; i++) {
    const objectType = r & 0x07;
    const sceneType = (r >> 3) & 0x07;
    table.push({
      rand: r,
      objectType,
      sceneType,
      treePat: (r >> 6) & 0x03,
    });
    const b3 = (r >> 3) & 1, b4 = (r >> 4) & 1, b5 = (r >> 5) & 1, b7 = (r >> 7) & 1;
    r = ((r << 1) & 0xff) | (b3 ^ b4 ^ b5 ^ b7);
  }
  return table;
})();

const getScreenType = (index) => {
    const s = spec[((index % 255) + 255) % 255];
    if (s.sceneType === 4) {
      return (s.objectType & 2) !== 0 ? 'CROCODILE_VINE' : 'CROCODILE_POND';
    }
    const base = [
      'HOLE_SINGLE',            
      'HOLE_TRIPLE',            
      'TAR_PIT_VINE',           
      'QUICKSAND_VINE',         
      'CROCODILE_VINE',         
      'DISAPPEARING_QUICKSAND', 
      'QUICKSAND_VINE_OPEN',    
      'BLUE_QUICKSAND',         
    ][s.sceneType];
    
    // check if it is overridden? 
    // wait, in the current world.js, there is NO override. It just returns base!
    return base;
}

console.log("Index 14 (Screen 15):", getScreenType(14), spec[14]);
console.log("Index 15 (Screen 16):", getScreenType(15), spec[15]);
