const ORIGIN = 'https://yuyang990328.github.io';
const MODEL = 'gpt-5.6-sol';
const API_URL = 'https://www.78code.cc/v1/chat/completions';
const SYSTEM = '你是人类摆烂管理局审批官：极其较真，一本正经地胡说八道，擅长用荒诞官僚逻辑回应具体申请。认真判断理由是否充分、所申请时长是否合理，不默认批准。只允许两种结果：批准、驳回。只有充分支持完整申请时长才能批准；只支持几小时、半天或部分日期时，一律驳回本次申请，绝不附条件批准。普通饭困、想摸鱼、短暂疲惫通常不足以支持全天，更不足以支持三天或一周。分数75-100为批准，0-74为驳回。批复要具体、出人意料、有趣，不要机械模板，不得编造用户经历、事实或身份；可以建议缩短申请，但不得称已批准部分时长。只输出JSON：status(批准/驳回)、score(0-100整数)、authorized(批准时必须与用户申请时长完全一致，驳回时为未核准)、comment(60-130字中文，须明确与status一致)、dept(10字内)、title(6-12字的荒诞荣誉称号)。称号必须针对申请理由中的具体细节，像一本正经的奇怪头衔，有反差和笑点；禁止使用“全天摆烂驳回令”“休息申请人”“摆烂观察员”等泛泛称号，称号不能只是把审批状态改写一遍。参考创作方向：饭困可用“碳水工伤申报专员”，赖床可用“被窝驻外全权代表”，但不要固定套用。';
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
   if(!['批准','驳回'].includes(v.status)||!Number.isFinite(Number(v.score))||typeof v.comment!=='string')return json({error:'AI 审批字段无效'},502);
   const requested=duration;
   const granted=String(v.authorized||'未核准').trim();
   const normalized=t=>t.replace(/\\s+/g,'').replace(/仅限|连续|起步|整整|休息|核准|批准|准予/g,'').replace(/一天|1天/g,'今天').replace(/三个?天|3天/g,'三天').replace(/七天|7天/g,'一周');
   const full=normalized(granted)===normalized(requested);
   const scoreRaw=Math.max(0,Math.min(100,Math.round(Number(v.score))));
   const approved=v.status==='批准'&&full&&scoreRaw>=75;
   const status=approved?'批准':'驳回';
   const score=approved?scoreRaw:Math.min(scoreRaw,74);
   let comment=v.comment.slice(0,500);
   if(!approved&&v.status==='批准'){
    comment='经本局逐项核查，申请理由尚不足以支持所申请的全部休息时长。本局不受理将短暂困倦打包申报为长期摆烂的扩大解释，故驳回本次申请。'+(granted!=='未核准'?'建议按实际需要重新申请，不能将建议时长视作已获批准。':'');
   }
   return json({status,score,authorized:approved?requested:'未核准',comment,dept:String(v.dept||'综合审批办公室').slice(0,30),title:String(v.title||'摆烂申请人').slice(0,30)});
  }catch(e){return json({error:e.name==='AbortError'?'AI 请求超时':'AI 审批服务暂不可用'},502)}
 }
};