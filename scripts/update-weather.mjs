import {weatherResponse} from '../worker/weather.ts';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
await mkdir('_site',{recursive:true});
await copyFile('index.html','_site/index.html');
const response=await weatherResponse();if(!response.ok)throw new Error('Official weather unavailable; preserve last deployment');
await writeFile('_site/weather.json',JSON.stringify(await response.json()));
