(function(){
  'use strict';
  var APP='icu_scope', KEY='phc_xTtYYkYL5L5eTeQChoaicWTf8HLzEx4QPp5PdqTwycuB', HOST='https://us.i.posthog.com';
  (function(d,w){w.posthog=w.posthog||[];w.posthog.init=function(k,o){var s=d.createElement('script');s.async=true;s.src=(o.api_host||HOST)+'/static/array.js';d.head.appendChild(s);w.posthog.push(['init',k,o])};['capture','identify','reset','register'].forEach(function(m){w.posthog[m]=function(){w.posthog.push([m].concat([].slice.call(arguments)))}})})(document,window);
  posthog.init(KEY,{api_host:HOST,person_profiles:'identified_only',capture_pageview:true,capture_pageleave:true,capture_performance:true,autocapture:true,disable_session_recording:true});
  posthog.register({app:APP});
  function track(e,p){posthog.capture(e,Object.assign({app:APP},p||{}));}
  window.ICUAnalytics={track:track,identify:function(id){if(id)posthog.identify(id,{account_type:'shared_icu_account'});},reset:function(){posthog.reset();}};
  document.addEventListener('click',function(ev){var el=ev.target.closest('a,button');if(!el)return; var id=el.id||'';
    if(id==='knowledge-link')track('platform_opened',{destination:'icu_knowledge'});
    if(id==='simulator-link')track('platform_opened',{destination:'mv_simulator'});
    if(id==='scope-link')track('platform_opened',{destination:'icu_scope'});
    if(el.matches('.bookmark-btn,.save-btn,[data-bookmark],#saved-toggle'))track('scope_article_saved');
    if(el.matches('.article-title,.article-link,a[href*="pubmed"],a[href*="doi.org"]'))track('scope_article_opened',{external:!!el.href});
    if(/start/i.test(el.textContent||'') && /scenario|simulation|exam/i.test(el.textContent||''))track('mv_scenario_started');
  },true);
})();
