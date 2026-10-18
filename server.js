const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_TOKEN = process.env.PUBLIC_TOKEN;
const INBOX_TOKEN = process.env.INBOX_TOKEN;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'messages.json');
const MAX_CHARS = 2000;
let windowStarted = Date.now();
let sentInWindow = 0;
const MAX_PER_WINDOW = 8;

if (!PUBLIC_TOKEN || !INBOX_TOKEN || PUBLIC_TOKEN.length < 24 || INBOX_TOKEN.length < 24 || PUBLIC_TOKEN === INBOX_TOKEN) {
  console.error('Set different PUBLIC_TOKEN and INBOX_TOKEN secrets, each at least 24 characters.');
  process.exit(1);
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(title, body) {
 return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow,noarchive"><title>${title}</title>
<style>
:root{color-scheme:light;--ink:#282724;--muted:#77766f;--line:#e9e5e1;--wash:#fbf9f7;--accent:#b76e79}
*{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{width:min(100% - 28px,590px);margin:5vh auto;background:#fff;border:1px solid var(--line);border-radius:24px;padding:clamp(22px,5vw,40px);box-shadow:0 16px 55px #3d211008}
.brand{font-weight:800;letter-spacing:-.04em;font-size:22px}.heart{color:var(--accent)}.eyebrow{margin-top:28px;color:var(--muted);font-size:11px;letter-spacing:.14em;font-weight:750}
h1{font-size:clamp(29px,6vw,40px);line-height:1.12;letter-spacing:-.05em;margin:12px 0}p{color:var(--muted)}
fieldset{border:0;border-top:1px solid var(--line);padding:18px 0 4px;margin:20px 0 0}legend{font-weight:700;padding:0 0 10px}
.choice{display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:12px;padding:12px;margin:8px 0;cursor:pointer}.choice:has(input:checked){border-color:#d8aab0;background:#fff8f8}
input[type=radio]{accent-color:var(--accent);width:17px;height:17px;flex-shrink:0}
textarea{width:100%;font:inherit;border:1px solid var(--line);border-radius:12px;padding:14px;min-height:100px;resize:vertical}
button,.button{display:inline-flex;justify-content:center;width:100%;border:0;border-radius:12px;background:var(--ink);color:#fff;padding:14px 18px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;margin-top:18px}
.small{font-size:12px;color:var(--muted)}.notice{padding:13px 15px;border-radius:13px;background:#fbf3f3;margin:16px 0}.message{border:1px solid var(--line);border-radius:13px;padding:15px;margin:12px 0;overflow-wrap:anywhere;white-space:pre-wrap}.time{font-size:12px;color:var(--muted);margin-bottom:6px}hr{border:0;border-top:1px solid var(--line);margin:22px 0}
</style></head><body><main><div class="brand">тихо<span class="heart"> ♥</span></div>${body}</main></body></html>`;
}
function send(res,status,body) {
 res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});
 res.end(body);
}
async function readMessages(){try{const x=JSON.parse(await fs.readFile(DATA_FILE,'utf8'));return Array.isArray(x)?x:[]}catch(e){if(e.code==='ENOENT')return [];throw e}}
async function writeMessages(items){const tmp=DATA_FILE+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';await fs.writeFile(tmp,JSON.stringify(items,null,2),{mode:0o600});await fs.rename(tmp,DATA_FILE)}
const questions = [
 ['q1','Тебе нравится проводить со мной время?'],
 ['q2','Хочешь узнать, что я давно хотел(а) сказать?'],
 ['q3','У меня к тебе симпатия. Хотел(а) бы ты сходить со мной погулять?']
];
const allowed = {
 q1:['Да, конечно','Иногда / не уверен(а)','Скорее нет'],
 q2:['Да, рассказывай','Теперь интересно','Не сейчас'],
 q3:['Да, давай!','Возможно, мне нужно подумать','Спасибо, но нет']
};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/'){
   return send(res,200,page('Тихо ♥','<div class="eyebrow">НЕБОЛЬШОЕ ПРИЗНАНИЕ</div><h1>Иногда хочется сказать что-то важное.</h1><p>Для продолжения нужна персональная ссылка-приглашение.</p><div class="notice">Если тебе прислали такую ссылку, открой её напрямую.</div>'));
  }
  if(req.method==='GET'&&url.pathname==='/s/'+PUBLIC_TOKEN){
   const body=`<div class="eyebrow">НЕБОЛЬШОЕ ПРИЗНАНИЕ</div><h1>Можно задать тебе пару вопросов? <span class="heart">♥</span></h1>
<p>Отвечай как чувствуешь — здесь нет неправильных ответов.</p>
<form method="post" action="/s/${PUBLIC_TOKEN}">
<fieldset><legend>1. Тебе нравится проводить со мной время?</legend>
${allowed.q1.map(v=>`<label class="choice"><input required type="radio" name="q1" value="${esc(v)}"><span>${esc(v)}</span></label>`).join('')}</fieldset>
<fieldset><legend>2. Хочешь узнать, что я давно хотел(а) сказать?</legend>
${allowed.q2.map(v=>`<label class="choice"><input required type="radio" name="q2" value="${esc(v)}"><span>${esc(v)}</span></label>`).join('')}</fieldset>
<div class="notice"><strong>Есть кое-что важное…</strong><br>Ты мне нравишься. Мне хотелось сказать это честно и без давления.</div>
<fieldset><legend>3. Хотел(а) бы ты как-нибудь сходить со мной погулять?</legend>
${allowed.q3.map(v=>`<label class="choice"><input required type="radio" name="q3" value="${esc(v)}"><span>${esc(v)}</span></label>`).join('')}</fieldset>
<fieldset><legend>Хочешь что-нибудь добавить? <span class="small">(необязательно)</span></legend><textarea name="note" maxlength="${MAX_CHARS}" placeholder="Можно оставить пару слов…"></textarea></fieldset>
<button type="submit">Отправить ответы</button></form>
<p class="small">Без имени и регистрации. Пожалуйста, не добавляй личные данные, которыми не хочешь делиться.</p>`;
   return send(res,200,page('Небольшое признание ♥',body));
  }
  if(req.method==='POST'&&url.pathname==='/s/'+PUBLIC_TOKEN){
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12000)return send(res,413,page('Слишком большой запрос','<h1>Слишком большой ответ</h1><p>Попробуй отправить более короткий текст.</p>'))}
   const p=new URLSearchParams(raw);const answers=[];
   for(const [key,label] of questions){const val=p.get(key)||'';if(!allowed[key].includes(val))return send(res,400,page('Проверь ответы','<h1>Проверь ответы</h1><p>Вернись назад и выбери ответы на вопросы.</p><a class="button" href="/s/'+PUBLIC_TOKEN+'">Назад</a>'));answers.push(label+' '+val)}
   const note=(p.get('note')||'').trim();if(note.length>MAX_CHARS)return send(res,400,page('Слишком длинный текст','<h1>Слишком длинный текст</h1><p>Сократи дополнительное сообщение.</p>'));
   if(note)answers.push('Дополнительно: '+note);
   const now=Date.now();if(now-windowStarted>=60000){windowStarted=now;sentInWindow=0}
   if(sentInWindow>=MAX_PER_WINDOW)return send(res,429,page('Небольшая пауза','<h1>Попробуй позже</h1><p>Слишком много отправок за короткое время.</p>'));
   sentInWindow++;const items=await readMessages();items.push({id:crypto.randomUUID(),createdAt:new Date().toISOString(),message:answers.join('\\n')});await writeMessages(items);
   return send(res,200,page('Ответы отправлены','<div class="eyebrow">СПАСИБО</div><h1>Спасибо за честный ответ <span class="heart">♥</span></h1><p>Твои ответы отправлены. Любой ответ — это нормально.</p>'));
  }
  if(req.method==='GET'&&url.pathname==='/inbox/'+INBOX_TOKEN){
   const items=(await readMessages()).slice().reverse();const content=items.length?items.map(m=>`<article class="message"><div class="time">${esc(new Date(m.createdAt).toLocaleString('ru-RU'))}</div>${esc(m.message)}</article>`).join(''):'<div class="notice">Ответов пока нет.</div>';
   return send(res,200,page('Ответы','<div class="eyebrow">ЛИЧНАЯ СТРАНИЦА</div><h1>Ответы</h1><p>Сохрани эту ссылку в секрете.</p><p class="small">Всего ответов: '+items.length+'</p><hr>'+content));
  }
  return send(res,404,page('Не найдено','<h1>Страница не найдена</h1><p>Проверь ссылку.</p>'));
 }catch(e){console.error('Request failed:',e.message);return send(res,500,page('Ошибка','<h1>Что-то пошло не так</h1><p>Попробуй позже.</p>'))}
});
server.listen(PORT,'0.0.0.0',()=>console.log('Love confession site listening on port '+PORT));
