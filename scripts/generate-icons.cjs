const fs=require('node:fs/promises');
const path=require('node:path');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
const sharp=createRequire(path.join(root,'web/package.json'))('sharp');

async function generateIcons(){
  const source=await fs.readFile(path.join(__dirname,'assets/storage-icon.svg'));
  const sizes=[16,24,32,48,64,128,256];
  const images=await Promise.all(sizes.map(size=>sharp(source).resize(size,size).flatten({background:'#fff'}).png().toBuffer()));
  const header=Buffer.alloc(6+16*sizes.length);
  header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
  let offset=header.length;
  images.forEach((image,index)=>{
    const entry=6+16*index,size=sizes[index];
    header[entry]=header[entry+1]=size===256?0:size;
    header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);
    header.writeUInt32LE(image.length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=image.length;
  });
  const ico=Buffer.concat([header,...images]),png=images.at(-1);
  for(const [file,bytes] of [['web/public/icon.png',png],['web/public/favicon.ico',ico],['desktop/assets/app-icon.png',png],['desktop/assets/app-icon.ico',ico]]){
    await fs.writeFile(path.join(root,file),bytes);
  }
  console.log('Generated Storage icons: opaque white PNG256 and ICO16/24/32/48/64/128/256.');
}
generateIcons().catch(error=>{console.error(error.message);process.exitCode=1;});
