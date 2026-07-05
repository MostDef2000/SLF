(function(){
  if(typeof window==='undefined') return;

  const K='slf_player_state_v1';

  const load=()=>{
    try{return JSON.parse(localStorage.getItem(K)||'{}')||{}}catch{return{}};
  };

  const save=(s)=>{
    try{localStorage.setItem(K,JSON.stringify(s||{}));}catch(e){console.warn(e);}
  };

  const get=(id)=>load()[id]||null;

  const upsert=(id,patch)=>{
    if(!id) return;
    const s=load();
    s[id]={...(s[id]||{}),...(patch||{}),playerId:id,updatedAt:Date.now()};
    save(s);
  };

  const batchUpsert=(arr)=>{
    const s=load();
    (arr||[]).forEach(x=>{
      if(!x||!x.playerId) return;
      s[x.playerId]={...(s[x.playerId]||{}),...(x.patch||{}),playerId:x.playerId,updatedAt:Date.now()};
    });
    save(s);
  };

  const clear=()=>localStorage.removeItem(K);

  window.SLF=window.SLF||{};
  window.SLF.PlayerStateStore={load:()=>load(),get,upsert,batchUpsert,clear,KEY:K};
})();
