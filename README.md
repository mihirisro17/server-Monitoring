<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Server Monitoring Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet"/>
<style>
  :root {
    --bg: #080c14;
    --bg2: #0d1420;
    --bg3: #111827;
    --surface: #141e2e;
    --surface2: #1a2540;
    --border: rgba(56,189,248,0.12);
    --border2: rgba(56,189,248,0.25);
    --accent: #38bdf8;
    --accent2: #818cf8;
    --accent3: #34d399;
    --accent4: #fb923c;
    --danger: #f87171;
    --text: #e2e8f0;
    --text2: #94a3b8;
    --text3: #475569;
    --glow: rgba(56,189,248,0.15);
    --glow2: rgba(129,140,248,0.12);
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{
    background:var(--bg);
    color:var(--text);
    font-family:'Syne',sans-serif;
    overflow-x:hidden;
    line-height:1.6;
  }
  code,pre,kbd{font-family:'JetBrains Mono',monospace}

  /* === CANVAS === */
  #particles{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0.5}

  /* === GRID LINES === */
  .grid-bg{
    position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;
    background-image:
      linear-gradient(rgba(56,189,248,0.03) 1px,transparent 1px),
      linear-gradient(90deg,rgba(56,189,248,0.03) 1px,transparent 1px);
    background-size:60px 60px;
  }

  /* === LAYOUT === */
  .container{max-width:1100px;margin:0 auto;padding:0 2rem;position:relative;z-index:1}

  /* === HERO === */
  .hero{
    min-height:100vh;display:flex;flex-direction:column;align-items:center;
    justify-content:center;text-align:center;padding:6rem 2rem 4rem;
    position:relative;
  }
  .hero-badge{
    display:inline-flex;align-items:center;gap:8px;
    border:1px solid var(--border2);
    background:rgba(56,189,248,0.06);
    color:var(--accent);
    font-size:0.75rem;font-family:'JetBrains Mono',monospace;letter-spacing:0.1em;
    padding:6px 16px;border-radius:100px;margin-bottom:2rem;
    animation:fadeSlideDown 0.8s ease forwards;opacity:0;
  }
  .hero-badge::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse-dot 2s infinite}
  @keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.7)}}

  .hero-title{
    font-size:clamp(2.8rem,7vw,5.5rem);
    font-weight:800;line-height:1.05;letter-spacing:-0.03em;
    margin-bottom:1.5rem;
    animation:fadeSlideDown 0.8s 0.2s ease forwards;opacity:0;
  }
  .hero-title .line1{display:block;color:var(--text)}
  .hero-title .line2{
    display:block;
    background:linear-gradient(135deg,var(--accent) 0%,var(--accent2) 50%,var(--accent3) 100%);
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
    background-size:200%;animation:shimmer 4s linear infinite;
  }
  @keyframes shimmer{0%{background-position:0%}100%{background-position:200%}}

  .hero-desc{
    max-width:640px;font-size:1.1rem;color:var(--text2);line-height:1.8;
    animation:fadeSlideDown 0.8s 0.4s ease forwards;opacity:0;
    margin-bottom:2.5rem;
  }

  @keyframes fadeSlideDown{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:none}}
  @keyframes fadeSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}

  .hero-badges{
    display:flex;flex-wrap:wrap;gap:10px;justify-content:center;
    animation:fadeSlideUp 0.8s 0.6s ease forwards;opacity:0;margin-bottom:3rem;
  }
  .badge{
    display:inline-flex;align-items:center;gap:6px;
    font-size:0.72rem;font-family:'JetBrains Mono',monospace;letter-spacing:0.05em;
    padding:5px 12px;border-radius:6px;border:1px solid;font-weight:600;
    transition:transform 0.2s,box-shadow 0.2s;
  }
  .badge:hover{transform:translateY(-2px)}
  .badge-blue{background:rgba(56,189,248,0.08);border-color:rgba(56,189,248,0.3);color:var(--accent)}
  .badge-purple{background:rgba(129,140,248,0.08);border-color:rgba(129,140,248,0.3);color:var(--accent2)}
  .badge-green{background:rgba(52,211,153,0.08);border-color:rgba(52,211,153,0.3);color:var(--accent3)}
  .badge-orange{background:rgba(251,146,60,0.08);border-color:rgba(251,146,60,0.3);color:var(--accent4)}
  .badge-red{background:rgba(248,113,113,0.08);border-color:rgba(248,113,113,0.3);color:var(--danger)}

  .hero-cta{
    display:flex;gap:12px;flex-wrap:wrap;justify-content:center;
    animation:fadeSlideUp 0.8s 0.8s ease forwards;opacity:0;
  }
  .btn{
    padding:12px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;
    font-family:'Syne',sans-serif;cursor:pointer;text-decoration:none;
    transition:all 0.25s;display:inline-flex;align-items:center;gap:8px;
    position:relative;overflow:hidden;
  }
  .btn::after{
    content:'';position:absolute;inset:0;
    background:linear-gradient(rgba(255,255,255,0.08),transparent);
    opacity:0;transition:opacity 0.2s;
  }
  .btn:hover::after{opacity:1}
  .btn-primary{
    background:linear-gradient(135deg,var(--accent),var(--accent2));
    color:#080c14;border:none;
    box-shadow:0 0 30px rgba(56,189,248,0.25);
  }
  .btn-primary:hover{transform:translateY(-2px);box-shadow:0 0 50px rgba(56,189,248,0.4)}
  .btn-secondary{
    background:transparent;color:var(--text);
    border:1px solid var(--border2);
  }
  .btn-secondary:hover{background:var(--surface);transform:translateY(-2px)}

  /* === STATS STRIP === */
  .stats-strip{
    position:relative;z-index:1;
    border-top:1px solid var(--border);border-bottom:1px solid var(--border);
    background:var(--surface);padding:2rem 0;
    overflow:hidden;
  }
  .stats-strip::before{
    content:'';position:absolute;left:-50%;top:0;width:200%;height:100%;
    background:linear-gradient(90deg,transparent,rgba(56,189,248,0.04),transparent);
    animation:sweep 4s linear infinite;
  }
  @keyframes sweep{from{transform:translateX(-50%)}to{transform:translateX(50%)}}
  .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0}
  .stat-item{
    text-align:center;padding:1rem 1.5rem;
    border-right:1px solid var(--border);
    position:relative;
  }
  .stat-item:last-child{border-right:none}
  .stat-num{
    font-size:2.2rem;font-weight:800;line-height:1;
    font-family:'JetBrains Mono',monospace;
    background:linear-gradient(135deg,var(--accent),var(--accent2));
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  }
  .stat-label{font-size:0.75rem;color:var(--text3);letter-spacing:0.08em;margin-top:4px;text-transform:uppercase}

  /* === SECTION === */
  section{padding:6rem 0;position:relative;z-index:1}
  .section-tag{
    display:inline-flex;align-items:center;gap:8px;
    font-size:0.7rem;font-family:'JetBrains Mono',monospace;
    color:var(--accent);letter-spacing:0.15em;text-transform:uppercase;
    margin-bottom:1rem;
  }
  .section-tag::before{content:'//';opacity:0.5}
  .section-title{font-size:clamp(1.8rem,4vw,2.8rem);font-weight:800;line-height:1.1;letter-spacing:-0.02em;margin-bottom:1rem}
  .section-sub{font-size:1rem;color:var(--text2);max-width:520px;line-height:1.7}

  /* === FEATURES === */
  .features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1px;margin-top:4rem;background:var(--border)}
  .feature-card{
    background:var(--bg);padding:2.5rem;
    position:relative;overflow:hidden;
    transition:background 0.3s;
  }
  .feature-card::before{
    content:'';position:absolute;inset:0;
    background:radial-gradient(circle at 0 0,var(--glow),transparent 60%);
    opacity:0;transition:opacity 0.4s;
  }
  .feature-card:hover{background:var(--surface)}
  .feature-card:hover::before{opacity:1}
  .feature-icon{
    width:48px;height:48px;border-radius:10px;
    display:flex;align-items:center;justify-content:center;
    font-size:1.4rem;margin-bottom:1.5rem;
    position:relative;
  }
  .fi-blue{background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.2)}
  .fi-purple{background:rgba(129,140,248,0.12);border:1px solid rgba(129,140,248,0.2)}
  .fi-green{background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.2)}
  .fi-orange{background:rgba(251,146,60,0.12);border:1px solid rgba(251,146,60,0.2)}
  .fi-red{background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.2)}
  .fi-cyan{background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.2)}
  .feature-title{font-size:1.15rem;font-weight:700;margin-bottom:0.75rem}
  .feature-desc{font-size:0.88rem;color:var(--text2);line-height:1.7}
  .feature-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:1rem}
  .ftag{font-size:0.68rem;font-family:'JetBrains Mono',monospace;padding:3px 8px;border-radius:4px;background:var(--surface2);color:var(--text3);border:1px solid var(--border)}

  /* === TERMINAL === */
  .terminal{
    background:#060a10;border:1px solid var(--border2);
    border-radius:12px;overflow:hidden;
    box-shadow:0 0 60px rgba(56,189,248,0.08),0 0 120px rgba(56,189,248,0.04);
    margin-top:4rem;
    position:relative;
  }
  .terminal::before{
    content:'';position:absolute;inset:-1px;border-radius:12px;
    background:linear-gradient(135deg,rgba(56,189,248,0.15),transparent 40%,rgba(129,140,248,0.1));
    z-index:-1;
  }
  .terminal-bar{
    background:#0d1117;padding:12px 16px;
    display:flex;align-items:center;gap:8px;
    border-bottom:1px solid var(--border);
  }
  .dot{width:12px;height:12px;border-radius:50%}
  .dot-red{background:#f87171}
  .dot-yellow{background:#fbbf24}
  .dot-green{background:#34d399}
  .terminal-title{font-size:0.75rem;font-family:'JetBrains Mono',monospace;color:var(--text3);margin-left:auto}
  .terminal-body{padding:2rem;font-family:'JetBrains Mono',monospace;font-size:0.82rem;line-height:2}
  .tc-dim{color:#4a5568}
  .tc-prompt{color:var(--accent3)}
  .tc-cmd{color:var(--text)}
  .tc-comment{color:#4a5568;font-style:italic}
  .tc-output{color:var(--accent2)}
  .tc-success{color:var(--accent3)}
  .tc-url{color:var(--accent);text-decoration:underline}
  .tc-warn{color:var(--accent4)}

  /* === HOW IT WORKS === */
  .flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0;margin-top:4rem;position:relative}
  .flow::before{
    content:'';position:absolute;top:40px;left:0;right:0;height:1px;
    background:linear-gradient(90deg,transparent,var(--border2),var(--border2),var(--border2),transparent);
    z-index:0;
  }
  .flow-step{text-align:center;padding:0 1.5rem;position:relative;z-index:1}
  .flow-num{
    width:80px;height:80px;border-radius:50%;margin:0 auto 1.5rem;
    display:flex;align-items:center;justify-content:center;
    font-size:1.5rem;font-family:'JetBrains Mono',monospace;font-weight:700;
    border:2px solid var(--accent);color:var(--accent);
    background:var(--bg);
    box-shadow:0 0 30px rgba(56,189,248,0.15);
    animation:orbit-glow 4s ease-in-out infinite;
  }
  .flow-step:nth-child(2) .flow-num{animation-delay:-1s;border-color:var(--accent2);color:var(--accent2);box-shadow:0 0 30px rgba(129,140,248,0.15)}
  .flow-step:nth-child(3) .flow-num{animation-delay:-2s;border-color:var(--accent3);color:var(--accent3);box-shadow:0 0 30px rgba(52,211,153,0.15)}
  .flow-step:nth-child(4) .flow-num{animation-delay:-3s;border-color:var(--accent4);color:var(--accent4);box-shadow:0 0 30px rgba(251,146,60,0.15)}
  @keyframes orbit-glow{0%,100%{box-shadow:0 0 20px currentColor}50%{box-shadow:0 0 40px currentColor,0 0 60px currentColor}}
  .flow-title{font-weight:700;margin-bottom:0.5rem;font-size:0.95rem}
  .flow-desc{font-size:0.82rem;color:var(--text2);line-height:1.6}

  /* === API TABLE === */
  .api-table-wrap{margin-top:3rem;border:1px solid var(--border);border-radius:12px;overflow:hidden}
  table{width:100%;border-collapse:collapse}
  th{
    background:var(--surface2);padding:12px 16px;text-align:left;
    font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text3);
    font-family:'JetBrains Mono',monospace;border-bottom:1px solid var(--border);
  }
  td{padding:12px 16px;font-size:0.85rem;border-bottom:1px solid var(--border);vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tr{transition:background 0.15s}
  tr:hover td{background:var(--surface)}
  .method{
    font-family:'JetBrains Mono',monospace;font-size:0.72rem;font-weight:700;
    padding:3px 8px;border-radius:4px;
  }
  .m-get{background:rgba(52,211,153,0.12);color:var(--accent3);border:1px solid rgba(52,211,153,0.2)}
  .m-post{background:rgba(251,146,60,0.12);color:var(--accent4);border:1px solid rgba(251,146,60,0.2)}
  .ep{font-family:'JetBrains Mono',monospace;font-size:0.82rem;color:var(--accent)}

  /* === ALERT TABLE === */
  .alert-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin-top:3rem;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden}
  .alert-cell{background:var(--bg);padding:2rem;text-align:center}
  .alert-metric{font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text3);font-family:'JetBrains Mono',monospace;margin-bottom:1rem}
  .alert-warning{
    font-size:2rem;font-weight:800;font-family:'JetBrains Mono',monospace;
    color:var(--accent4);text-shadow:0 0 20px rgba(251,146,60,0.4);
  }
  .alert-critical{
    font-size:2rem;font-weight:800;font-family:'JetBrains Mono',monospace;
    color:var(--danger);text-shadow:0 0 20px rgba(248,113,113,0.4);
    animation:blink-num 2s ease-in-out infinite;
  }
  @keyframes blink-num{0%,100%{opacity:1}50%{opacity:0.5}}
  .alert-label-row{display:flex;gap:1rem;justify-content:center;margin-top:0.5rem}
  .alert-chip{font-size:0.7rem;font-family:'JetBrains Mono',monospace;padding:3px 10px;border-radius:4px}
  .chip-warn{background:rgba(251,146,60,0.1);color:var(--accent4)}
  .chip-crit{background:rgba(248,113,113,0.1);color:var(--danger)}

  /* === STRUCTURE === */
  .file-tree{
    background:#060a10;border:1px solid var(--border);border-radius:12px;
    padding:2rem;font-family:'JetBrains Mono',monospace;font-size:0.82rem;
    line-height:2;margin-top:3rem;
    position:relative;overflow:hidden;
  }
  .file-tree::after{
    content:'';position:absolute;right:0;top:0;bottom:0;width:4px;
    background:linear-gradient(180deg,var(--accent),var(--accent2),var(--accent3));
    border-radius:0 12px 12px 0;
  }
  .ft-dir{color:var(--accent2);font-weight:600}
  .ft-file{color:var(--text2)}
  .ft-comment{color:var(--text3);font-style:italic}
  .ft-indent{color:var(--border2)}

  /* === AUTHOR === */
  .author-section{
    border-top:1px solid var(--border);
    background:var(--surface);
    padding:5rem 0;text-align:center;
    position:relative;overflow:hidden;
  }
  .author-section::before{
    content:'';position:absolute;top:-100px;left:50%;transform:translateX(-50%);
    width:600px;height:300px;
    background:radial-gradient(ellipse,rgba(56,189,248,0.06),transparent 70%);
  }
  .author-avatar{
    width:80px;height:80px;border-radius:50%;margin:0 auto 1.5rem;
    background:linear-gradient(135deg,var(--accent),var(--accent2));
    display:flex;align-items:center;justify-content:center;
    font-size:1.8rem;font-weight:800;color:#080c14;
    box-shadow:0 0 40px rgba(56,189,248,0.3);
    animation:float 4s ease-in-out infinite;
  }
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
  .author-name{font-size:1.5rem;font-weight:800;margin-bottom:0.25rem}
  .author-org{font-size:0.85rem;color:var(--text2);margin-bottom:2rem}
  .tech-stack{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:2rem}
  .tech-chip{
    display:inline-flex;align-items:center;gap:6px;
    font-size:0.75rem;font-family:'JetBrains Mono',monospace;
    padding:6px 14px;border-radius:6px;
    border:1px solid var(--border2);
    background:var(--bg);color:var(--text2);
    transition:all 0.2s;
  }
  .tech-chip:hover{border-color:var(--accent);color:var(--accent);background:rgba(56,189,248,0.05);transform:translateY(-2px)}

  /* === SCROLL ANIMATE === */
  .reveal{opacity:0;transform:translateY(30px);transition:opacity 0.7s ease,transform 0.7s ease}
  .reveal.visible{opacity:1;transform:none}
  .reveal-left{opacity:0;transform:translateX(-30px);transition:opacity 0.7s ease,transform 0.7s ease}
  .reveal-left.visible{opacity:1;transform:none}

  /* === NAV === */
  nav{
    position:fixed;top:0;left:0;right:0;z-index:100;
    background:rgba(8,12,20,0.85);backdrop-filter:blur(16px);
    border-bottom:1px solid var(--border);
    padding:0 2rem;
    display:flex;align-items:center;justify-content:space-between;height:60px;
  }
  .nav-logo{
    font-family:'JetBrains Mono',monospace;font-size:0.85rem;font-weight:600;
    color:var(--accent);display:flex;align-items:center;gap:8px;
  }
  .nav-logo::before{content:'>';color:var(--accent3)}
  .nav-links{display:flex;gap:2rem}
  .nav-links a{
    font-size:0.82rem;color:var(--text2);text-decoration:none;
    transition:color 0.2s;font-family:'JetBrains Mono',monospace;
  }
  .nav-links a:hover{color:var(--accent)}
  .nav-dot{width:6px;height:6px;border-radius:50%;background:var(--accent3);animation:pulse-dot 2s infinite;margin-left:0.5rem;display:inline-block}

  /* === WHO CMD === */
  .who-demo{
    display:grid;grid-template-columns:1fr 1fr;gap:1px;
    background:var(--border);margin-top:3rem;border-radius:12px;overflow:hidden;
    border:1px solid var(--border);
  }
  .who-pane{background:var(--bg);padding:2rem}
  .who-pane-title{font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text3);font-family:'JetBrains Mono',monospace;margin-bottom:1rem}
  .who-output{font-family:'JetBrains Mono',monospace;font-size:0.8rem;line-height:2}
  .wf1{color:var(--accent3)}
  .wf2{color:var(--text2)}
  .wf3{color:var(--accent)}
  .wf4{color:var(--accent4)}
  .wf-arrow{color:var(--text3);margin:0 6px}

  /* === FILTER TABLE === */
  .filter-table{margin-top:2rem;border:1px solid var(--border);border-radius:12px;overflow:hidden}
  .filter-table th{background:var(--surface)}

  /* === FOOTER === */
  footer{
    background:var(--bg);border-top:1px solid var(--border);
    padding:2rem;text-align:center;
    font-size:0.78rem;font-family:'JetBrains Mono',monospace;color:var(--text3);
  }
  footer span{color:var(--accent)}

  /* === SCROLLBAR === */
  ::-webkit-scrollbar{width:6px}
  ::-webkit-scrollbar-track{background:var(--bg)}
  ::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}

  @media(max-width:768px){
    .nav-links{display:none}
    .flow::before{display:none}
    .flow{gap:2rem}
    .who-demo{grid-template-columns:1fr}
    .alert-grid{grid-template-columns:1fr}
  }
</style>
</head>
<body>

<canvas id="particles"></canvas>
<div class="grid-bg"></div>

<!-- NAV -->
<nav>
  <div class="nav-logo">server_monitor<span class="nav-dot"></span></div>
  <div class="nav-links">
    <a href="#features">Features</a>
    <a href="#install">Install</a>
    <a href="#api">API</a>
    <a href="#tracking">Tracking</a>
    <a href="#author">About</a>
  </div>
</nav>

<!-- HERO -->
<section class="hero">
  <div class="hero-badge">MIT License &nbsp;·&nbsp; SAC — Space Applications Centre</div>
  <h1 class="hero-title">
    <span class="line1">Real-Time Server</span>
    <span class="line2">Monitoring Dashboard</span>
  </h1>
  <p class="hero-desc">
    A live SSH-based monitoring and user tracking system built with Flask and Vanilla JS.
    Watch metrics, receive alerts, trace sessions — all from a single elegant dashboard.
  </p>
  <div class="hero-badges">
    <span class="badge badge-blue">Python 3.8+</span>
    <span class="badge badge-blue">Flask 2.3+</span>
    <span class="badge badge-orange">JavaScript ES6+</span>
    <span class="badge badge-green">WebSocket</span>
    <span class="badge badge-purple">Paramiko</span>
    <span class="badge badge-red">SSH Monitoring</span>
    <span class="badge badge-blue">Highcharts</span>
    <span class="badge badge-green">Chart.js</span>
  </div>
  <div class="hero-cta">
    <a href="#install" class="btn btn-primary">⚡ Quick Start</a>
    <a href="#features" class="btn btn-secondary">Explore Features →</a>
  </div>
</section>

<!-- STATS -->
<div class="stats-strip">
  <div class="container">
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-num" data-target="30">0</div><div class="stat-label">Second Poll Interval</div></div>
      <div class="stat-item"><div class="stat-num" data-target="5">0</div><div class="stat-label">Second Live Refresh</div></div>
      <div class="stat-item"><div class="stat-num" data-target="288">0</div><div class="stat-label">24h Data Points</div></div>
      <div class="stat-num-wrap stat-item"><div class="stat-num" data-target="12">0</div><div class="stat-label">API Endpoints</div></div>
      <div class="stat-item"><div class="stat-num" data-target="20">0</div><div class="stat-label">Largest Files Tracked</div></div>
    </div>
  </div>
</div>

<!-- FEATURES -->
<section id="features">
  <div class="container">
    <div class="reveal">
      <div class="section-tag">Features</div>
      <h2 class="section-title">Everything you need.<br/>Nothing you don't.</h2>
      <p class="section-sub">Built for operations teams who need real answers — not just dashboards for show.</p>
    </div>
    <div class="features-grid reveal">
      <div class="feature-card">
        <div class="feature-icon fi-blue">📊</div>
        <div class="feature-title">Real-Time Monitoring</div>
        <div class="feature-desc">Live CPU, Memory, and Storage metrics per server. Auto-refresh every 5 seconds with color-coded status badges and blinking threshold indicators.</div>
        <div class="feature-tags">
          <span class="ftag">CPU</span><span class="ftag">Memory</span><span class="ftag">Storage</span><span class="ftag">5s refresh</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon fi-green">👥</div>
        <div class="feature-title">SSH User Tracking</div>
        <div class="feature-desc">Tracks who is connected, when they logged in, and how long they've been active. IP-to-Name mapping for friendly display. Filters out noise automatically.</div>
        <div class="feature-tags">
          <span class="ftag">who cmd</span><span class="ftag">session time</span><span class="ftag">IP mapping</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon fi-red">🚨</div>
        <div class="feature-title">Alert System</div>
        <div class="feature-desc">Real-time alerts for CPU, Memory, Storage, and Offline events. WebSocket push notifications with Warning and Critical severity levels and trend history.</div>
        <div class="feature-tags">
          <span class="ftag">WebSocket</span><span class="ftag">Warning</span><span class="ftag">Critical</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon fi-purple">📈</div>
        <div class="feature-title">Analytics & History</div>
        <div class="feature-desc">Historical CPU and Memory charts via Highcharts. Per-server comparisons, health scores, and a detailed 24-hour history with 288 data points.</div>
        <div class="feature-tags">
          <span class="ftag">Highcharts</span><span class="ftag">SQLite</span><span class="ftag">24h history</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon fi-orange">🗂️</div>
        <div class="feature-title">Storage Analysis</div>
        <div class="feature-desc">Deep per-partition breakdown. Top 20 largest files and directories. File type distribution charts and Level 1 directory summaries.</div>
        <div class="feature-tags">
          <span class="ftag">Top 20 files</span><span class="ftag">Partitions</span><span class="ftag">File types</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon fi-cyan">🔧</div>
        <div class="feature-title">Server Management</div>
        <div class="feature-desc">View running and failed services, top CPU/Memory processes. Kick SSH users, browse journalctl logs, and inspect network interface stats — all from the UI.</div>
        <div class="feature-tags">
          <span class="ftag">kick user</span><span class="ftag">journalctl</span><span class="ftag">processes</span>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- INSTALL -->
<section id="install" style="background:var(--bg2)">
  <div class="container">
    <div class="reveal">
      <div class="section-tag">Installation</div>
      <h2 class="section-title">Up and running<br/>in under 5 minutes.</h2>
    </div>
    <div class="terminal reveal">
      <div class="terminal-bar">
        <div class="dot dot-red"></div>
        <div class="dot dot-yellow"></div>
        <div class="dot dot-green"></div>
        <div class="terminal-title">bash — server_monitoring</div>
      </div>
      <div class="terminal-body">
        <div><span class="tc-dim"># 1.</span> <span class="tc-comment">Clone the repository</span></div>
        <div><span class="tc-prompt">$</span> <span class="tc-cmd">git clone https://github.com/yourusername/server-monitoring.git</span></div>
        <div><span class="tc-prompt">$</span> <span class="tc-cmd">cd server-monitoring</span></div>
        <br/>
        <div><span class="tc-dim"># 2.</span> <span class="tc-comment">Create and activate virtual environment</span></div>
        <div><span class="tc-prompt">$</span> <span class="tc-cmd">python3 -m venv flask_env</span></div>
        <div><span class="tc-prompt">$</span> <span class="tc-cmd">source flask_env/bin/activate</span></div>
        <br/>
        <div><span class="tc-dim"># 3.</span> <span class="tc-comment">Install Python dependencies</span></div>
        <div><span class="tc-prompt">$</span> <span class="tc-cmd">pip install -r requirements.txt</span></div>
        <br/>
        <div><span class="tc-dim"># 4.</span> <span class="tc-comment">Install sshpass (Ubuntu/Debian)</span></div>
        <div><span class="tc-prompt">$</span> <span class="tc-cmd">sudo apt install sshpass</span></div>
        <br/>
        <div><span class="tc-dim"># 5.</span> <span class="tc-comment">Configure your servers in config.py, then run</span></div>
        <div><span class="tc-prompt">$</span> <span class="tc-cmd">python run.py</span></div>
        <br/>
        <div><span class="tc-success">✓  Server started successfully</span></div>
        <div><span class="tc-success">✓  Background tracking thread active</span></div>
        <div><span class="tc-success">✓  WebSocket alert pusher initialized</span></div>
        <br/>
        <div><span class="tc-dim">Open: </span><span class="tc-url">http://127.0.0.1:5011/monitoring_server/home</span></div>
      </div>
    </div>

    <div style="margin-top:3rem;display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden" class="reveal">
      <div style="background:var(--bg);padding:2rem">
        <div class="who-pane-title">config.py — Server Configuration</div>
        <pre style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:var(--text2);line-height:1.8"><span style="color:#818cf8">class</span> <span style="color:#38bdf8">Config</span>:
  SERVER_GROUPS = {
    <span style="color:#34d399">"gpu"</span>: [
      {
        <span style="color:#34d399">"name"</span>: <span style="color:#fb923c">"231 - H100 - V1G1"</span>,
        <span style="color:#34d399">"ip"</span>: <span style="color:#fb923c">"192.168.1.231"</span>,
        <span style="color:#34d399">"username"</span>: <span style="color:#fb923c">"your_user"</span>,
        <span style="color:#34d399">"password"</span>: <span style="color:#fb923c">"your_pass"</span>,
        <span style="color:#34d399">"group"</span>: <span style="color:#fb923c">"gpus"</span>
      },
    ],
  }</pre>
      </div>
      <div style="background:var(--bg);padding:2rem">
        <div class="who-pane-title">monitor.js — IP to Name Mapping</div>
        <pre style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:var(--text2);line-height:1.8"><span style="color:#818cf8">const</span> <span style="color:#38bdf8">IP_NAME_MAP</span> = {
  <span style="color:#34d399">"192.168.1.220"</span>: <span style="color:#fb923c">"Harish"</span>,
  <span style="color:#34d399">"192.168.1.141"</span>: <span style="color:#fb923c">"Vikrant"</span>,
  <span style="color:#34d399">"192.168.1.221"</span>: <span style="color:#fb923c">"Karnav"</span>,
  <span style="color:#34d399">"192.168.1.205"</span>: <span style="color:#fb923c">"Vidit"</span>,
  <span style="color:#34d399">"192.168.1.210"</span>: <span style="color:#fb923c">"Arpan"</span>,
};</pre>
      </div>
    </div>
  </div>
</section>

<!-- PROJECT STRUCTURE -->
<section>
  <div class="container">
    <div class="reveal">
      <div class="section-tag">Architecture</div>
      <h2 class="section-title">Project Structure</h2>
    </div>
    <div class="file-tree reveal">
<span class="ft-dir">server_monitoring/</span>
<span class="ft-indent">│</span>
<span class="ft-indent">├── </span><span class="ft-dir">app/</span>
<span class="ft-indent">│   ├── </span><span class="ft-file">__init__.py</span>      <span class="ft-comment">← Flask app factory + background thread start</span>
<span class="ft-indent">│   ├── </span><span class="ft-file">routes.py</span>        <span class="ft-comment">← All API routes and SSH logic</span>
<span class="ft-indent">│   └── </span><span class="ft-file">alert_push.py</span>    <span class="ft-comment">← WebSocket alert pusher</span>
<span class="ft-indent">│</span>
<span class="ft-indent">├── </span><span class="ft-dir">static/</span>
<span class="ft-indent">│   ├── </span><span class="ft-dir">css/</span>
<span class="ft-indent">│   │   └── </span><span class="ft-file">style.css</span>    <span class="ft-comment">← All styles + themes</span>
<span class="ft-indent">│   └── </span><span class="ft-dir">js/</span>
<span class="ft-indent">│       ├── </span><span class="ft-file">monitor.js</span>   <span class="ft-comment">← Main frontend logic</span>
<span class="ft-indent">│       └── </span><span class="ft-dir">lib/</span>         <span class="ft-comment">← Highcharts, Chart.js, etc.</span>
<span class="ft-indent">│</span>
<span class="ft-indent">├── </span><span class="ft-dir">templates/</span>
<span class="ft-indent">│   └── </span><span class="ft-file">index.html</span>       <span class="ft-comment">← Single-page app template</span>
<span class="ft-indent">│</span>
<span class="ft-indent">├── </span><span class="ft-file">config.py</span>            <span class="ft-comment">← Server list and SSH credentials</span>
<span class="ft-indent">├── </span><span class="ft-file">database.py</span>          <span class="ft-comment">← SQLite DB for analytics history</span>
<span class="ft-indent">├── </span><span class="ft-file">run.py</span>               <span class="ft-comment">← App entry point</span>
<span class="ft-indent">├── </span><span class="ft-file">user_tracking.json</span>   <span class="ft-comment">← Auto-generated SSH session store</span>
<span class="ft-indent">└── </span><span class="ft-file">requirements.txt</span>
    </div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section id="tracking" style="background:var(--bg2)">
  <div class="container">
    <div class="reveal">
      <div class="section-tag">Background Thread</div>
      <h2 class="section-title">How SSH Tracking Works</h2>
      <p class="section-sub">A daemon thread runs continuously, polling every server every 30 seconds using native Linux commands.</p>
    </div>
    <div class="flow reveal">
      <div class="flow-step">
        <div class="flow-num">①</div>
        <div class="flow-title">SSH Connect</div>
        <div class="flow-desc">SSHs into each configured server via Paramiko every 30 seconds</div>
      </div>
      <div class="flow-step">
        <div class="flow-num">②</div>
        <div class="flow-title">Run `who`</div>
        <div class="flow-desc">Runs the Linux <code style="color:var(--accent);font-size:0.8em">who</code> command to capture actual login times and terminal info</div>
      </div>
      <div class="flow-step">
        <div class="flow-num">③</div>
        <div class="flow-title">Parse & Store</div>
        <div class="flow-desc">Updates <code style="color:var(--accent);font-size:0.8em">user_tracking.json</code> with parsed session data and timestamps</div>
      </div>
      <div class="flow-step">
        <div class="flow-num">④</div>
        <div class="flow-title">Mark Ended</div>
        <div class="flow-desc">Sessions no longer in <code style="color:var(--accent);font-size:0.8em">who</code> output are marked as ended automatically</div>
      </div>
    </div>

    <!-- WHO DEMO -->
    <div class="who-demo reveal">
      <div class="who-pane">
        <div class="who-pane-title">$ who — Raw Command Output</div>
        <div class="who-output">
          <div><span class="wf1">sac</span><span class="wf-arrow"> </span><span class="wf2">pts/1</span><span class="wf-arrow"> </span><span class="wf3">2026-02-10 11:08</span><span class="wf-arrow"> </span><span class="wf4">(192.168.3.208)</span></div>
          <div><span class="wf1">harish</span><span class="wf-arrow"> </span><span class="wf2">pts/2</span><span class="wf-arrow"> </span><span class="wf3">2026-02-10 09:30</span><span class="wf-arrow"> </span><span class="wf4">(192.168.1.220)</span></div>
          <div><span class="wf1">vikrant</span><span class="wf-arrow"> </span><span class="wf2">pts/3</span><span class="wf-arrow"> </span><span class="wf3">2026-02-10 10:15</span><span class="wf-arrow"> </span><span class="wf4">(192.168.1.141)</span></div>
        </div>
        <div style="margin-top:1.5rem;font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:var(--text3)">
          <div style="color:var(--accent3)">username</div>
          <div style="color:var(--accent)">login time (actual, not poll time)</div>
          <div style="color:var(--accent4)">client IP</div>
        </div>
      </div>
      <div class="who-pane">
        <div class="who-pane-title">user_tracking.json — Parsed Session</div>
        <pre style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;color:var(--text2);line-height:1.8">{
  <span style="color:#38bdf8">"login_time"</span>: <span style="color:#34d399">"2026-02-10T11:08:00"</span>,
  <span style="color:#38bdf8">"first_seen"</span>: <span style="color:#34d399">"2026-02-10T11:08:00"</span>,
  <span style="color:#38bdf8">"last_seen"</span>:  <span style="color:#34d399">"2026-02-10T17:30:00"</span>,
  <span style="color:#38bdf8">"terminal"</span>:  <span style="color:#fb923c">"pts/1"</span>,
  <span style="color:#38bdf8">"logout_time"</span>: <span style="color:#818cf8">null</span>
}

<span style="color:#4a5568">// ⏱ Duration = last_seen − first_seen</span></pre>
      </div>
    </div>

    <!-- FILTERS -->
    <div class="reveal" style="margin-top:3rem">
      <div style="font-size:0.9rem;font-weight:700;margin-bottom:1rem;color:var(--text2)">🚫 Auto-Filtered Sessions</div>
      <div class="filter-table">
        <table>
          <thead>
            <tr><th>Session Type</th><th>Example</th><th>Reason</th></tr>
          </thead>
          <tbody>
            <tr><td>Server-to-server SSH</td><td class="ep">192.168.2.137 → node</td><td style="color:var(--text2)">Not an end user</td></tr>
            <tr><td>Local display sessions</td><td class="ep">:0, :1</td><td style="color:var(--text2)">Physical console, not SSH</td></tr>
            <tr><td>Tmux/Screen sub-sessions</td><td class="ep">:pts/9:S.0</td><td style="color:var(--text2)">Internal multiplexer</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</section>

<!-- ALERTS -->
<section>
  <div class="container">
    <div class="reveal">
      <div class="section-tag">Alert System</div>
      <h2 class="section-title">Threshold Configuration</h2>
      <p class="section-sub">WebSocket-based push notifications the moment thresholds are breached.</p>
    </div>
    <div class="alert-grid reveal">
      <div class="alert-cell">
        <div class="alert-metric">CPU Usage</div>
        <div style="display:flex;gap:2rem;justify-content:center;align-items:baseline">
          <div><div class="alert-warning">75%</div><div style="font-size:0.7rem;color:var(--accent4);margin-top:4px;font-family:'JetBrains Mono',monospace">⚠ WARNING</div></div>
          <div><div class="alert-critical">90%</div><div style="font-size:0.7rem;color:var(--danger);margin-top:4px;font-family:'JetBrains Mono',monospace">🔴 CRITICAL</div></div>
        </div>
      </div>
      <div class="alert-cell">
        <div class="alert-metric">Memory Usage</div>
        <div style="display:flex;gap:2rem;justify-content:center;align-items:baseline">
          <div><div class="alert-warning">75%</div><div style="font-size:0.7rem;color:var(--accent4);margin-top:4px;font-family:'JetBrains Mono',monospace">⚠ WARNING</div></div>
          <div><div class="alert-critical">90%</div><div style="font-size:0.7rem;color:var(--danger);margin-top:4px;font-family:'JetBrains Mono',monospace">🔴 CRITICAL</div></div>
        </div>
      </div>
      <div class="alert-cell">
        <div class="alert-metric">Storage (root)</div>
        <div style="display:flex;gap:2rem;justify-content:center;align-items:baseline">
          <div><div class="alert-warning">80%</div><div style="font-size:0.7rem;color:var(--accent4);margin-top:4px;font-family:'JetBrains Mono',monospace">⚠ WARNING</div></div>
          <div><div class="alert-critical">90%</div><div style="font-size:0.7rem;color:var(--danger);margin-top:4px;font-family:'JetBrains Mono',monospace">🔴 CRITICAL</div></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- API -->
<section id="api" style="background:var(--bg2)">
  <div class="container">
    <div class="reveal">
      <div class="section-tag">API Reference</div>
      <h2 class="section-title">All Endpoints</h2>
    </div>
    <div class="api-table-wrap reveal">
      <table>
        <thead>
          <tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><span class="method m-get">GET</span></td><td class="ep">/api/status</td><td style="color:var(--text2)">All server statuses (cached)</td></tr>
          <tr><td><span class="method m-post">POST</span></td><td class="ep">/api/live_metrics</td><td style="color:var(--text2)">Live metrics for selected servers</td></tr>
          <tr><td><span class="method m-get">GET</span></td><td class="ep">/api/alerts</td><td style="color:var(--text2)">Current alerts</td></tr>
          <tr><td><span class="method m-get">GET</span></td><td class="ep">/api/user_tracking</td><td style="color:var(--text2)">SSH user tracking data</td></tr>
          <tr><td><span class="method m-get">GET</span></td><td class="ep">/api/debug/tracking</td><td style="color:var(--text2)">Raw tracking JSON (debug)</td></tr>
          <tr><td><span class="method m-post">POST</span></td><td class="ep">/api/server_logs</td><td style="color:var(--text2)">Fetch journalctl logs</td></tr>
          <tr><td><span class="method m-post">POST</span></td><td class="ep">/api/kick_ssh</td><td style="color:var(--text2)">Terminate SSH user session</td></tr>
          <tr><td><span class="method m-post">POST</span></td><td class="ep">/api/analyze_storage</td><td style="color:var(--text2)">Deep storage analysis</td></tr>
          <tr><td><span class="method m-get">GET</span></td><td class="ep">/api/server_health_score</td><td style="color:var(--text2)">Server health scores</td></tr>
          <tr><td><span class="method m-get">GET</span></td><td class="ep">/api/alert_trends</td><td style="color:var(--text2)">Alert trend history</td></tr>
          <tr><td><span class="method m-get">GET</span></td><td class="ep">/api/server_comparison</td><td style="color:var(--text2)">Cross-server metric comparison</td></tr>
          <tr><td><span class="method m-get">GET</span></td><td class="ep">/api/test/who/&lt;server&gt;</td><td style="color:var(--text2)">Debug <code style="color:var(--accent3)">who</code> command output</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>

<!-- AUTHOR -->
<div class="author-section" id="author">
  <div class="container">
    <div class="author-avatar reveal">MB</div>
    <div class="author-name reveal">Mihir Bulsara</div>
    <div class="author-org reveal">VEDAS Team · Space Applications Centre (SAC)<br/><span style="color:var(--text3);font-size:0.8rem">Internal GPU &amp; compute server monitoring</span></div>
    <div class="tech-stack reveal">
      <span class="tech-chip">Flask</span>
      <span class="tech-chip">Flask-SocketIO</span>
      <span class="tech-chip">Paramiko</span>
      <span class="tech-chip">Highcharts</span>
      <span class="tech-chip">Chart.js</span>
      <span class="tech-chip">Font Awesome</span>
      <span class="tech-chip">Socket.io</span>
      <span class="tech-chip">SQLite</span>
      <span class="tech-chip">Eventlet</span>
    </div>
  </div>
</div>

<footer>
  <span>server_monitoring</span> · MIT License · Built by Mihir Bulsara · SAC, ISRO
</footer>

<script>
// === PARTICLES ===
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');
let W, H, particles = [];
function resize() { W = canvas.width = innerWidth; H = canvas.height = innerHeight; }
resize(); window.addEventListener('resize', resize);

class P {
  constructor() { this.reset(); }
  reset() {
    this.x = Math.random() * W;
    this.y = Math.random() * H;
    this.r = Math.random() * 1.5 + 0.3;
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = (Math.random() - 0.5) * 0.3;
    this.alpha = Math.random() * 0.5 + 0.1;
    this.color = Math.random() > 0.6 ? '#38bdf8' : Math.random() > 0.5 ? '#818cf8' : '#34d399';
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.reset();
  }
  draw() {
    ctx.save(); ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

for (let i = 0; i < 120; i++) particles.push(new P());

function drawConnections() {
  for (let i = 0; i < particles.length; i++) {
    for (let j = i+1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const d = Math.sqrt(dx*dx+dy*dy);
      if (d < 100) {
        ctx.save();
        ctx.globalAlpha = (1 - d/100) * 0.08;
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}

function animate() {
  ctx.clearRect(0, 0, W, H);
  drawConnections();
  particles.forEach(p => { p.update(); p.draw(); });
  requestAnimationFrame(animate);
}
animate();

// === COUNTER ANIMATION ===
function animateCounter(el, target) {
  let start = 0;
  const dur = 1800;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / dur, 1);
    const ease = 1 - Math.pow(1 - progress, 4);
    el.textContent = Math.floor(ease * target);
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}

// === SCROLL REVEAL ===
const reveals = document.querySelectorAll('.reveal, .reveal-left');
const io = new IntersectionObserver((entries) => {
  entries.forEach((e, i) => {
    if (e.isIntersecting) {
      setTimeout(() => e.target.classList.add('visible'), i * 80);
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });
reveals.forEach(el => io.observe(el));

// === COUNTER TRIGGER ===
const counters = document.querySelectorAll('.stat-num[data-target]');
const cio = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      animateCounter(e.target, parseInt(e.target.dataset.target));
      cio.unobserve(e.target);
    }
  });
}, { threshold: 0.5 });
counters.forEach(c => cio.observe(c));
</script>
</body>
</html>
