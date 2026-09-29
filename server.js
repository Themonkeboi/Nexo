const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { one, all, run, tx, DATA_DIR, PFP_DIR, MUSIC_DIR } = require('./src/db');
const auth = require('./src/auth');
const sse = require('./src/sse');
const deadSignal = require('./src/dead_signal');
const U = require('./src/utils');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');

function securityHeaders() {
  return {
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'strict-origin-when-cross-origin',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src https: http:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
  };
}
function responseJson(res, status, body, extra={}) { U.json(res,status,body,{...securityHeaders(),...extra}); }
function responseText(res, status, body, extra={}) { U.text(res,status,body,{...securityHeaders(),...extra}); }
function requireUser(req, res) {
  const user = auth.getUser(req);
  if (!user) { responseJson(res,401,{error:'Log in first.'}); return null; }
  sse.touch(user.id); return user;
}
function publicUser(row) {
  if (!row) return null;
  return { id:Number(row.id), username:row.username, bio:row.bio||'', pfp:row.pfp_path ? `/media/pfp/${path.basename(row.pfp_path)}` : '', createdAt:row.created_at, online:sse.online(row.id) };
}
function relation(a,b) {
  const low=Math.min(Number(a),Number(b)), high=Math.max(Number(a),Number(b));
  if (low===high) return {status:'self'};
  if (one('SELECT 1 FROM friendships WHERE user_low=? AND user_high=?',[low,high])) return {status:'friend'};
  const out=one('SELECT id FROM friend_requests WHERE sender_id=? AND receiver_id=?',[a,b]);
  if(out) return {status:'outgoing',requestId:out.id};
  const inc=one('SELECT id FROM friend_requests WHERE sender_id=? AND receiver_id=?',[b,a]);
  if(inc) return {status:'incoming',requestId:inc.id};
  return {status:'none'};
}
function areFriends(a,b){ const l=Math.min(Number(a),Number(b)),h=Math.max(Number(a),Number(b)); return !!one('SELECT 1 FROM friendships WHERE user_low=? AND user_high=?',[l,h]); }
function groupMember(groupId,userId){ return one('SELECT * FROM group_members WHERE group_id=? AND user_id=?',[groupId,userId]); }
function groupCanManage(groupId,userId){ const m=groupMember(groupId,userId); return !!m && ['owner','admin'].includes(m.role); }
function sanitizeChannel(name){ return String(name||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,30); }
function parseUrl(req){ return new URL(req.url, `http://${req.headers.host||'localhost'}`); }

async function api(req,res,url){
  if(url.pathname.startsWith('/api/game/dead-signal')) return deadSignal.api(req,res,url,{requireUser,responseJson});

  // Health
  if(url.pathname==='/api/health' && req.method==='GET') return responseJson(res,200,{ok:true,online:sse.onlineCount()});

  // Auth
  if(url.pathname==='/api/auth/signup' && req.method==='POST'){
    const body=await U.readJsonBody(req); const username=String(body.username||'').trim(); const password=String(body.password||''); const email=String(body.email||'').trim()||null;
    if(!U.validUsername(username)) return responseJson(res,400,{error:'Username must be 3–20 letters, numbers, or underscores.'});
    if(password.length<8||password.length>128) return responseJson(res,400,{error:'Password must be 8–128 characters.'});
    if(!U.validEmail(email)) return responseJson(res,400,{error:'Enter a valid email or leave it blank.'});
    if(one('SELECT 1 FROM users WHERE username=? COLLATE NOCASE',[username])) return responseJson(res,409,{error:'That username already exists.'});
    if(email && one('SELECT 1 FROM users WHERE email=? COLLATE NOCASE',[email])) return responseJson(res,409,{error:'That email is already attached to an account.'});
    const p=auth.makePassword(password); const created=U.now();
    const result=run('INSERT INTO users(username,password_hash,password_salt,email,created_at) VALUES(?,?,?,?,?)',[username,p.hash,p.salt,email,created]);
    const userId=Number(result.lastInsertRowid); run('INSERT INTO user_settings(user_id) VALUES(?)',[userId]);
    const session=auth.newSession(userId); sse.touch(userId);
    return responseJson(res,201,{user:publicUser(one('SELECT * FROM users WHERE id=?',[userId]))},{'Set-Cookie':auth.sessionCookie(session.token,auth.isSecureRequest(req))});
  }
  if(url.pathname==='/api/auth/login' && req.method==='POST'){
    const body=await U.readJsonBody(req); const login=String(body.login||body.username||'').trim(); const password=String(body.password||'');
    const user=one('SELECT * FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE',[login,login]);
    if(!user||!auth.verifyPassword(password,user.password_salt,user.password_hash)) return responseJson(res,401,{error:'Username/email or password is incorrect.'});
    const session=auth.newSession(user.id); sse.touch(user.id);
    return responseJson(res,200,{user:publicUser(user)},{'Set-Cookie':auth.sessionCookie(session.token,auth.isSecureRequest(req))});
  }
  if(url.pathname==='/api/auth/logout' && req.method==='POST'){
    auth.deleteSession(req); return responseJson(res,200,{ok:true},{'Set-Cookie':auth.clearCookie(auth.isSecureRequest(req))});
  }
  if(url.pathname==='/api/auth/me' && req.method==='GET'){
    const user=auth.getUser(req); if(!user) return responseJson(res,401,{error:'Not logged in.'}); sse.touch(user.id);
    const settings=one('SELECT * FROM user_settings WHERE user_id=?',[user.id])||{};
    return responseJson(res,200,{user:publicUser(user),email:user.email||'',emailVerified:!!user.email_verified,settings:{browserTheme:JSON.parse(settings.browser_theme||'{}'),chatTheme:JSON.parse(settings.chat_theme||'{}')}});
  }
  if(url.pathname==='/api/events' && req.method==='GET'){
    const user=requireUser(req,res); if(!user)return; return sse.connect(req,res,user);
  }

  // Settings/profile
  if(url.pathname==='/api/settings' && req.method==='PATCH'){
    const user=requireUser(req,res); if(!user)return; const body=await U.readJsonBody(req);
    const allowedTheme=(value)=>{ const out={}; for(const [k,v] of Object.entries(value||{})) if(/^#[0-9a-fA-F]{6}$/.test(String(v))) out[k]=String(v).toLowerCase(); return out; };
    const browserTheme=allowedTheme(body.browserTheme), chatTheme=allowedTheme(body.chatTheme);
    const current=one('SELECT * FROM user_settings WHERE user_id=?',[user.id]);
    run('UPDATE user_settings SET browser_theme=?,chat_theme=? WHERE user_id=?',[JSON.stringify(Object.keys(browserTheme).length?browserTheme:JSON.parse(current.browser_theme||'{}')),JSON.stringify(Object.keys(chatTheme).length?chatTheme:JSON.parse(current.chat_theme||'{}')),user.id]);
    return responseJson(res,200,{ok:true});
  }
  if(url.pathname==='/api/profile' && req.method==='PATCH'){
    const user=requireUser(req,res); if(!user)return; const body=await U.readJsonBody(req); const bio=String(body.bio||'').trim().slice(0,180); run('UPDATE users SET bio=? WHERE id=?',[bio,user.id]); return responseJson(res,200,{user:publicUser(one('SELECT * FROM users WHERE id=?',[user.id]))});
  }
  if(url.pathname==='/api/profile/pfp' && req.method==='POST'){
    const user=requireUser(req,res); if(!user)return; const mime=String(req.headers['content-type']||'').split(';')[0]; if(!['image/jpeg','image/png','image/webp'].includes(mime)) return responseJson(res,400,{error:'Use JPG, PNG, or WEBP.'});
    const data=await U.readBuffer(req,3*1024*1024); const name=`${user.id}-${U.id()}${U.extensionForMime(mime,'.jpg')}`; const file=path.join(PFP_DIR,name); fs.writeFileSync(file,data); if(user.pfp_path){try{fs.unlinkSync(user.pfp_path)}catch{}} run('UPDATE users SET pfp_path=? WHERE id=?',[file,user.id]); return responseJson(res,200,{pfp:`/media/pfp/${name}`});
  }

  // User search/profile
  if(url.pathname==='/api/users/search' && req.method==='GET'){
    const user=requireUser(req,res); if(!user)return; const q=String(url.searchParams.get('q')||'').trim();
    const rows=q?all('SELECT * FROM users WHERE username LIKE ? COLLATE NOCASE ORDER BY CASE WHEN username=? COLLATE NOCASE THEN 0 WHEN username LIKE ? COLLATE NOCASE THEN 1 ELSE 2 END, username LIMIT 50',[`%${q}%`,q,`${q}%`]):all('SELECT * FROM users ORDER BY username LIMIT 50');
    return responseJson(res,200,{users:rows.map(r=>({...publicUser(r),relationship:relation(user.id,r.id)}))});
  }
  const userProfile=url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if(userProfile && req.method==='GET'){
    const me=requireUser(req,res); if(!me)return; const username=decodeURIComponent(userProfile[1]); const row=one('SELECT * FROM users WHERE username=? COLLATE NOCASE',[username]); if(!row)return responseJson(res,404,{error:'User not found.'});
    return responseJson(res,200,{user:{...publicUser(row),relationship:relation(me.id,row.id)}});
  }

  // Friends
  if(url.pathname==='/api/friends' && req.method==='GET'){
    const user=requireUser(req,res); if(!user)return;
    const friends=all(`SELECT u.* FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_low=? THEN f.user_high ELSE f.user_low END WHERE f.user_low=? OR f.user_high=? ORDER BY u.username`,[user.id,user.id,user.id]).map(publicUser);
    const incoming=all('SELECT fr.id AS request_id,fr.created_at AS request_created,u.* FROM friend_requests fr JOIN users u ON u.id=fr.sender_id WHERE fr.receiver_id=? ORDER BY fr.created_at DESC',[user.id]).map(r=>({id:r.request_id,createdAt:r.request_created,user:publicUser(r)}));
    const outgoing=all('SELECT fr.id AS request_id,fr.created_at AS request_created,u.* FROM friend_requests fr JOIN users u ON u.id=fr.receiver_id WHERE fr.sender_id=? ORDER BY fr.created_at DESC',[user.id]).map(r=>({id:r.request_id,createdAt:r.request_created,user:publicUser(r)}));
    return responseJson(res,200,{friends,incoming,outgoing});
  }
  if(url.pathname==='/api/friends/request' && req.method==='POST'){
    const user=requireUser(req,res); if(!user)return; const body=await U.readJsonBody(req); const target=one('SELECT * FROM users WHERE username=? COLLATE NOCASE',[String(body.username||'').trim()]); if(!target)return responseJson(res,404,{error:'User not found.'}); if(target.id===user.id)return responseJson(res,400,{error:'You cannot add yourself.'});
    if(areFriends(user.id,target.id)) return responseJson(res,409,{error:'You are already friends.'});
    const reverse=one('SELECT * FROM friend_requests WHERE sender_id=? AND receiver_id=?',[target.id,user.id]);
    if(reverse){ tx(()=>{run('DELETE FROM friend_requests WHERE id=?',[reverse.id]); const l=Math.min(user.id,target.id),h=Math.max(user.id,target.id); run('INSERT OR IGNORE INTO friendships(user_low,user_high,created_at) VALUES(?,?,?)',[l,h,U.now()]);}); sse.sendMany([user.id,target.id],'friend_accept',{username:user.username}); return responseJson(res,200,{accepted:true}); }
    if(one('SELECT 1 FROM friend_requests WHERE sender_id=? AND receiver_id=?',[user.id,target.id])) return responseJson(res,409,{error:'Request already sent.'});
    const rid=U.id(); run('INSERT INTO friend_requests(id,sender_id,receiver_id,created_at) VALUES(?,?,?,?)',[rid,user.id,target.id,U.now()]); sse.send(target.id,'friend_request',{id:rid,user:publicUser(user)}); return responseJson(res,201,{ok:true});
  }
  if(url.pathname==='/api/friends/respond' && req.method==='POST'){
    const user=requireUser(req,res); if(!user)return; const body=await U.readJsonBody(req); const reqRow=one('SELECT * FROM friend_requests WHERE id=? AND receiver_id=?',[String(body.requestId||''),user.id]); if(!reqRow)return responseJson(res,404,{error:'Request not found.'});
    const action=String(body.action||''); if(!['accept','decline'].includes(action))return responseJson(res,400,{error:'Invalid action.'});
    if(action==='accept') tx(()=>{run('DELETE FROM friend_requests WHERE id=?',[reqRow.id]); const l=Math.min(reqRow.sender_id,user.id),h=Math.max(reqRow.sender_id,user.id); run('INSERT OR IGNORE INTO friendships(user_low,user_high,created_at) VALUES(?,?,?)',[l,h,U.now()]);}); else run('DELETE FROM friend_requests WHERE id=?',[reqRow.id]);
    sse.send(reqRow.sender_id,action==='accept'?'friend_accept':'friend_decline',{username:user.username}); return responseJson(res,200,{ok:true});
  }

  // Direct messages
  const dm=url.pathname.match(/^\/api\/dms\/([^/]+)$/);
  if(dm && req.method==='GET'){
    const user=requireUser(req,res); if(!user)return; const other=one('SELECT * FROM users WHERE username=? COLLATE NOCASE',[decodeURIComponent(dm[1])]); if(!other)return responseJson(res,404,{error:'User not found.'}); if(!areFriends(user.id,other.id))return responseJson(res,403,{error:'Only friends can message each other.'});
    const messages=all(`SELECT m.*,u.username,u.pfp_path FROM dm_messages m JOIN users u ON u.id=m.sender_id WHERE (m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?) ORDER BY m.created_at DESC LIMIT 150`,[user.id,other.id,other.id,user.id]).reverse().map(m=>({id:m.id,fromId:m.sender_id,from:m.username,body:m.body,createdAt:m.created_at,pfp:m.pfp_path?`/media/pfp/${path.basename(m.pfp_path)}`:''}));
    return responseJson(res,200,{user:publicUser(other),messages});
  }
  if(dm && req.method==='POST'){
    const user=requireUser(req,res); if(!user)return; const other=one('SELECT * FROM users WHERE username=? COLLATE NOCASE',[decodeURIComponent(dm[1])]); if(!other)return responseJson(res,404,{error:'User not found.'}); if(!areFriends(user.id,other.id))return responseJson(res,403,{error:'Only friends can message each other.'}); const body=await U.readJsonBody(req); const msg=String(body.body||'').trim(); if(!msg||msg.length>1500)return responseJson(res,400,{error:'Message must be 1–1500 characters.'}); const row={id:U.id(),sender_id:user.id,receiver_id:other.id,body:msg,created_at:U.now()}; run('INSERT INTO dm_messages(id,sender_id,receiver_id,body,created_at) VALUES(?,?,?,?,?)',[row.id,row.sender_id,row.receiver_id,row.body,row.created_at]); const payload={id:row.id,fromId:user.id,from:user.username,body:msg,createdAt:row.created_at,pfp:user.pfp_path?`/media/pfp/${path.basename(user.pfp_path)}`:''}; sse.sendMany([user.id,other.id],'dm_message',{with:other.id===user.id?user.username:(other.id===user.id?user.username:other.username),message:payload}); return responseJson(res,201,{message:payload});
  }

  // Groups + channels
  if(url.pathname==='/api/groups' && req.method==='GET'){
    const user=requireUser(req,res); if(!user)return; const groups=all(`SELECT g.*,gm.role FROM group_members gm JOIN chat_groups g ON g.id=gm.group_id WHERE gm.user_id=? ORDER BY g.created_at DESC`,[user.id]); return responseJson(res,200,{groups});
  }
  if(url.pathname==='/api/groups' && req.method==='POST'){
    const user=requireUser(req,res); if(!user)return; const body=await U.readJsonBody(req); const name=String(body.name||'').trim().slice(0,40); if(name.length<2)return responseJson(res,400,{error:'Group name is too short.'}); const gid=U.id(),cid=U.id(),created=U.now();
    tx(()=>{run('INSERT INTO chat_groups(id,name,owner_id,created_at) VALUES(?,?,?,?)',[gid,name,user.id,created]); run('INSERT INTO group_members(group_id,user_id,role,joined_at) VALUES(?,?,?,?)',[gid,user.id,'owner',created]); run('INSERT INTO channels(id,group_id,name,position,created_at) VALUES(?,?,?,?,?)',[cid,gid,'general',0,created]); for(const uname of Array.isArray(body.members)?body.members:[]){const member=one('SELECT * FROM users WHERE username=? COLLATE NOCASE',[String(uname)]); if(member&&member.id!==user.id&&areFriends(user.id,member.id))run('INSERT OR IGNORE INTO group_members(group_id,user_id,role,joined_at) VALUES(?,?,?,?)',[gid,member.id,'member',created]);}});
    const members=all('SELECT user_id FROM group_members WHERE group_id=?',[gid]).map(r=>r.user_id); sse.sendMany(members,'group_update',{groupId:gid}); return responseJson(res,201,{groupId:gid});
  }
  const groupMatch=url.pathname.match(/^\/api\/groups\/([^/]+)$/);
  if(groupMatch && req.method==='GET'){
    const user=requireUser(req,res); if(!user)return; const gid=groupMatch[1]; if(!groupMember(gid,user.id))return responseJson(res,403,{error:'You are not in this group.'}); const group=one('SELECT * FROM chat_groups WHERE id=?',[gid]); const channels=all('SELECT * FROM channels WHERE group_id=? ORDER BY position,name',[gid]); const members=all('SELECT gm.role,u.* FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=? ORDER BY u.username',[gid]).map(r=>({...publicUser(r),role:r.role})); return responseJson(res,200,{group,channels,members});
  }
  const groupMembers=url.pathname.match(/^\/api\/groups\/([^/]+)\/members$/);
  if(groupMembers && req.method==='POST'){
    const user=requireUser(req,res); if(!user)return; const gid=groupMembers[1]; if(!groupCanManage(gid,user.id))return responseJson(res,403,{error:'Only group admins can add people.'}); const body=await U.readJsonBody(req); const member=one('SELECT * FROM users WHERE username=? COLLATE NOCASE',[String(body.username||'').trim()]); if(!member)return responseJson(res,404,{error:'User not found.'}); const owner=one('SELECT owner_id FROM chat_groups WHERE id=?',[gid]); if(!areFriends(owner.owner_id,member.id)&&owner.owner_id!==member.id)return responseJson(res,400,{error:'Add them as a friend first.'}); run('INSERT OR IGNORE INTO group_members(group_id,user_id,role,joined_at) VALUES(?,?,?,?)',[gid,member.id,'member',U.now()]); sse.send(member.id,'group_update',{groupId:gid}); return responseJson(res,200,{ok:true});
  }
  const groupChannels=url.pathname.match(/^\/api\/groups\/([^/]+)\/channels$/);
  if(groupChannels && req.method==='POST'){
    const user=requireUser(req,res); if(!user)return; const gid=groupChannels[1]; if(!groupCanManage(gid,user.id))return responseJson(res,403,{error:'Only group admins can create channels.'}); const body=await U.readJsonBody(req); const name=sanitizeChannel(body.name); if(!name)return responseJson(res,400,{error:'Enter a channel name.'}); const cid=U.id(); try{run('INSERT INTO channels(id,group_id,name,position,created_at) VALUES(?,?,?,?,?)',[cid,gid,name,999,U.now()]);}catch{return responseJson(res,409,{error:'That channel already exists.'});} const members=all('SELECT user_id FROM group_members WHERE group_id=?',[gid]).map(r=>r.user_id); sse.sendMany(members,'group_update',{groupId:gid}); return responseJson(res,201,{channelId:cid});
  }
  const channelMsg=url.pathname.match(/^\/api\/channels\/([^/]+)\/messages$/);
  if(channelMsg && req.method==='GET'){
    const user=requireUser(req,res); if(!user)return; const cid=channelMsg[1]; const channel=one('SELECT * FROM channels WHERE id=?',[cid]); if(!channel||!groupMember(channel.group_id,user.id))return responseJson(res,403,{error:'No access to this channel.'}); const messages=all(`SELECT m.*,u.username,u.pfp_path FROM channel_messages m JOIN users u ON u.id=m.sender_id WHERE m.channel_id=? ORDER BY m.created_at DESC LIMIT 200`,[cid]).reverse().map(m=>({id:m.id,fromId:m.sender_id,from:m.username,body:m.body,createdAt:m.created_at,pfp:m.pfp_path?`/media/pfp/${path.basename(m.pfp_path)}`:''})); return responseJson(res,200,{channel,messages});
  }
  if(channelMsg && req.method==='POST'){
    const user=requireUser(req,res); if(!user)return; const cid=channelMsg[1]; const channel=one('SELECT * FROM channels WHERE id=?',[cid]); if(!channel||!groupMember(channel.group_id,user.id))return responseJson(res,403,{error:'No access to this channel.'}); const body=await U.readJsonBody(req); const msg=String(body.body||'').trim(); if(!msg||msg.length>1500)return responseJson(res,400,{error:'Message must be 1–1500 characters.'}); const mid=U.id(),created=U.now(); run('INSERT INTO channel_messages(id,channel_id,sender_id,body,created_at) VALUES(?,?,?,?,?)',[mid,cid,user.id,msg,created]); const payload={id:mid,channelId:cid,fromId:user.id,from:user.username,body:msg,createdAt:created,pfp:user.pfp_path?`/media/pfp/${path.basename(user.pfp_path)}`:''}; const members=all('SELECT user_id FROM group_members WHERE group_id=?',[channel.group_id]).map(r=>r.user_id); sse.sendMany(members,'channel_message',payload); return responseJson(res,201,{message:payload});
  }

  // Music
  if(url.pathname==='/api/music/recent' && req.method==='GET'){
    const rows=all(`SELECT s.*,u.username,u.pfp_path FROM songs s JOIN users u ON u.id=s.uploader_id WHERE s.visibility='public' ORDER BY s.created_at DESC LIMIT 40`); return responseJson(res,200,{songs:rows.map(songDto)});
  }
  if(url.pathname==='/api/music/search' && req.method==='GET'){
    const q=String(url.searchParams.get('q')||'').trim(); const rows=all(`SELECT s.*,u.username,u.pfp_path FROM songs s JOIN users u ON u.id=s.uploader_id WHERE s.visibility='public' AND (s.title LIKE ? COLLATE NOCASE OR u.username LIKE ? COLLATE NOCASE) ORDER BY s.created_at DESC LIMIT 80`,[`%${q}%`,`%${q}%`]); return responseJson(res,200,{songs:rows.map(songDto)});
  }
  if(url.pathname==='/api/music/mine' && req.method==='GET'){
    const user=requireUser(req,res); if(!user)return; const rows=all(`SELECT s.*,u.username,u.pfp_path FROM songs s JOIN users u ON u.id=s.uploader_id WHERE s.uploader_id=? ORDER BY s.created_at DESC`,[user.id]); return responseJson(res,200,{songs:rows.map(songDto)});
  }
  if(url.pathname==='/api/music/upload' && req.method==='POST'){
    const user=requireUser(req,res); if(!user)return; const mime=String(req.headers['content-type']||'').split(';')[0]; if(!mime.startsWith('audio/'))return responseJson(res,400,{error:'Choose an audio file.'}); const data=await U.readBuffer(req,25*1024*1024); if(!data.length)return responseJson(res,400,{error:'Audio file is empty.'}); const title=U.safeHeader(req.headers['x-song-title'],'Untitled').trim().slice(0,120)||'Untitled'; const duration=Math.max(0,Number(req.headers['x-song-duration']||0)||0); const visibility=String(req.headers['x-song-visibility']||'public')==='private'?'private':'public'; const sid=U.id(),name=`${sid}${U.extensionForMime(mime,'.bin')}`,file=path.join(MUSIC_DIR,name); fs.writeFileSync(file,data); const created=U.now(); run('INSERT INTO songs(id,uploader_id,title,file_path,mime,duration,size,visibility,created_at) VALUES(?,?,?,?,?,?,?,?,?)',[sid,user.id,title,file,mime,duration,data.length,visibility,created]); if(visibility==='public')broadcastAll('music_new',{id:sid,title,uploader:user.username,createdAt:created}); return responseJson(res,201,{song:songDto({...one('SELECT * FROM songs WHERE id=?',[sid]),username:user.username,pfp_path:user.pfp_path})});
  }
  const songPatch=url.pathname.match(/^\/api\/music\/([^/]+)$/);
  if(songPatch && req.method==='PATCH'){
    const user=requireUser(req,res); if(!user)return; const song=one('SELECT * FROM songs WHERE id=? AND uploader_id=?',[songPatch[1],user.id]); if(!song)return responseJson(res,404,{error:'Song not found.'}); const body=await U.readJsonBody(req); const title=typeof body.title==='string'?body.title.trim().slice(0,120):song.title; const visibility=['public','private'].includes(body.visibility)?body.visibility:song.visibility; run('UPDATE songs SET title=?,visibility=? WHERE id=?',[title||song.title,visibility,song.id]); return responseJson(res,200,{ok:true});
  }

  return false;
}
function songDto(r){return {id:r.id,title:r.title,uploader:r.username,uploaderPfp:r.pfp_path?`/media/pfp/${path.basename(r.pfp_path)}`:'',duration:Number(r.duration)||0,size:Number(r.size)||0,visibility:r.visibility,createdAt:r.created_at,url:`/media/song/${r.id}`};}
function broadcastAll(event,payload){ for(const r of all('SELECT id FROM users')) sse.send(r.id,event,payload); }

function streamSong(req,res,id){
  const song=one('SELECT * FROM songs WHERE id=?',[id]); if(!song)return responseText(res,404,'Song not found.'); const user=auth.getUser(req); if(song.visibility!=='public'&&(!user||user.id!==song.uploader_id))return responseText(res,403,'Private song.'); if(!fs.existsSync(song.file_path))return responseText(res,404,'Audio file missing.');
  const stat=fs.statSync(song.file_path),range=req.headers.range,mime=song.mime||U.mimeForPath(song.file_path); const common={...securityHeaders(),'Accept-Ranges':'bytes','Content-Type':mime};
  if(range){const m=String(range).match(/bytes=(\d*)-(\d*)/); const start=m&&m[1]?Number(m[1]):0,end=m&&m[2]?Math.min(Number(m[2]),stat.size-1):stat.size-1; if(start>stat.size-1)return responseText(res,416,'Invalid range.',{'Content-Range':`bytes */${stat.size}`}); res.writeHead(206,{...common,'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':end-start+1}); return fs.createReadStream(song.file_path,{start,end}).pipe(res);}
  res.writeHead(200,{...common,'Content-Length':stat.size}); fs.createReadStream(song.file_path).pipe(res);
}

function serveStatic(req,res,url){
  let rel=decodeURIComponent(url.pathname); if(rel==='/')rel='/index.html'; const full=path.normalize(path.join(PUBLIC,rel)); if(!full.startsWith(PUBLIC))return responseText(res,403,'Forbidden.'); if(!fs.existsSync(full)||fs.statSync(full).isDirectory())return responseText(res,404,'Not found.'); res.writeHead(200,{...securityHeaders(),'Content-Type':U.mimeForPath(full),'Cache-Control':'no-store, max-age=0','Pragma':'no-cache'}); fs.createReadStream(full).pipe(res);
}

const server=http.createServer(async(req,res)=>{
  const url=parseUrl(req);
  try{
    if(url.pathname.startsWith('/media/pfp/')){const file=path.join(PFP_DIR,path.basename(url.pathname)); if(!fs.existsSync(file))return responseText(res,404,'Not found.'); res.writeHead(200,{...securityHeaders(),'Content-Type':U.mimeForPath(file),'Cache-Control':'no-cache, must-revalidate'}); return fs.createReadStream(file).pipe(res);}
    if(url.pathname.startsWith('/media/song/'))return streamSong(req,res,decodeURIComponent(url.pathname.slice('/media/song/'.length)));
    if(url.pathname.startsWith('/api/')){const handled=await api(req,res,url); if(handled!==false)return; return responseJson(res,404,{error:'API route not found.'});}
    return serveStatic(req,res,url);
  }catch(err){console.error(err); if(!res.headersSent)responseJson(res,err.status||500,{error:err.status?err.message:'Server error.'}); else try{res.end()}catch{}}
});

auth.cleanupSessions(); setInterval(auth.cleanupSessions,3600000).unref();
function lanUrls(){const out=[];for(const [name,list] of Object.entries(os.networkInterfaces()))for(const n of list||[])if(n.family==='IPv4'&&!n.internal&&!n.address.startsWith('169.254.'))out.push({name,url:`http://${n.address}:${PORT}`});return out;}
function openBrowser(url){if(process.env.NEXO_NO_AUTO_OPEN==='1')return;try{const cmd=process.platform==='win32'?['cmd',['/c','start','',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];const c=spawn(cmd[0],cmd[1],{detached:true,stdio:'ignore',windowsHide:true});c.unref()}catch{}}
server.on('error',err=>{console.error('NEXO server error:',err.message);process.exit(1)});
server.listen(PORT,'0.0.0.0',()=>{console.log(`\nNEXO v4 Day 2 running at http://localhost:${PORT}`);for(const x of lanUrls())console.log(`LAN: ${x.url} (${x.name})`);console.log(`Data: ${DATA_DIR}\n`);openBrowser(`http://localhost:${PORT}`)});
