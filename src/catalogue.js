// Signature catalogue: tracker fingerprints, CMS and builder markers, verification
// metas, social hosts and security headers.
// Add a signature here, then run tests/tech_test.js before committing.
(function (root) {
  const catalogue = {
 "source": "signature catalogue",
 "trackers": [
  {
   "key": "gtm",
   "name": "Google Tag Manager",
   "category": "tag_manager",
   "patterns": [
    "googletagmanager\\.com/gtm\\.js",
    "\\bGTM-[A-Z0-9]{4,}"
   ],
   "id_patterns": [
    "\\b(GTM-[A-Z0-9]{4,10})\\b"
   ]
  },
  {
   "key": "adobe_launch",
   "name": "Adobe Launch / DTM",
   "category": "tag_manager",
   "patterns": [
    "assets\\.adobedtm\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "tealium",
   "name": "Tealium iQ",
   "category": "tag_manager",
   "patterns": [
    "tags\\.tiqcdn\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "ga4",
   "name": "Google Analytics 4",
   "category": "analytics",
   "patterns": [
    "googletagmanager\\.com/gtag/js\\?id=G-",
    "\\bG-[A-Z0-9]{6,12}\\b",
    "google-analytics\\.com/g/collect",
    "analytics\\.google\\.com/g/collect",
    "gtag\\(\\s*[\"\\']config[\"\\']\\s*,\\s*[\"\\']G-",
    "\"measurementId\"\\s*:\\s*\"G-"
   ],
   "id_patterns": [
    "\\b(G-[A-Z0-9]{6,12})\\b"
   ]
  },
  {
   "key": "ua",
   "name": "Universal Analytics",
   "category": "analytics",
   "dead": "Stopped collecting data 1 Jul 2023, this tag is dead and should be removed",
   "patterns": [
    "\\bUA-\\d{4,10}-\\d{1,3}\\b",
    "google-analytics\\.com/analytics\\.js",
    "gtag\\(\\s*[\"\\']config[\"\\']\\s*,\\s*[\"\\']UA-"
   ],
   "id_patterns": [
    "\\b(UA-\\d{4,10}-\\d{1,3})\\b"
   ]
  },
  {
   "key": "clarity",
   "name": "Microsoft Clarity",
   "category": "session_recording",
   "patterns": [
    "clarity\\.ms/tag/",
    "\\bclarity\\s*\\(\\s*[\"\\']set"
   ],
   "id_patterns": [
    "clarity\\.ms/tag/([a-z0-9]{6,})"
   ]
  },
  {
   "key": "hotjar",
   "name": "Hotjar",
   "category": "session_recording",
   "patterns": [
    "static\\.hotjar\\.com",
    "\\bhjid\\s*[:=]\\s*\\d+"
   ],
   "id_patterns": [
    "hjid\\s*[:=]\\s*(\\d{5,9})"
   ]
  },
  {
   "key": "matomo",
   "name": "Matomo / Piwik",
   "category": "analytics",
   "patterns": [
    "matomo\\.js",
    "piwik\\.js",
    "_paq\\.push"
   ],
   "id_patterns": []
  },
  {
   "key": "plausible",
   "name": "Plausible Analytics",
   "category": "analytics",
   "patterns": [
    "plausible\\.io/js"
   ],
   "id_patterns": []
  },
  {
   "key": "fathom",
   "name": "Fathom Analytics",
   "category": "analytics",
   "patterns": [
    "usefathom\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "heap",
   "name": "Heap",
   "category": "analytics",
   "patterns": [
    "heap-\\d+\\.js",
    "cdn\\.heapanalytics\\.com",
    "heap\\.load\\("
   ],
   "id_patterns": [
    "heap\\.load\\(\\s*[\"\\'](\\d+)"
   ]
  },
  {
   "key": "mixpanel",
   "name": "Mixpanel",
   "category": "analytics",
   "patterns": [
    "cdn\\.mxpnl\\.com",
    "mixpanel\\.init"
   ],
   "id_patterns": []
  },
  {
   "key": "amplitude",
   "name": "Amplitude",
   "category": "analytics",
   "patterns": [
    "cdn\\.amplitude\\.com",
    "amplitude\\.getInstance"
   ],
   "id_patterns": []
  },
  {
   "key": "segment",
   "name": "Segment",
   "category": "analytics",
   "patterns": [
    "cdn\\.segment\\.com/analytics\\.js"
   ],
   "id_patterns": []
  },
  {
   "key": "adobe_analytics",
   "name": "Adobe Analytics",
   "category": "analytics",
   "patterns": [
    "\\.omtrdc\\.net",
    "\\bs_code\\.js",
    "AppMeasurement"
   ],
   "id_patterns": []
  },
  {
   "key": "cf_insights",
   "name": "Cloudflare Web Analytics",
   "category": "analytics",
   "patterns": [
    "static\\.cloudflareinsights\\.com/beacon"
   ],
   "id_patterns": []
  },
  {
   "key": "yandex_metrica",
   "name": "Yandex Metrica",
   "category": "analytics",
   "patterns": [
    "mc\\.yandex\\.ru/metrika"
   ],
   "id_patterns": []
  },
  {
   "key": "google_ads",
   "name": "Google Ads (conversion / remarketing)",
   "category": "advertising",
   "patterns": [
    "\\bAW-\\d{9,11}\\b",
    "googleadservices\\.com/pagead/conversion"
   ],
   "id_patterns": [
    "\\b(AW-\\d{9,11})\\b"
   ]
  },
  {
   "key": "floodlight",
   "name": "Google Floodlight (DoubleClick)",
   "category": "advertising",
   "patterns": [
    "\\bDC-\\d{6,9}\\b",
    "fls\\.doubleclick\\.net"
   ],
   "id_patterns": [
    "\\b(DC-\\d{6,9})\\b"
   ]
  },
  {
   "key": "meta_pixel",
   "name": "Meta Pixel (Facebook)",
   "category": "advertising",
   "patterns": [
    "connect\\.facebook\\.net/[^\"\\']*fbevents\\.js",
    "\\bfbq\\s*\\(",
    "facebook\\.com/tr\\?"
   ],
   "id_patterns": [
    "fbq\\s*\\(\\s*[\"\\']init[\"\\']\\s*,\\s*[\"\\'](\\d{8,20})",
    "facebook\\.com/tr\\?id=(\\d{8,20})",
    "\"pixelId\"\\s*:\\s*\"(\\d{8,20})\""
   ]
  },
  {
   "key": "linkedin",
   "name": "LinkedIn Insight Tag",
   "category": "advertising",
   "patterns": [
    "snap\\.licdn\\.com",
    "_linkedin_partner_id",
    "px\\.ads\\.linkedin\\.com"
   ],
   "id_patterns": [
    "_linkedin_partner_id\\s*=\\s*[\"\\'](\\d{5,9})"
   ]
  },
  {
   "key": "tiktok",
   "name": "TikTok Pixel",
   "category": "advertising",
   "patterns": [
    "analytics\\.tiktok\\.com",
    "\\bttq\\.load\\("
   ],
   "id_patterns": [
    "ttq\\.load\\(\\s*[\"\\']([A-Z0-9]{10,});?[\"\\']",
    "sdkid=([A-Z0-9]{10,})"
   ]
  },
  {
   "key": "pinterest",
   "name": "Pinterest Tag",
   "category": "advertising",
   "patterns": [
    "s\\.pinimg\\.com/ct/core\\.js",
    "\\bpintrk\\s*\\(",
    "ct\\.pinterest\\.com"
   ],
   "id_patterns": [
    "pintrk\\(\\s*[\"\\']load[\"\\']\\s*,\\s*[\"\\'](\\d{10,16})"
   ]
  },
  {
   "key": "twitter",
   "name": "X / Twitter Pixel",
   "category": "advertising",
   "patterns": [
    "static\\.ads-twitter\\.com/uwt\\.js",
    "\\btwq\\s*\\(",
    "t\\.co/i/adsct"
   ],
   "id_patterns": [
    "twq\\(\\s*[\"\\'](?:config|init)[\"\\']\\s*,\\s*[\"\\']([a-z0-9]{5,8})"
   ]
  },
  {
   "key": "snapchat",
   "name": "Snap Pixel",
   "category": "advertising",
   "patterns": [
    "sc-static\\.net/scevent",
    "\\bsnaptr\\s*\\("
   ],
   "id_patterns": [
    "snaptr\\(\\s*['\\\"]init['\\\"]\\s*,\\s*['\\\"]([a-f0-9-]{36})"
   ]
  },
  {
   "key": "reddit",
   "name": "Reddit Pixel",
   "category": "advertising",
   "patterns": [
    "redditstatic\\.com/ads/pixel\\.js",
    "\\brdt\\s*\\("
   ],
   "id_patterns": [
    "rdt\\(\\s*['\\\"]init['\\\"]\\s*,\\s*['\\\"](t2?_[a-z0-9]+)"
   ]
  },
  {
   "key": "bing_uet",
   "name": "Microsoft Ads UET (Bing)",
   "category": "advertising",
   "patterns": [
    "bat\\.bing\\.com/bat\\.js",
    "\\buetq\\b"
   ],
   "id_patterns": [
    "\"ti\"\\s*:\\s*\"?(\\d{7,9})",
    "ti:\\s*[\"\\'](\\d{7,9})"
   ]
  },
  {
   "key": "criteo",
   "name": "Criteo",
   "category": "advertising",
   "patterns": [
    "static\\.criteo\\.net"
   ],
   "id_patterns": []
  },
  {
   "key": "taboola",
   "name": "Taboola",
   "category": "advertising",
   "patterns": [
    "cdn\\.taboola\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "outbrain",
   "name": "Outbrain",
   "category": "advertising",
   "patterns": [
    "outbrain\\.com/outrank",
    "amplify\\.outbrain\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "amazon_ads",
   "name": "Amazon Ads",
   "category": "advertising",
   "patterns": [
    "amazon-adsystem\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "adroll",
   "name": "AdRoll",
   "category": "advertising",
   "patterns": [
    "s\\.adroll\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "gads_syndication",
   "name": "Google AdSense",
   "category": "advertising",
   "patterns": [
    "pagead2\\.googlesyndication\\.com/pagead/js/adsbygoogle"
   ],
   "id_patterns": [
    "(ca-pub-\\d{10,20})"
   ]
  },
  {
   "key": "fullstory",
   "name": "FullStory",
   "category": "session_recording",
   "patterns": [
    "fullstory\\.com/s/fs\\.js",
    "\\b_fs_org\\b"
   ],
   "id_patterns": []
  },
  {
   "key": "luckyorange",
   "name": "Lucky Orange",
   "category": "session_recording",
   "patterns": [
    "luckyorange\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "mouseflow",
   "name": "Mouseflow",
   "category": "session_recording",
   "patterns": [
    "cdn\\.mouseflow\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "smartlook",
   "name": "Smartlook",
   "category": "session_recording",
   "patterns": [
    "web-sdk\\.smartlook\\.com",
    "rec\\.smartlook\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "inspectlet",
   "name": "Inspectlet",
   "category": "session_recording",
   "patterns": [
    "cdn\\.inspectlet\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "crazyegg",
   "name": "Crazy Egg",
   "category": "session_recording",
   "patterns": [
    "script\\.crazyegg\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "vwo",
   "name": "VWO (Visual Website Optimizer)",
   "category": "session_recording",
   "patterns": [
    "dev\\.visualwebsiteoptimizer\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "optimizely",
   "name": "Optimizely",
   "category": "session_recording",
   "patterns": [
    "cdn\\.optimizely\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "intercom",
   "name": "Intercom",
   "category": "chat",
   "patterns": [
    "widget\\.intercom\\.io",
    "\\bIntercom\\(",
    "intercomSettings"
   ],
   "id_patterns": [
    "app_id\\s*[:=]\\s*[\"\\']([a-z0-9]{6,12})"
   ]
  },
  {
   "key": "drift",
   "name": "Drift",
   "category": "chat",
   "patterns": [
    "js\\.driftt\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "zendesk",
   "name": "Zendesk (chat/widget)",
   "category": "chat",
   "patterns": [
    "static\\.zdassets\\.com",
    "zopim"
   ],
   "id_patterns": []
  },
  {
   "key": "tawk",
   "name": "Tawk.to",
   "category": "chat",
   "patterns": [
    "embed\\.tawk\\.to"
   ],
   "id_patterns": [
    "embed\\.tawk\\.to/([a-f0-9]{15,32})"
   ]
  },
  {
   "key": "crisp",
   "name": "Crisp Chat",
   "category": "chat",
   "patterns": [
    "client\\.crisp\\.chat",
    "CRISP_WEBSITE_ID"
   ],
   "id_patterns": [
    "CRISP_WEBSITE_ID\\s*=\\s*[\"\\']([a-f0-9-]{36})"
   ]
  },
  {
   "key": "livechat",
   "name": "LiveChat",
   "category": "chat",
   "patterns": [
    "cdn\\.livechatinc\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "tidio",
   "name": "Tidio",
   "category": "chat",
   "patterns": [
    "code\\.tidio\\.co"
   ],
   "id_patterns": []
  },
  {
   "key": "fb_chat",
   "name": "Messenger Customer Chat",
   "category": "chat",
   "patterns": [
    "xfbml\\.customerchat"
   ],
   "id_patterns": []
  },
  {
   "key": "hubspot",
   "name": "HubSpot",
   "category": "email_marketing",
   "patterns": [
    "js\\.hs-scripts\\.com",
    "js\\.hsforms\\.net",
    "track\\.hubspot\\.com"
   ],
   "id_patterns": [
    "js\\.hs-scripts\\.com/(\\d{6,9})\\.js"
   ]
  },
  {
   "key": "klaviyo",
   "name": "Klaviyo",
   "category": "email_marketing",
   "patterns": [
    "static\\.klaviyo\\.com",
    "klaviyo\\.js"
   ],
   "id_patterns": [
    "company_id=([A-Za-z0-9]{6})"
   ]
  },
  {
   "key": "mailchimp",
   "name": "Mailchimp",
   "category": "email_marketing",
   "patterns": [
    "chimpstatic\\.com",
    "list-manage\\.com",
    "mcjs"
   ],
   "id_patterns": []
  },
  {
   "key": "activecampaign",
   "name": "ActiveCampaign",
   "category": "email_marketing",
   "patterns": [
    "trackcmp\\.net",
    "activehosted\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "pardot",
   "name": "Salesforce Account Engagement (Pardot)",
   "category": "email_marketing",
   "patterns": [
    "pi\\.pardot\\.com",
    "pardot\\.com/pd\\.js"
   ],
   "id_patterns": []
  },
  {
   "key": "marketo",
   "name": "Marketo (Munchkin)",
   "category": "email_marketing",
   "patterns": [
    "munchkin\\.js",
    "mktoresp",
    "marketo\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "brevo",
   "name": "Brevo (Sendinblue)",
   "category": "email_marketing",
   "patterns": [
    "sibautomation\\.com",
    "sendinblue\\.com/js"
   ],
   "id_patterns": []
  },
  {
   "key": "omnisend",
   "name": "Omnisend",
   "category": "email_marketing",
   "patterns": [
    "omnisnippet",
    "omnisend\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "convertkit",
   "name": "Kit (ConvertKit)",
   "category": "email_marketing",
   "patterns": [
    "convertkit\\.com",
    "ck\\.page"
   ],
   "id_patterns": []
  },
  {
   "key": "campaignmonitor",
   "name": "Campaign Monitor",
   "category": "email_marketing",
   "patterns": [
    "createsend1?\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "callrail",
   "name": "CallRail",
   "category": "call_tracking",
   "patterns": [
    "cdn\\.callrail\\.com",
    "callrail\\.com/companies"
   ],
   "id_patterns": []
  },
  {
   "key": "whatconverts",
   "name": "WhatConverts",
   "category": "call_tracking",
   "patterns": [
    "scripts\\.iconnode\\.com",
    "whatconverts"
   ],
   "id_patterns": []
  },
  {
   "key": "ctm",
   "name": "CallTrackingMetrics",
   "category": "call_tracking",
   "patterns": [
    "tctm\\.co/t\\.js",
    "calltrackingmetrics"
   ],
   "id_patterns": []
  },
  {
   "key": "delacon",
   "name": "Delacon (AU call tracking)",
   "category": "call_tracking",
   "patterns": [
    "plavxml\\.com",
    "delaconcorp"
   ],
   "id_patterns": []
  },
  {
   "key": "wildjar",
   "name": "WildJar (AU call tracking)",
   "category": "call_tracking",
   "patterns": [
    "wildjar\\.com",
    "t\\.wldjr\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "cookiebot",
   "name": "Cookiebot",
   "category": "consent",
   "patterns": [
    "consent\\.cookiebot\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "onetrust",
   "name": "OneTrust",
   "category": "consent",
   "patterns": [
    "cdn\\.cookielaw\\.org",
    "onetrust"
   ],
   "id_patterns": []
  },
  {
   "key": "cookieyes",
   "name": "CookieYes",
   "category": "consent",
   "patterns": [
    "cdn-cookieyes\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "complianz",
   "name": "Complianz (WP)",
   "category": "consent",
   "patterns": [
    "complianz",
    "cmplz"
   ],
   "id_patterns": []
  },
  {
   "key": "termly",
   "name": "Termly",
   "category": "consent",
   "patterns": [
    "app\\.termly\\.io"
   ],
   "id_patterns": []
  },
  {
   "key": "recaptcha",
   "name": "Google reCAPTCHA",
   "category": "security",
   "patterns": [
    "google\\.com/recaptcha",
    "gstatic\\.com/recaptcha"
   ],
   "id_patterns": []
  },
  {
   "key": "hcaptcha",
   "name": "hCaptcha",
   "category": "security",
   "patterns": [
    "hcaptcha\\.com/1/api\\.js"
   ],
   "id_patterns": []
  },
  {
   "key": "trustpilot",
   "name": "Trustpilot widget",
   "category": "widget",
   "patterns": [
    "widget\\.trustpilot\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "elfsight",
   "name": "Elfsight widgets",
   "category": "widget",
   "patterns": [
    "apps\\.elfsight\\.com",
    "elfsightcdn\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "judgeme",
   "name": "Judge.me reviews",
   "category": "widget",
   "patterns": [
    "cdn\\.judge\\.me"
   ],
   "id_patterns": []
  },
  {
   "key": "yotpo",
   "name": "Yotpo reviews",
   "category": "widget",
   "patterns": [
    "staticw2\\.yotpo\\.com",
    "yotpo\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "gmaps_embed",
   "name": "Google Maps embed",
   "category": "widget",
   "patterns": [
    "google\\.com/maps/embed",
    "maps\\.googleapis\\.com/maps/api"
   ],
   "id_patterns": []
  },
  {
   "key": "calendly",
   "name": "Calendly",
   "category": "widget",
   "patterns": [
    "assets\\.calendly\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "stripe",
   "name": "Stripe",
   "category": "payments",
   "patterns": [
    "js\\.stripe\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "paypal",
   "name": "PayPal",
   "category": "payments",
   "patterns": [
    "paypal\\.com/sdk/js",
    "paypalobjects\\.com"
   ],
   "id_patterns": []
  },
  {
   "key": "afterpay",
   "name": "Afterpay",
   "category": "payments",
   "patterns": [
    "portal\\.afterpay\\.com",
    "afterpay\\.js"
   ],
   "id_patterns": []
  }
 ],
 "verifications": [
  [
   "google-site-verification",
   "Google Search Console"
  ],
  [
   "facebook-domain-verification",
   "Meta Business Manager"
  ],
  [
   "msvalidate.01",
   "Bing Webmaster Tools"
  ],
  [
   "p:domain_verify",
   "Pinterest"
  ],
  [
   "yandex-verification",
   "Yandex Webmaster"
  ],
  [
   "baidu-site-verification",
   "Baidu Webmaster"
  ],
  [
   "ahrefs-site-verification",
   "Ahrefs Webmaster Tools"
  ],
  [
   "wot-verification",
   "WOT"
  ],
  [
   "norton-safeweb-site-verification",
   "Norton Safe Web"
  ]
 ],
 "categories": {
  "tag_manager": "Tag Managers",
  "analytics": "Analytics",
  "advertising": "Advertising & Pixels",
  "session_recording": "Session Recording & CRO",
  "chat": "Chat & Support",
  "email_marketing": "Email Marketing & CRM",
  "call_tracking": "Call Tracking",
  "consent": "Consent & Privacy",
  "verification": "Site Verifications",
  "widget": "Widgets & Embeds",
  "security": "Security / CAPTCHA",
  "payments": "Payments"
 },
 "socials": {
  "facebook.com": "Facebook",
  "instagram.com": "Instagram",
  "linkedin.com": "LinkedIn",
  "x.com": "X (Twitter)",
  "twitter.com": "X (Twitter)",
  "youtube.com": "YouTube",
  "tiktok.com": "TikTok",
  "pinterest.com": "Pinterest",
  "pinterest.com.au": "Pinterest",
  "threads.net": "Threads",
  "threads.com": "Threads",
  "wa.me": "WhatsApp",
  "api.whatsapp.com": "WhatsApp",
  "snapchat.com": "Snapchat",
  "medium.com": "Medium",
  "github.com": "GitHub",
  "vimeo.com": "Vimeo",
  "behance.net": "Behance",
  "dribbble.com": "Dribbble",
  "houzz.com.au": "Houzz",
  "houzz.com": "Houzz"
 },
 "securityHeaders": [
  [
   "strict-transport-security",
   "HSTS"
  ],
  [
   "content-security-policy",
   "CSP"
  ],
  [
   "x-content-type-options",
   "X-Content-Type-Options"
  ],
  [
   "x-frame-options",
   "X-Frame-Options"
  ],
  [
   "referrer-policy",
   "Referrer-Policy"
  ],
  [
   "permissions-policy",
   "Permissions-Policy"
  ]
 ],
 "wordpressDetails": [
  [
   "elementor",
   "Builder: Elementor"
  ],
  [
   "et_pb_|/themes/Divi/|et-core|et_divi|id=\"et-boc|class=\"et_pb",
   "Builder: Divi"
  ],
  [
   "fl-builder",
   "Builder: Beaver Builder"
  ],
  [
   "wpbakery|js_composer",
   "Builder: WPBakery"
  ],
  [
   "oxygen[_-]",
   "Builder: Oxygen"
  ],
  [
   "bricks[/-]",
   "Builder: Bricks"
  ],
  [
   "This site is optimized with the Yoast|yoast-schema-graph",
   "SEO plugin: Yoast"
  ],
  [
   "Rank Math",
   "SEO plugin: RankMath"
  ],
  [
   "seopress",
   "SEO plugin: SEOPress"
  ],
  [
   "aioseo",
   "SEO plugin: All in One SEO"
  ],
  [
   "WP Rocket",
   "Cache: WP Rocket"
  ],
  [
   "litespeed-cache|LiteSpeed Cache",
   "Cache: LiteSpeed"
  ],
  [
   "w3tc|W3 Total Cache",
   "Cache: W3 Total Cache"
  ],
  [
   "wp-optimize",
   "Cache: WP-Optimize"
  ],
  [
   "woocommerce",
   "WooCommerce store"
  ],
  [
   "wpml|polylang",
   "Multilingual plugin"
  ],
  [
   "gravityforms|gform",
   "Forms: Gravity Forms"
  ],
  [
   "wpforms",
   "Forms: WPForms"
  ],
  [
   "contact-form-7|wpcf7",
   "Forms: Contact Form 7"
  ]
 ],
 "frameworks": [
  [
   "__NEXT_DATA__|/_next/",
   "Next.js"
  ],
  [
   "__NUXT__|/_nuxt/",
   "Nuxt"
  ],
  [
   "___gatsby",
   "Gatsby"
  ],
  [
   "data-reactroot|react-dom",
   "React"
  ],
  [
   "\\bng-version=",
   "Angular"
  ],
  [
   "data-v-app|__vue",
   "Vue"
  ],
  [
   "astro-island|astro/client",
   "Astro"
  ],
  [
   "data-svelte",
   "Svelte"
  ],
  [
   "livewire",
   "Laravel Livewire"
  ]
 ]
};
  if (typeof module !== "undefined" && module.exports) module.exports = catalogue;
  root.SEO_CATALOGUE = catalogue;
})(typeof globalThis !== "undefined" ? globalThis : this);
