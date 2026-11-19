const ORIGIN = 'https://yuyang990328.github.io';
const MODEL = 'gpt-5.6-sol';
const API_URL = 'https://www.78code.cc/v1/chat/completions';
const SYSTEM = '你是人类摆烂管理局的严苛审批官。先评价申请理由是否充分、是否有实际休息必要，再判断申请时长是否合理。不得为了幽默而一律批准；仅仅想偷懒、普通饭困、短暂疲惫等通常不足以支持一整天休息，更不足以支持三天或一周。不要编造用户未提供的事实。返回严格JSON对象：status(批准/附条件批准/驳回)、score(0-100整数)、authorized(核准时长，驳回填未核准)、comment(60-130字中文，严肃公文语气且幽默，必须符合审核结论)、dept(10字内)、title(12字内)。只有申请理由充分且完整核准所申请时长时才能批准。部分时长只能附条件批准。';
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
   // Normalize the model's decision: partial grants never count as full approval.
   const requested=duration;
   const granted=String(v.authorized||'未核准').trim().slice(0,30);
   const normalize=t=>t.replace(/\\s+/g,'').replace(/仅限|连续|起步|整整|休息|核准|批准|准予|一天|1天/g,m=>m==='一天'||m==='1天'?'今天':'').replace(/三个?天|3天/g,'三天').replace(/七天|7天/g,'一周');
   const full=normalize(granted)===normalize(requested);
   let score=Math.max(0,Math.min(100,Math.round(Number(v.score))));
   let status=v.status;
   if(status==='批准'&&!full)status=granted==='未核准'?'驳回':'附条件批准';
   if(status==='附条件批准'&&full)status='附条件批准';
   if(status==='驳回')score=Math.min(score,44);
   else if(status==='附条件批准')score=Math.max(45,Math.min(score,74));
   else if(score<75){status='附条件批准';score=Math.max(45,score)}
   // If the model's text conflicts with normalized outcome, ask for a consistent official notice.
   let comment=v.comment.slice(0,500);
   if(status!==v.status){comment=status==='驳回'?'经审核，申请事由尚不足以支持所申请的休息时长，本局决定暂不核准。请补充更充分的材料后申请复审。':'经审核，申请事由可以支持适度休息，但不足以核准全部申请时长。本局仅同意'+granted+'，超出部分不予批准。'+comment.replace(/批准(全部|本次|申请|休息|摆烂)/g,'考虑$1');}
   return json({status,score,authorized:status==='驳回'?'未核准':granted,comment,dept:String(v.dept||'综合审批办公室').slice(0,30),title:String(v.title||'摆烂申请人').slice(0,30)});
  }catch(e){return json({error:e.name==='AbortError'?'AI 请求超时':'AI 审批服务暂不可用'},502)}
 }
};