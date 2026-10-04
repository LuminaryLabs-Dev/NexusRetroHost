import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
const clientPath = new URL('./web/native.html', import.meta.url);
export async function serve(session, port = 8080) {
  const token = randomBytes(24).toString('hex'), uploads = resolve('build/uploads'); await mkdir(uploads, {recursive:true});
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${server.address().port}`) {res.writeHead(403).end(); return;}
      if(req.method==='GET' && url.pathname==='/pcm.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL(import.meta.resolve('@luminarylabs/nexusengine-kits/pcm-playback'))));return;}
      if (req.method === 'GET' && url.pathname === '/') {res.setHeader('Content-Type','text/html'); res.end(await readFile(clientPath)); return;}
      if (req.headers.authorization !== `Bearer ${token}`) {res.writeHead(403).end(); return;}
      if (req.method !== 'POST') {res.writeHead(405).end(); return;}
      let size=0; const chunks=[]; for await (const chunk of req) {size+=chunk.length; if(size>128*1024*1024) throw new Error('Request budget exceeded');chunks.push(chunk);}
      const bytes=Buffer.concat(chunks); let result;
      if(url.pathname==='/api/load') {
        const name=basename(url.searchParams.get('name')??'content.gb'); if(!/\.(gb|gbc|sfc|smc|nes)$/i.test(name)) throw new Error('Unsupported filename');
        const path=resolve(uploads, `${randomBytes(8).toString('hex')}-${name}`);await writeFile(path,bytes,{flag:'wx'});
        try{const profile=JSON.parse(await readFile(new URL('../profiles/gbmicrotest/profile.json',import.meta.url),'utf8'));const hash='sha256:'+createHash('sha256').update(bytes).digest('hex');result=await session.executeOnce('load',req.headers['x-operation-id']??randomBytes(16).toString('hex'),{contentHash:hash},()=>session.load(path,profile.contentHashes.includes(hash)?profile:null));}finally{await rm(path,{force:true});}
      } else {
        const body=bytes.length?JSON.parse(bytes.toString()):{};
        switch(url.pathname){
          case '/api/step': { const frame=await session.step(body.actions??[]), rgba=session.engine.n.rasterFrame.convert(frame.video,frame.segments.get('video'));result={width:frame.video.width,height:frame.video.height,rgba:Buffer.from(rgba).toString('base64'),audio:Buffer.from(frame.segments.get('audio')??[]).toString('base64'),sampleRate:frame.audio.sampleRate,sourceFrame:session.sourceFrame};break; }
          case '/api/run': session.run();result={status:session.status};break;
          case '/api/pause': session.pause();result={status:session.status};break;
          case '/api/reset': result=await session.executeOnce('reset',body.operationId??randomBytes(16).toString('hex'),{},()=>session.reset());break;
          case '/api/save': result=await session.executeOnce('save',body.operationId??randomBytes(16).toString('hex'),{slot:'browser'},()=>session.save('saves/browser.nrs'));break;
          case '/api/restore': result=await session.executeOnce('restore',body.operationId??randomBytes(16).toString('hex'),{slot:'browser'},()=>session.restore('saves/browser.nrs'));break;
          case '/api/rewind': result=await session.executeOnce('rewind',body.operationId??randomBytes(16).toString('hex'),{frame:body.frame},()=>session.rewind(body.frame));break;
          case '/api/state': result={status:session.status,sourceFrame:session.sourceFrame,semanticState:session.profile?'profiled':'unavailable',history:session.engine.n.observationHistory.list({limit:10}),domains:session.getCoreSnapshots()};break;
          default:res.writeHead(404).end();return;
        }
      }
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
    }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}
  });
  await new Promise((resolveReady,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolveReady);});
  console.log(`Open http://127.0.0.1:${server.address().port}/#${token}`);
  const close=async()=>{server.close();await session.close();};process.once('SIGINT',close);process.once('SIGTERM',close);return server;
}
