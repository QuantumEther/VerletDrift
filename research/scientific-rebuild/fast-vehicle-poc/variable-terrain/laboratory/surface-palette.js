// Rendering colors corresponding to maps.js artwork; never used by contact physics.
export const surfaceNames=['asphalt','gravel','dirt','grass','concrete','rock'];
const common={asphalt:0x44494d,gravel:0x8b8172,dirt:0x756044,grass:0x547448,concrete:0x777b77,rock:0x666f67};
const authored={mountain:{asphalt:0x414648,gravel:0x877f6f,rock:0x666f67},yard:{concrete:0x777b77,gravel:0x6c695f},rally:{dirt:0x896544,gravel:0xa28a67,grass:0x4d6344}};
export function surfacePalette(preset){return {...common,...authored[preset]};}
