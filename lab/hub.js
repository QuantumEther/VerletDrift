const grid=document.querySelector('#experiments'),filters=document.querySelector('#filters');
try{
 const items=await fetch('experiments.json').then(r=>{if(!r.ok)throw Error();return r.json();});
 function show(category){grid.replaceChildren();for(const item of items.filter(x=>category==='All'||x.category===category)){const a=document.createElement('a');a.className='card';a.href=`${item.id}/`;for(const [tag,text] of [['small',item.category],['h2',item.title],['p',item.description],['strong','Open experiment ↗']]){const el=document.createElement(tag);el.textContent=text;a.append(el);}grid.append(a);}for(const b of filters.children)b.setAttribute('aria-pressed',String(b.textContent===category));}
 for(const category of ['All',...new Set(items.map(x=>x.category))]){const b=document.createElement('button');b.textContent=category;b.onclick=()=>show(category);filters.append(b);}show('All');
}catch{document.querySelector('#status').textContent='The experiment registry could not load. Please reload this page.';}
