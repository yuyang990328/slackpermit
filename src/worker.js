const ORIGIN = 'https://yuyang990328.github.io';
const MODEL = 'gpt-5.6-sol';
const API_URL = 'https://www.78code.cc/v1/chat/completions';
const SYSTEM = '你是人类摆烂管理局审批官。根据用户提供的申请理由和时长认真审核，不能默认批准。文风为一本正经、荒诞有趣的中文行政批复，内容要紧扣理由，不编造用户经历、身份或事实，不使用外星人设定。只输出JSON对象，包含status(批准/附条件批准/驳回)、score(0-100整数)、authorized(核准时长，驳回为未核准)、comment(60-130字)、dept(审查部门，不超过10字)、title(荣誉称号，不超过12字)。结果和批复必须一致。';
const json = (data,status=200,origin=ORIGIN)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':origin,'Vary':'Origin','Cache-Control':'no-store'}});
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'}});
  if(request.method!=='POST'||new URL(request.url).pathname!=='/api/approve')return json({error:'Not found'},404);
  if(origin!==ORIGIN)return json({error:'Forbidden origin'},403);
  if(!env.API_KEY)return json({error:'Cloudflare 未设置 API_KEY Secret'},503);
  const len=Number(request.headers.get('content-length')||0);
  if(len>4096)return json({error:'申请材料过长'},413);
  let body;try{body=await request.json()}catch{return json({error:'请求格式错误'},400)}
  const reason=String(body.reason||'').trim().slice(0,500);
  const duration=String(body.duration||'').slice(0,30);
  const review=Boolean(body.review);
  if(!reason||!duration)return json({error:'缺少申请理由或时长'},400);
  try{
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),25000);
   let response;
   try{response=await fetch(API_URL,{method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+env.API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages:[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify({reason,duration,review})}],temperature:0.85,max_tokens:700})})}finally{clearTimeout(timeout)}
   if(!response.ok)return json({error:'上游 AI 接口请求失败',upstreamStatus:response.status},502);
   const payload=await response.json();
   let raw=payload.choices?.[0]?.message?.content;
   if(typeof raw!=='string')return json({error:'AI 未返回文本'},502);
   raw=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
   const match=raw.match(/\{[\s\S]*\}/);if(!match)return json({error:'AI 返回格式错误'},502);
   const v=JSON.parse(match[0]);
   if(!['批准','附条件批准','驳回'].includes(v.status)||!Number.isFinite(Number(v.score))||typeof v.comment!=='string')return json({error:'AI 审批字段无效'},502);
   return json({status:v.status,score:Math.max(0,Math.min(100,Math.round(Number(v.score)))),authorized:v.status==='驳回'?'未核准':String(v.authorized||duration).slice(0,30),comment:v.comment.slice(0,500),dept:String(v.dept||'综合审批办公室').slice(0,30),title:String(v.title||'摆烂申请人').slice(0,30)});
  }catch(e){return json({error:e.name==='AbortError'?'AI 请求超时':'AI 审批服务暂不可用'},502)}
 }
};