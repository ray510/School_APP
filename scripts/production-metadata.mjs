import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {execFileSync} from 'node:child_process';
const root=process.cwd(),dist=resolve(root,'apps/web/dist-production');
const m=JSON.parse(readFileSync(resolve(dist,'catalog-manifest.json')));
if(m.environment!=='production'||m.coverage_status!=='COMPLETE_SELECTED_OFFICIAL_RESOURCES'||m.sources.some(s=>s.rows!==s.published_rows||s.excluded_rows!==0))throw new Error('Full resource reconciliation required');
const git=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
writeFileSync(resolve(dist,'build-info.json'),JSON.stringify({owner:'ray510/HK_APP',environment:'production',git_sha:git,data_id:m.data_id,built_at:new Date().toISOString(),storage:'versioned-static-assets',private_storage:'browser-indexeddb'},null,2));
writeFileSync(resolve(dist,'robots.txt'),'User-agent: *\nAllow: /\nDisallow: /api/\n');
// Prevent edge HTML injection across pages; keep CSP and hashed asset caching strict.
writeFileSync(resolve(dist,'_headers'),`/*
  Cache-Control: public, max-age=0, must-revalidate, no-transform
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/data/*
  Cache-Control: public, max-age=31536000, immutable
/insights/*
  Cache-Control: public, max-age=31536000, immutable
/insights-manifest.json
  Cache-Control: no-cache, no-transform
/catalog-manifest.json
  Cache-Control: no-cache
/build-info.json
  Cache-Control: no-cache
/shortlist
  X-Robots-Tag: noindex
/compare
  X-Robots-Tag: noindex
  Cache-Control: public, max-age=0, must-revalidate, no-transform
`);
