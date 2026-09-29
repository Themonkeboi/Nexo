import{state}from'./state.js';
import{api}from'./api.js';
import{toast}from'./ui.js';

const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];

function avatarNode(user){
  if(user.pfp){
    const img=document.createElement('img');
    img.className='avatar';
    img.src=user.pfp;
    img.alt='';
    return img;
  }
  const d=document.createElement('div');
  d.className='avatar-fallback';
  d.textContent=(user.username||'?')[0].toUpperCase();
  return d;
}

function ensureCreateInviteUI(){
  const form=q('#groupForm');
  if(!form||q('#groupCreateInviteList'))return;
  const hint=qa('#groupForm .muted.small').find(x=>x.textContent.includes('Friends can be added'));
  const wrap=document.createElement('div');
  wrap.className='group-create-invites';
  const label=document.createElement('b');
  label.className='small';
  label.textContent='Invite friends now';
  const list=document.createElement('div');
  list.id='groupCreateInviteList';
  list.className='group-invite-list';
  wrap.append(label,list);
  if(hint)hint.replaceWith(wrap);
  else form.insertBefore(wrap,form.querySelector('.row.end'));
}

function renderCreateInvites(){
  ensureCreateInviteUI();
  const box=q('#groupCreateInviteList');
  if(!box)return;
  box.innerHTML='';
  if(!state.friends.length){
    const empty=document.createElement('div');
    empty.className='muted small';
    empty.textContent='Add some friends first, then you can invite them here.';
    box.appendChild(empty);
    return;
  }
  state.friends.forEach(friend=>{
    const row=document.createElement('label');
    row.className='group-invite-choice';
    const check=document.createElement('input');
    check.type='checkbox';
    check.value=friend.username;
    const info=document.createElement('span');
    const name=document.createElement('b');
    name.textContent=friend.username;
    const status=document.createElement('small');
    status.textContent=friend.online?'Online':'Offline';
    info.append(name,status);
    row.append(check,avatarNode(friend),info);
    box.appendChild(row);
  });
}

function openDmPicker(){
  let overlay=q('#hotfixDmPicker');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='hotfixDmPicker';
    overlay.className='overlay hidden';
    const card=document.createElement('div');
    card.className='modal-card group-invite-card';
    const close=document.createElement('button');
    close.className='icon-btn close';
    close.type='button';
    close.textContent='×';
    close.onclick=()=>overlay.classList.add('hidden');
    const title=document.createElement('h2');
    title.textContent='Private DMs';
    const sub=document.createElement('p');
    sub.className='muted small';
    sub.textContent='Choose a friend to go back to a private conversation.';
    const list=document.createElement('div');
    list.id='hotfixDmList';
    list.className='group-invite-list';
    card.append(close,title,sub,list);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }
  const list=q('#hotfixDmList');
  list.innerHTML='';
  if(!state.friends.length){
    const empty=document.createElement('div');
    empty.className='muted small';
    empty.textContent='You do not have any friends to DM yet.';
    list.appendChild(empty);
  }
  state.friends.forEach(friend=>{
    const row=document.createElement('button');
    row.className='group-invite-row dm-picker-row';
    row.type='button';
    const info=document.createElement('span');
    const name=document.createElement('b');
    name.textContent=friend.username;
    const status=document.createElement('small');
    status.textContent=friend.online?'Online':'Offline';
    info.append(name,status);
    const action=document.createElement('strong');
    action.textContent='Open';
    row.append(avatarNode(friend),info,action);
    row.onclick=()=>{
      overlay.classList.add('hidden');
      const friendsTab=q('[data-chat-tab="friends"]');
      if(friendsTab)friendsTab.click();
      window.dispatchEvent(new CustomEvent('nexo:opendm',{detail:friend.username}));
    };
    list.appendChild(row);
  });
  overlay.classList.remove('hidden');
}

function ensureInviteOverlay(){
  let overlay=q('#hotfixGroupInvite');
  if(overlay)return overlay;
  overlay=document.createElement('div');
  overlay.id='hotfixGroupInvite';
  overlay.className='overlay hidden';
  const card=document.createElement('div');
  card.className='modal-card group-invite-card';
  const close=document.createElement('button');
  close.className='icon-btn close';
  close.type='button';
  close.textContent='×';
  close.onclick=()=>overlay.classList.add('hidden');
  const title=document.createElement('h2');
  title.textContent='Invite Friends';
  const sub=document.createElement('p');
  sub.className='muted small';
  sub.textContent='Add friends to this group without leaving the chat.';
  const list=document.createElement('div');
  list.id='hotfixGroupInviteList';
  list.className='group-invite-list';
  card.append(close,title,sub,list);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  return overlay;
}

function renderGroupInvites(){
  const active=state.activeConversation;
  if(!active||active.type!=='group')return;
  const overlay=ensureInviteOverlay();
  const box=q('#hotfixGroupInviteList');
  box.innerHTML='';
  const members=new Set((active.members||[]).map(x=>x.username.toLowerCase()));
  const available=state.friends.filter(x=>!members.has(x.username.toLowerCase()));
  if(!available.length){
    const empty=document.createElement('div');
    empty.className='muted small';
    empty.textContent='All of your friends are already in this group.';
    box.appendChild(empty);
  }
  available.forEach(friend=>{
    const row=document.createElement('div');
    row.className='group-invite-row';
    const info=document.createElement('span');
    const name=document.createElement('b');
    name.textContent=friend.username;
    const status=document.createElement('small');
    status.textContent=friend.online?'Online':'Offline';
    info.append(name,status);
    const button=document.createElement('button');
    button.className='secondary';
    button.type='button';
    button.textContent='Invite';
    button.onclick=async()=>{
      button.disabled=true;
      button.textContent='Adding...';
      try{
        await api('/api/groups/'+encodeURIComponent(active.id)+'/members',{method:'POST',body:JSON.stringify({username:friend.username})});
        active.members=active.members||[];
        active.members.push({...friend,role:'member'});
        toast(friend.username+' added to the group');
        window.dispatchEvent(new Event('nexo:group'));
        renderGroupInvites();
        syncGroupHeader();
      }catch(err){
        button.disabled=false;
        button.textContent='Invite';
        toast(err.message);
      }
    };
    row.append(avatarNode(friend),info,button);
    box.appendChild(row);
  });
  overlay.classList.remove('hidden');
}

function syncGroupHeader(){
  const header=q('#conversationHeader');
  const active=state.activeConversation;
  if(!header)return;
  qa('.hotfix-group-control').forEach(x=>x.remove());
  if(!active||active.type!=='group')return;

  const back=document.createElement('button');
  back.className='secondary hotfix-group-control hotfix-back-dms';
  back.type='button';
  back.textContent='← DMs';
  back.onclick=openDmPicker;
  header.prepend(back);

  const me=(active.members||[]).find(x=>x.id===state.user?.id);
  if(me&&me.role!=='member'){
    const invite=document.createElement('button');
    invite.className='secondary hotfix-group-control hotfix-invite-group';
    invite.type='button';
    invite.textContent='Invite';
    invite.onclick=renderGroupInvites;
    const channel=q('#addChannel');
    if(channel&&channel.parentNode===header)header.insertBefore(invite,channel);
    else header.appendChild(invite);
  }
}

function wireGroupCreation(){
  ensureCreateInviteUI();
  const newGroup=q('#newGroupBtn');
  if(newGroup)newGroup.addEventListener('click',()=>setTimeout(renderCreateInvites,0));

  const form=q('#groupForm');
  if(!form||form.dataset.hotfixSubmit)return;
  form.dataset.hotfixSubmit='1';
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    event.stopImmediatePropagation();
    const name=(q('#groupName')?.value||'').trim();
    if(!name)return;
    const members=qa('#groupCreateInviteList input:checked').map(x=>x.value);
    try{
      const result=await api('/api/groups',{method:'POST',body:JSON.stringify({name,members})});
      q('#groupOverlay')?.classList.add('hidden');
      if(q('#groupName'))q('#groupName').value='';
      window.dispatchEvent(new Event('nexo:group'));
      q('[data-chat-tab="groups"]')?.click();
      let tries=0;
      const timer=setInterval(()=>{
        tries++;
        const button=qa('#chatSidebar .chat-entry').find(x=>x.textContent.trim()===name);
        if(button){clearInterval(timer);button.click()}
        else if(tries>20)clearInterval(timer);
      },100);
      if(members.length)toast('Group created and friends invited');
    }catch(err){toast(err.message)}
  },true);
}

function syncMobileGame(){
  const stage=q('#deadSignalStage');
  const running=!!stage&&!stage.classList.contains('hidden')&&innerWidth<=720;
  document.body.classList.toggle('ds-game-running',running);
  if(running){
    const chat=q('#dsGameChat');
    const toggle=q('#dsChatToggle');
    if(chat&&toggle&&!chat.classList.contains('collapsed'))toggle.click();
  }
}

function init(){
  wireGroupCreation();
  const header=q('#conversationHeader');
  if(header)new MutationObserver(syncGroupHeader).observe(header,{childList:true,subtree:true});
  const stage=q('#deadSignalStage');
  if(stage)new MutationObserver(syncMobileGame).observe(stage,{attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',syncMobileGame);
  window.addEventListener('nexo:friends',renderCreateInvites);
  syncGroupHeader();
  syncMobileGame();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
