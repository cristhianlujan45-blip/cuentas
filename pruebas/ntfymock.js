// ntfy.sh simulado para las pruebas: POST guarda, /json?poll y /sse devuelven lo guardado.
module.exports = function(ctx){
  const msgs = []; let n = 0;
  const handler = async r => {
    const req = r.request(), u = new URL(req.url());
    if(u.hostname !== 'ntfy.sh') return false;
    const parts = u.pathname.replace(/^\//, '').split('/'), topics = (parts[0] || '').split(',');
    if(req.method() === 'POST'){ const m = { id: 'm' + (++n), time: Math.floor(Date.now() / 1000), event: 'message', topic: topics[0], message: req.postData() || '' }; msgs.push(m); await r.fulfill({ status: 200, body: JSON.stringify(m), headers: { 'access-control-allow-origin': '*' } }); return true; }
    const mine = msgs.filter(m => topics.includes(m.topic));
    if(parts[1] === 'json') await r.fulfill({ status: 200, body: mine.map(m => JSON.stringify(m)).join('\n') + '\n', headers: { 'access-control-allow-origin': '*' } });
    else if(parts[1] === 'sse') await r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: 'retry: 800\n\n' + mine.map(m => 'event: message\ndata: ' + JSON.stringify(m) + '\n\n').join('') });
    else await r.fulfill({ status: 200, body: '' });
    return true;
  };
  return { msgs, handler };
};
