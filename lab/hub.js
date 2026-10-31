const grid=document.querySelector('#experiments'),filters=document.querySelector('#filters'),sort=document.querySelector('#sort-order');
try{
 const items=await fetch('experiments.json').then(r=>{if(!r.ok)throw Error();return r.json();});
 const latest=Math.max(...items.map(x=>x.sequence));let selected='All';
 function show(){grid.replaceChildren();const list=items.filter(x=>selected==='All'||x.category===selected).sort((a,b)=>sort.value==='oldest'?a.sequence-b.sequence:b.sequence-a.sequence);for(const item of list){const a=document.createElement('a');a.className='card';a.href=`${item.id}/`;for(const [tag,text,cls] of [['span',`No. ${String(item.sequence).padStart(2,'0')}`,'sequence'],['small',`${item.category}${item.sequence===latest?' · Latest':''}`,''],['h2',item.title,''],['p',item.description,''],['strong','Open experiment ↗','']]){const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;a.append(el);}grid.append(a);}for(const b of filters.children)b.setAttribute('aria-pressed',String(b.textContent===selected));}
 for(const category of ['All',...new Set(items.map(x=>x.category))]){const b=document.createElement('button');b.textContent=category;b.onclick=()=>{selected=category;show()};filters.append(b);}sort.onchange=show;show();
}catch{document.querySelector('#status').textContent='The experiment registry could not load. Please reload this page.';}
