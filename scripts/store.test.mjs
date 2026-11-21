import './build.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalEnv } from './local-env.mjs';
const {default:worker} = await import('../dist/server/index.js');
const origin = 'https://store.test';

function fixture() {
  const env=createLocalEnv();
  function call(path,data,cookie,requestOrigin=origin) {
    const upload=data instanceof FormData;
    return worker.fetch(new Request(origin+'/api/'+path,{
      ...(data===undefined?{}:{
        method:'POST',body:upload?data:JSON.stringify(data),
        headers:{origin:requestOrigin,...(upload?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{})},
      }),
      ...(data===undefined&&cookie?{headers:{cookie}}:{}),
    }),env);
  }
  const auth = response => response.headers.get('set-cookie')?.split(';')[0];
  return {env,call,auth};
}
function slip(discriminator) {
  const form = new FormData();
  const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,discriminator]);
  form.set('image',new Blob([png],{type:'image/png'}),'slip.png');
  return form;
}
test('registration, privileges, orders, stock, wallet, uploaded slips and duplicate references',async () => {
  const {call,auth,env}=fixture();
  assert.equal(await (await call('store')).json().then(x=>x.ownerSetup),true);
  const setup=await call('setup',{});
  assert.equal(setup.status,201);
  const admin=auth(setup);
  const credentials=await setup.json();
  assert.match(credentials.password,/^[0-9a-f]{32}$/);
  assert.equal((await call('setup',{})).status,403);
  const signup=await call('signup',{username:'customer1',email:'buyer@example.com',display_name:'ลูกค้าทดลอง',password:'valid-test-password'});
  assert.equal(signup.status,201);
  const customer=auth(signup);
  assert.equal((await call('login',{username:'admin',password:'wrong'})).status,401);
  assert.equal((await call('login',{username:'admin',password:credentials.password})).status,200);
  assert.equal((await call('admin/data',undefined,customer)).status,403);
  assert.equal((await call('admin/data')).status,401);
  assert.equal((await call('admin/settings',{bank:'x'},admin,'https://other.test')).status,403);
  const member=(await (await call('account',undefined,customer)).json()).user;
  const adjust={user:member.id,delta:12000,reason:'ทดลองเครดิต',key:'credit'};
  assert.equal((await call('admin/adjust',adjust,admin)).status,200);
  assert.equal((await call('admin/adjust',adjust,admin)).status,200);
  assert.equal((await call('admin/adjust',{...adjust,delta:-1000,key:'debit'},admin)).status,200);
  const image=(await (await call('admin/images',slip(1),admin)).json()).key;
  const fields={name:'แพ็กเกจทดสอบ',category:'ทดสอบ',description:'คำอธิบาย',price:5900,active:true,image_key:image};
  const product=(await (await call('admin/products',fields,admin)).json()).id;
  assert.equal((await call('images/'+image)).status,200);
  assert.equal((await (await call('store')).json()).products.find(p=>p.id===product).delivery,undefined);
  assert.equal((await call('admin/products',{...fields,id:product,revision:0,name:'แพลนเนอร์ใหม่'},admin)).status,200);
  assert.equal((await call('admin/inventory',{product,codes:'00001-TEST'},admin)).status,201);
  const order={product,quantity:1,price:5900,key:'purchase'};
  const both=await Promise.all([call('orders',order,customer),call('orders',order,customer)]);
  assert.deepEqual(both.map(x=>x.status).sort(),[200,201]);
  assert.equal((await call('orders',{...order,key:'second-purchase'},customer)).status,409);
  assert.equal((await call('admin/products',{...fields,id:product,revision:1},admin)).status,409);
  let account=await (await call('account',undefined,customer)).json();
  assert.equal(account.user.balance,5100);
  assert.equal(account.orders.length,1);
  assert.deepEqual(JSON.parse(account.orders[0].codes),['00001-TEST']);
  assert.equal((await call('topups',slip(2),customer)).status,409);
  assert.equal((await call('admin/settings',{bank:'ทดสอบ',account:'000-0',holder:'ทดสอบ'},admin)).status,200);
  const receipt=await call('topups',slip(2),customer);
  assert.equal(receipt.status,201);
  const pending=await receipt.json();
  assert.equal(pending.status,'pending');
  assert.equal((await call('topups',slip(2),customer)).status,409);
  assert.equal((await call('admin/slips/'+pending.id,undefined,customer)).status,403);
  assert.equal((await call('admin/slips/'+pending.id,undefined,admin)).status,200);
  const approval={id:pending.id,amount:3000,reference:'TXN0001',status:'approved',note:'ทดสอบ'};
  assert.equal((await call('admin/review',approval,admin)).status,200);
  assert.equal((await call('admin/review',approval,admin)).status,409);
  const second=(await (await call('topups',slip(3),customer)).json()).id;
  assert.equal((await call('admin/review',{...approval,id:second},admin)).status,409);
  account=await (await call('account',undefined,customer)).json();
  assert.equal(account.user.balance,8100);
  assert.equal(account.ledger.length,4);
  assert.equal((await (await call('store')).json()).products.find(p=>p.id===product).stock,0);
  assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM orders').get().n,1);
  assert.equal((await call('logout',{},customer)).status,200);
  assert.equal((await call('account',undefined,customer)).status,401);
});

test('automatic verifier credits a matching transaction once and queues receiver mismatch',async t=>{
  const {call,auth,env}=fixture();
  const admin=auth(await call('setup',{}));
  const customer=auth(await call('signup',{username:'member',email:'member@example.com',display_name:'Member',password:'long-test-password'}));
  await call('admin/settings',{bank:'Bank',account:'000',holder:'Store'},admin);
  Object.assign(env,{SLIP_VERIFY_URL:'https://verify.example.test/check',SLIP_VERIFY_KEY:'test-token',SLIP_RECEIVER_ID:'recipient-1'});
  let receiver='recipient-1';
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    assert.equal(url.hostname,'verify.example.test');
    assert.equal(options.headers.authorization,'Bearer test-token');
    assert.ok(options.body.get('image') instanceof File);
    return Response.json({verified:true,currency:'THB',receiverId:receiver,reference:'ABC1234567',amountSatang:9900,transferredAt:new Date().toISOString()});
  });
  assert.equal((await (await call('topups',slip(7),customer)).json()).status,'approved');
  assert.equal((await (await call('topups',slip(8),customer)).json()).status,'rejected');
  receiver='different-recipient';
  assert.equal((await (await call('topups',slip(9),customer)).json()).status,'pending');
  assert.equal((await (await call('account',undefined,customer)).json()).user.balance,9900);
});

test('reference catalog, ordered allocation, mixed duplicate batch rollback and buyer isolation', async () => {
  const {call,auth}=fixture();
  const seeded=await (await call('store')).json();
  assert.equal(seeded.products.length,30);
  assert.equal(new Set(seeded.products.map(p=>p.category)).size,12);
  assert.ok(seeded.products.every(p=>p.stock===0));
  assert.equal((await (await call('store')).json()).products.length,30);
  const product=seeded.products.find(p=>p.category==='Netflix').id;
  const price=seeded.products.find(p=>p.id===product).price;
  const admin=auth(await call('setup',{}));
  const customers=[];
  for (const username of ['buyer-one','buyer-two','buyer-three']) {
    const account=auth(await call('signup',{username,email:username+'@example.test',display_name:username,password:'test-long-password'}));
    const {user}=await (await call('account',undefined,account)).json();
    assert.equal((await call('admin/adjust',{user:user.id,delta:price*3,reason:'test',key:username},admin)).status,200);
    customers.push(account);
  }
  assert.equal((await call('admin/inventory',{product,codes:'not allowed'},customers[0])).status,403);
  assert.equal((await call('admin/inventory',{product,codes:'0001541\r\n\r\n0001542\n0001543'},admin)).status,201);
  assert.equal((await call('admin/inventory',{product,codes:'unused-test\n0001542'},admin)).status,409);
  const first={product,quantity:2,price,key:'first'};
  assert.equal((await call('orders',first,customers[0])).status,201);
  const purchase={product,quantity:1,price,key:'last'};
  const results=await Promise.all(customers.slice(1).map(customer=>call('orders',purchase,customer)));
  assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);
  const firstAccount=await (await call('account',undefined,customers[0])).json();
  assert.deepEqual(JSON.parse(firstAccount.orders[0].codes),['0001541','0001542']);
  assert.equal(firstAccount.user.balance,price);
  const winner=customers[results.findIndex(x=>x.status===201)+1];
  const loser=customers[results.findIndex(x=>x.status===409)+1];
  assert.deepEqual(JSON.parse((await (await call('account',undefined,winner)).json()).orders[0].codes),['0001543']);
  const losingAccount=await (await call('account',undefined,loser)).json();
  assert.equal(losingAccount.orders.length,0);
  assert.equal(losingAccount.user.balance,price*3);
  const publicJson=await (await call('store')).text();
  assert.ok(!publicJson.includes('000154'));
  assert.equal(JSON.parse(publicJson).products.find(p=>p.id===product).stock,0);
  assert.equal((await call('admin/inventory',{product,codes:'0001541'},admin)).status,409);
});
