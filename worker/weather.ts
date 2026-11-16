import type {Weather} from '../app/weather-related';
const source='https://www.cwa.gov.tw/V8/C/W/Town/MOD/3hr/1000913_3hr_PC.html';
const historySource='https://www.cwa.gov.tw/Data/js/GT/ChartData_GT24hr_T_10009.js';
let cached:{at:number;data:Weather}|undefined;
const strip=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').trim();
const dateInTaipei=(now:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
function number(s:string,min:number,max:number){if(!s.trim())return null;const n=Number(s);return Number.isFinite(n)&&n>=min&&n<=max?n:null}
function clock(h:number){return `${String(h).padStart(2,'0')}:00`}
// Read only narrowly validated scalar values from the official page. Never evaluate upstream JS.
export function parseWeather(html:string,history:string,now=new Date()):Weather{
 const date=dateInTaipei(now),[year,month,dayOfMonth]=date.split('-').map(Number);
 const headers=[...html.matchAll(/<th id="PC3_D(\d+)"[^>]*headers="PC3_D"[^>]*>([\s\S]*?)<\/th>/g)];
 const day=headers.find(m=>strip(m[2]).split(/\s/)[0]===`${month}/${dayOfMonth}`)?.[1];
 const forecasts=new Map<number,number>();
 type Cell={hours:number[];body:string};
 function cells(key:string):Cell[]{if(!day)return [];return [...html.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)].flatMap(m=>{const heads=m[1].match(/headers="([^"]+)"/)?.[1].split(/\s+/)||[];if(!heads.includes(`PC3_${key}`)||!heads.includes(`PC3_D${day}`))return [];const hours=heads.flatMap(h=>{const match=h.match(new RegExp(`^PC3_D${day}H(\\d{2})$`));return match?[Number(match[1])]:[]});return [{hours,body:m[2]}]})}
 for(const cell of cells('T')){const raw=cell.body.match(/<span class="tem-C[^\"]*">([^<]+)<\/span>/)?.[1]||'';const value=number(strip(raw),-20,55);if(value!==null)for(const h of cell.hours)if(h>=8&&h<=20)forecasts.set(h,value)}
 const past=new Map<number,number>();
 const updated=history.match(/Updated:\s*(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
 const updatedAt=updated?Date.parse(`${updated[1]}-${updated[2]}-${updated[3]}T${updated[4]}:${updated[5]}:${updated[6]}+08:00`):NaN;
 if(Number.isFinite(updatedAt)&&now.getTime()-updatedAt>=-300000&&now.getTime()-updatedAt<=7200000){
  const labels=history.match(/var Time_24hr\s*=\s*\{\s*'C'\s*:\s*\[([\s\S]*?)\]/)?.[1];
  const values=history.match(/'1000913'\s*:\s*\{\s*'C'\s*:\s*\{\s*'T'\s*:\s*\[([^\]]+)\]/)?.[1];
  if(labels&&values){const times=[...labels.matchAll(/'([^']*)'/g)].map(m=>m[1]),temperatures=values.split(',');if(times.length===temperatures.length)times.forEach((label,i)=>{const m=label.match(/^(\d{2})\s+(\d{1,2})\/(\d{1,2})/);const value=number(temperatures[i],-20,55);if(!m||Number(m[2])!==month||Number(m[3])!==dayOfMonth||value===null)return;const h=Number(m[1]);const timestamp=Date.parse(`${year}-${String(month).padStart(2,'0')}-${String(dayOfMonth).padStart(2,'0')}T${clock(h)}:00+08:00`);if(h>=8&&h<=20&&timestamp<=now.getTime())past.set(h,value)})}
 }
 const values:number[]=[];let historical=0,forecasted=0;
 for(let hour=8;hour<=20;hour++){if(past.has(hour)){values.push(past.get(hour)!);historical++}else if(forecasts.has(hour)){values.push(forecasts.get(hour)!);forecasted++}}
 const complete=values.length===13;
 const relevant=(key:string)=>cells(key).filter(c=>c.hours.some(h=>h>=8&&h<=20));
 const pop= relevant('Po').flatMap(c=>{const value=number(strip(c.body).replace('%',''),0,100);return value===null?[]:[{value,hours:c.hours.filter(h=>h>=8&&h<=20)}]});
 const wind=relevant('MS').flatMap(c=>{const value=number(strip(c.body),0,100);return value===null?[]:[value]});
 const descriptions=[...new Set(relevant('Wx').flatMap(c=>c.body.match(/title="([^"]+)"/)?.[1]||[]))];
 if(!complete&&!forecasts.size&&!past.size)throw new Error('No current-day data');
 const popHours=pop.flatMap(p=>p.hours);
 return {date,low:complete?Math.min(...values):null,high:complete?Math.max(...values):null,popLow:pop.length?Math.min(...pop.map(p=>p.value)):null,popHigh:pop.length?Math.max(...pop.map(p=>p.value)):null,wind:wind.length?Math.max(...wind):null,description:descriptions.join('／'),retrievedAt:now.toISOString(),source:'https://www.cwa.gov.tw/V8/C/W/Town/Town.html?TID=1000913',windowStart:'08:00',windowEnd:'20:00',temperatureBasis:historical&&forecasted?'歷史＋預報':historical?'歷史資料':'預報',popStart:popHours.length?clock(Math.min(...popHours)):null,popEnd:popHours.length?clock(Math.max(...popHours)):null};
}
export async function weatherResponse():Promise<Response>{
 try{
  const today=dateInTaipei(new Date());
  if(!cached||cached.data.date!==today||Date.now()-cached.at>300000){const read=async(url:string)=>{const r=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('CWA unavailable');return r.text()};const [forecast,history]=await Promise.all([read(source),read(historySource).catch(()=>'')]);cached={at:Date.now(),data:parseWeather(forecast,history)}}
  return Response.json(cached.data,{headers:{'Cache-Control':'public, max-age=300','Access-Control-Allow-Origin':'*'}});
 }catch{return Response.json({error:'目前無法取得麥寮鄉當天天氣，請稍後再試。'},{status:503,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}})}
}
