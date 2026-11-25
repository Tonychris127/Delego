const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const root = process.cwd();
const notes = path.join(root,'.validation');
const req = createRequire(path.join(root, 'apps/frontend/package.json'));
const { chromium } = req('@playwright/test');
const merchants = [
 { id:'acme', name:'Acme Groceries', description:'Fresh produce and pantry essentials from local growers.', category:'Food', verificationTier:'verified', reputationScore:90, totalOrdersCompleted:100 },
 { id:'bolt', name:'Bolt Electronics', description:'Thoughtfully selected electronics and everyday accessories.', category:'Electronics', verificationTier:'gold', reputationScore:95, totalOrdersCompleted:20 },
 { id:'cafe', name:'Corner Cafe', description:'Coffee, baked goods, and a warm welcome.', category:'Food', verificationTier:'pro', reputationScore:75, totalOrdersCompleted:4 },
 { id:'new?store', name:'New Store' }
];
let server, browser;
(async () => {
 const vitestReq = createRequire(req.resolve('vitest/package.json'));
 const { createServer } = await import(pathToFileURL(path.join(path.dirname(vitestReq.resolve('vite/package.json')), 'dist/node/index.js')).href);
 server = await createServer({
  configFile:false, root:path.join(notes,'browser'),
  resolve:{ alias:{
   react:path.dirname(req.resolve('react/package.json')),
   'react-dom':path.dirname(req.resolve('react-dom/package.json')),
   '@delegolabs/ui':path.join(root,'packages/ui/src/index.ts')
  }},
  define:{'process.env.NEXT_PUBLIC_API_URL':JSON.stringify('https://api.example.com'),'process.env':{}},
  esbuild:{jsx:'automatic'},
  server:{host:'127.0.0.1',port:3123,strictPort:true,fs:{allow:[root,notes]}}
 });
 await server.listen();
 browser = await chromium.launch();
 const results = [];
 for (const width of [1280,390]) {
  const page = await browser.newPage({viewport:{width,height:1000}});
  page.setDefaultTimeout(120000); page.setDefaultNavigationTimeout(120000);
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://api.example.com/merchants/directory',r=>r.fulfill({json:merchants}));
  await page.goto('http://127.0.0.1:3123',{waitUntil:'domcontentloaded'});
  await page.getByText('4 merchants found').waitFor();
  await page.screenshot({path:path.join(notes,`directory-${width}.png`),fullPage:true});
  const overflow = await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  if(overflow) throw Error(`Horizontal overflow at ${width}`);
  await page.getByLabel('Search merchants').fill(' ACME ');
  await page.getByLabel('Category',{exact:true}).selectOption('Food');
  await page.getByLabel('Verification tier').selectOption('verified');
  await page.getByLabel('Minimum reputation').selectOption('90');
  await page.getByText('1 merchant found',{exact:true}).waitFor();
  if(await page.getByRole('link',{name:'Visit Acme Groceries'}).getAttribute('href')!=='/store/acme') throw Error('Incorrect storefront link');
  await page.screenshot({path:path.join(notes,`filtered-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'Clear filters'}).click();
  await page.getByText('4 merchants found').waitFor();
  await page.getByLabel('Verification tier').selectOption('unverified');
  await page.getByText('Reputation not published').waitFor();
  await page.getByLabel('Minimum reputation').selectOption('50');
  await page.getByText(/No merchants match your filters/).waitFor();
  await page.getByRole('button',{name:'Clear filters'}).click();
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
  await page.screenshot({path:path.join(notes,`dark-${width}.png`),fullPage:true});
  if(errors.length) throw Error(JSON.stringify(errors));
  results.push({width,overflow,combinedFilters:'passed',clearFilters:'passed',missingMetadata:'passed',errors});
  await page.close();
 }
 fs.writeFileSync(path.join(notes,'browser-results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();await server?.close()});
